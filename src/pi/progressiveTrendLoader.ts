import type { PiPointBinding } from './piPointBinding';
import type {
  PiTrendSeriesResult,
  PiTrendTimeRange,
} from './piDataSource';
import {
  DATA_QUERY_MAX_CONCURRENT_BATCHES,
  DATA_QUERY_MAX_TARGETS,
} from './dataQueryPolicy';
import { getTrendPersistentCache, type TrendPersistentCache } from './trendPersistentCache';

export const TREND_PREVIEW_DURATION_MS = 8 * 60 * 60 * 1000;
export const TREND_PREVIEW_MAX_DATA_POINTS = 250;
export const TREND_REFINED_DEFAULT_MAX_DATA_POINTS = 750;
export const TREND_HISTORY_CACHE_TTL_MS = 4000;
const TREND_CACHE_MAX_ENTRIES = 128;

export interface TrendLoadOptions {
  maxDataPoints?: number;
}

export type QueryTrendRange = (
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  options?: TrendLoadOptions,
) => Promise<Record<string, PiTrendSeriesResult>>;

export type PublishTrendResults = (results: Record<string, PiTrendSeriesResult>) => void;

export interface ProgressiveTrendLoader {
  (
    bindings: readonly PiPointBinding[],
    range: PiTrendTimeRange,
    publishComplete?: PublishTrendResults,
    options?: TrendLoadOptions,
  ): Promise<Record<string, PiTrendSeriesResult>>;
  loadRecorded: (
    bindings: readonly PiPointBinding[],
    range: PiTrendTimeRange,
    options?: TrendLoadOptions,
  ) => Promise<Record<string, PiTrendSeriesResult>>;
}

interface TrendCacheEntry {
  preview?: PiTrendSeriesResult;
  previewStoredAt?: number;
  previewRequest?: Promise<PiTrendSeriesResult>;
  recorded?: PiTrendSeriesResult;
  recordedStoredAt?: number;
  recordedRequest?: Promise<PiTrendSeriesResult>;
}

export function createProgressiveTrendLoader(
  queryRecorded: QueryTrendRange,
  queryPreview: QueryTrendRange,
  persistentCache: TrendPersistentCache = getTrendPersistentCache(),
): ProgressiveTrendLoader {
  const entries = new Map<string, TrendCacheEntry>();

  const load = async (
    bindings: readonly PiPointBinding[],
    range: PiTrendTimeRange,
    publishComplete?: PublishTrendResults,
    options: TrendLoadOptions = {},
  ): Promise<Record<string, PiTrendSeriesResult>> => {
    const previewRange = range;
    const maxDataPoints = options.maxDataPoints ?? TREND_REFINED_DEFAULT_MAX_DATA_POINTS;
    let recordedResults: Record<string, PiTrendSeriesResult> | undefined;
    let recordedComplete = false;
    const previewPromise = loadPreviewBatch(
      entries,
      bindings,
      previewRange,
      queryPreview,
      (results) => {
        if (!recordedComplete) {
          publishComplete?.(results);
        }
      },
    );
    // A fase refinada pode ocupar vagas livres enquanto a prévia ainda está
    // sendo processada. O limitador compartilhado das consultas históricas
    // mantém no máximo cinco chamadas simultâneas ao PI.
    void loadRecordedBatch(entries, bindings, range, maxDataPoints, queryRecorded, persistentCache)
      .then((recorded) => {
        recordedResults = recorded;
        recordedComplete = true;
        publishComplete?.(recorded);
      })
      .catch(() => undefined);
    const previewResults = await previewPromise;
    return recordedResults ?? previewResults;
  };

  load.loadRecorded = async (
    bindings: readonly PiPointBinding[],
    range: PiTrendTimeRange,
    options: TrendLoadOptions = {},
  ): Promise<Record<string, PiTrendSeriesResult>> => {
    return loadRecordedBatch(
      entries,
      bindings,
      range,
      options.maxDataPoints ?? TREND_REFINED_DEFAULT_MAX_DATA_POINTS,
      queryRecorded,
      persistentCache,
    );
  };

  return load;
}

async function loadPreviewBatch(
  entries: Map<string, TrendCacheEntry>,
  bindings: readonly PiPointBinding[],
  queryRange: PiTrendTimeRange,
  queryPreview: QueryTrendRange,
  publishUpdate?: PublishTrendResults,
): Promise<Record<string, PiTrendSeriesResult>> {
  const unique = deduplicateBindings(bindings);
  const missing: Array<{ binding: PiPointBinding; entry: TrendCacheEntry; deferred: Deferred<PiTrendSeriesResult> }> = [];
  const requests = unique.map((binding) => {
    const entry = getEntry(entries, binding, queryRange, TREND_PREVIEW_MAX_DATA_POINTS);
    if (entry.preview && isFresh(entry.previewStoredAt)) {
      return Promise.resolve(entry.preview);
    }
    entry.preview = undefined;
    entry.previewStoredAt = undefined;
    if (entry.previewRequest) {
      return entry.previewRequest;
    }
    const deferred = createDeferred<PiTrendSeriesResult>();
    entry.previewRequest = deferred.promise;
    missing.push({ binding, entry, deferred });
    return deferred.promise;
  });

  if (missing.length > 0) {
    const batches = chunkItems(missing, DATA_QUERY_MAX_TARGETS);
    void runPreviewBatches(batches, queryRange, queryPreview, publishUpdate)
      .finally(() => {
        for (const item of missing) {
          item.entry.previewRequest = undefined;
        }
      });
  }

  const results = await Promise.all(requests);
  return Object.fromEntries(unique.map((binding, index) => [bindingResultKey(binding), results[index]]));
}

async function runPreviewBatches(
  batches: ReadonlyArray<ReadonlyArray<{ binding: PiPointBinding; entry: TrendCacheEntry; deferred: Deferred<PiTrendSeriesResult> }>>,
  queryRange: PiTrendTimeRange,
  queryPreview: QueryTrendRange,
  publishUpdate?: PublishTrendResults,
): Promise<void> {
  let nextBatch = 0;
  const workerCount = Math.min(DATA_QUERY_MAX_CONCURRENT_BATCHES, batches.length);

  const worker = async (): Promise<void> => {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch];
      nextBatch += 1;
      let results: Record<string, PiTrendSeriesResult>;
      try {
        results = await queryPreview(
          batch.map(({ binding }) => binding),
          queryRange,
          { maxDataPoints: TREND_PREVIEW_MAX_DATA_POINTS },
        );
      } catch (error) {
        results = Object.fromEntries(batch.map(({ binding }) => [
          bindingResultKey(binding), trendError(error),
        ]));
      }

      const published: Record<string, PiTrendSeriesResult> = {};
      for (const item of batch) {
        const result = results[bindingResultKey(item.binding)] ?? trendError('Trend sem resposta de prévia');
        if (result.status === 'success') {
          item.entry.preview = result;
          item.entry.previewStoredAt = Date.now();
        }
        item.deferred.resolve(result);
        if (result.status === 'success') {
          published[bindingResultKey(item.binding)] = result;
        }
      }
      // Não transforma uma resposta parcial de erro em BAD. Enquanto a
      // consulta principal ainda estiver pendente, o componente permanece em
      // "Carregando..." e só recebe erro quando a fase terminar.
      if (batches.length > 1 && Object.keys(published).length > 0) {
        publishUpdate?.(published);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

function chunkItems<T>(items: readonly T[], maxItems: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += maxItems) {
    chunks.push(items.slice(index, index + maxItems));
  }
  return chunks;
}

async function loadRecordedBatch(
  entries: Map<string, TrendCacheEntry>,
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  maxDataPoints: number,
  queryRecorded: QueryTrendRange,
  persistentCache: TrendPersistentCache,
): Promise<Record<string, PiTrendSeriesResult>> {
  const unique = deduplicateBindings(bindings);
  const missing: Array<{ binding: PiPointBinding; entry: TrendCacheEntry; deferred: Deferred<PiTrendSeriesResult> }> = [];
  const cacheLookups: Array<Promise<void>> = [];
  const requests = unique.map((binding) => {
    const entry = getEntry(entries, binding, range, maxDataPoints);
    if (entry.recorded && isFresh(entry.recordedStoredAt)) {
      return Promise.resolve(entry.recorded);
    }
    entry.recorded = undefined;
    entry.recordedStoredAt = undefined;
    if (entry.recordedRequest) {
      return entry.recordedRequest;
    }
    const deferred = createDeferred<PiTrendSeriesResult>();
    entry.recordedRequest = deferred.promise;
    cacheLookups.push(persistentCache.get(persistentCacheKey(binding, range, maxDataPoints))
      .then((cachedSeries) => {
        if (cachedSeries) {
          const cachedResult: PiTrendSeriesResult = { status: 'success', series: cachedSeries };
          entry.recorded = cachedResult;
          entry.recordedStoredAt = Date.now();
          entry.recordedRequest = undefined;
          deferred.resolve(cachedResult);
        } else {
          missing.push({ binding, entry, deferred });
        }
      })
      .catch(() => {
        missing.push({ binding, entry, deferred });
      }));
    return deferred.promise;
  });

  await Promise.all(cacheLookups);

  if (missing.length > 0) {
    void queryRecorded(
      missing.map(({ binding }) => binding),
      range,
      { maxDataPoints },
    ).then((results) => {
      for (const item of missing) {
        const result = results[bindingResultKey(item.binding)] ?? trendError('Trend sem resposta refinada');
        if (result.status === 'success') {
          item.entry.recorded = result;
          item.entry.recordedStoredAt = Date.now();
          void persistentCache.set(
            persistentCacheKey(item.binding, range, maxDataPoints),
            result.series,
          );
        }
        item.deferred.resolve(result);
      }
    }).catch((error) => {
      for (const item of missing) {
        item.deferred.resolve(trendError(error));
      }
    }).finally(() => {
      for (const item of missing) {
        item.entry.recordedRequest = undefined;
      }
    });
  }

  const results = await Promise.all(requests);
  return Object.fromEntries(unique.map((binding, index) => [bindingResultKey(binding), results[index]]));
}

function getEntry(
  entries: Map<string, TrendCacheEntry>,
  binding: PiPointBinding,
  range: PiTrendTimeRange,
  maxDataPoints: number,
): TrendCacheEntry {
  const key = `${range.from}:${range.to}:${maxDataPoints}|${bindingResultKey(binding)}`;
  const entry = entries.get(key) ?? {};
  entries.set(key, entry);
  trimEntries(entries, key);
  return entry;
}

function bindingResultKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function persistentCacheKey(
  binding: PiPointBinding,
  range: PiTrendTimeRange,
  maxDataPoints: number,
): string {
  return `v1|${range.from}:${range.to}:${maxDataPoints}|${bindingResultKey(binding)}`;
}

function deduplicateBindings(bindings: readonly PiPointBinding[]): PiPointBinding[] {
  return [...new Map(bindings.map((binding) => [bindingResultKey(binding), binding])).values()];
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value) => resolvePromise?.(value) };
}

function trendError(error: unknown): PiTrendSeriesResult {
  return {
    status: 'error',
    error: error instanceof Error ? error : new Error(String(error)),
  };
}

function isFresh(storedAt: number | undefined): boolean {
  return storedAt !== undefined && Date.now() - storedAt <= TREND_HISTORY_CACHE_TTL_MS;
}

function trimEntries(entries: Map<string, TrendCacheEntry>, currentKey: string): void {
  for (const key of entries.keys()) {
    if (entries.size <= TREND_CACHE_MAX_ENTRIES) {
      break;
    }
    if (key === currentKey) {
      continue;
    }
    entries.delete(key);
  }
}
