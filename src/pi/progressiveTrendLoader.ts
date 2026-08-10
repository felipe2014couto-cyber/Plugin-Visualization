import type { PiPointBinding } from './piPointBinding';
import type {
  PiTrendSeriesResult,
  PiTrendTimeRange,
} from './piDataSource';

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
    const previewResults = await loadPreviewBatch(
      entries,
      bindings,
      previewRange,
      queryPreview,
    );
    void loadRecordedBatch(entries, bindings, range, maxDataPoints, queryRecorded)
      .then((recorded) => publishComplete?.(recorded))
      .catch(() => undefined);
    return previewResults;
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
    );
  };

  return load;
}

async function loadPreviewBatch(
  entries: Map<string, TrendCacheEntry>,
  bindings: readonly PiPointBinding[],
  queryRange: PiTrendTimeRange,
  queryPreview: QueryTrendRange,
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
    void queryPreview(
      missing.map(({ binding }) => binding),
      queryRange,
      { maxDataPoints: TREND_PREVIEW_MAX_DATA_POINTS },
    ).then((results) => {
      for (const item of missing) {
        const result = results[bindingResultKey(item.binding)] ?? trendError('Trend sem resposta de prévia');
        if (result.status === 'success') {
          item.entry.preview = result;
          item.entry.previewStoredAt = Date.now();
        }
        item.deferred.resolve(result);
      }
    }).catch((error) => {
      for (const item of missing) {
        item.deferred.resolve(trendError(error));
      }
    }).finally(() => {
      for (const item of missing) {
        item.entry.previewRequest = undefined;
      }
    });
  }

  const results = await Promise.all(requests);
  return Object.fromEntries(unique.map((binding, index) => [bindingResultKey(binding), results[index]]));
}

async function loadRecordedBatch(
  entries: Map<string, TrendCacheEntry>,
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  maxDataPoints: number,
  queryRecorded: QueryTrendRange,
): Promise<Record<string, PiTrendSeriesResult>> {
  const unique = deduplicateBindings(bindings);
  const missing: Array<{ binding: PiPointBinding; entry: TrendCacheEntry; deferred: Deferred<PiTrendSeriesResult> }> = [];
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
    missing.push({ binding, entry, deferred });
    return deferred.promise;
  });

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
  while (entries.size > TREND_CACHE_MAX_ENTRIES) {
    const key = entries.keys().next().value as string | undefined;
    if (!key || key === currentKey) {
      return;
    }
    entries.delete(key);
  }
}
