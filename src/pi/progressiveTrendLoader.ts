import type { PiPointBinding } from './piPointBinding';
import type {
  PiTrendSeriesResult,
  PiTrendTimeRange,
} from './piDataSource';

export const TREND_PREVIEW_DURATION_MS = 8 * 60 * 60 * 1000;

export type QueryTrendRange = (
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
) => Promise<Record<string, PiTrendSeriesResult>>;

export type PublishTrendResults = (results: Record<string, PiTrendSeriesResult>) => void;

export interface ProgressiveTrendLoader {
  (
    bindings: readonly PiPointBinding[],
    range: PiTrendTimeRange,
    publishComplete?: PublishTrendResults,
  ): Promise<Record<string, PiTrendSeriesResult>>;
  loadRecorded: (
    bindings: readonly PiPointBinding[],
    range: PiTrendTimeRange,
  ) => Promise<Record<string, PiTrendSeriesResult>>;
}

interface TrendCacheEntry {
  preview?: PiTrendSeriesResult;
  previewRequest?: Promise<PiTrendSeriesResult>;
  recorded?: PiTrendSeriesResult;
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
  ): Promise<Record<string, PiTrendSeriesResult>> => {
    const previewRange = {
      from: Math.max(range.from, range.to - TREND_PREVIEW_DURATION_MS),
      to: range.to,
    };
    const results = await Promise.all(bindings.map(async (binding) => {
      const entry = getEntry(entries, binding, range);
      const result = await loadPreview(entry, binding, previewRange, queryPreview);
      startRecordedRequest(entry, binding, range, queryRecorded);
      return [bindingResultKey(binding), result] as const;
    }));
    return Object.fromEntries(results);
  };

  load.loadRecorded = async (
    bindings: readonly PiPointBinding[],
    range: PiTrendTimeRange,
  ): Promise<Record<string, PiTrendSeriesResult>> => {
    const results = await Promise.all(bindings.map(async (binding) => {
      const entry = getEntry(entries, binding, range);
      const result = await loadRecorded(entry, binding, range, queryRecorded);
      return [bindingResultKey(binding), result] as const;
    }));
    return Object.fromEntries(results);
  };

  return load;
}

async function loadPreview(
  entry: TrendCacheEntry,
  binding: PiPointBinding,
  range: PiTrendTimeRange,
  queryPreview: QueryTrendRange,
): Promise<PiTrendSeriesResult> {
  if (entry.preview) {
    return entry.preview;
  }
  if (!entry.previewRequest) {
    entry.previewRequest = querySingleBinding(queryPreview, binding, range)
      .then((result) => {
        if (result.status === 'success') {
          entry.preview = result;
        }
        return result;
      })
      .finally(() => {
        entry.previewRequest = undefined;
      });
  }
  return entry.previewRequest;
}

function startRecordedRequest(
  entry: TrendCacheEntry,
  binding: PiPointBinding,
  range: PiTrendTimeRange,
  queryRecorded: QueryTrendRange,
): void {
  if (!entry.recorded && !entry.recordedRequest) {
    void loadRecorded(entry, binding, range, queryRecorded).catch(() => undefined);
  }
}

async function loadRecorded(
  entry: TrendCacheEntry,
  binding: PiPointBinding,
  range: PiTrendTimeRange,
  queryRecorded: QueryTrendRange,
): Promise<PiTrendSeriesResult> {
  if (entry.recorded) {
    return entry.recorded;
  }
  if (!entry.recordedRequest) {
    entry.recordedRequest = querySingleBinding(queryRecorded, binding, range)
      .then((result) => {
        if (result.status === 'success') {
          entry.recorded = result;
        }
        return result;
      })
      .finally(() => {
        entry.recordedRequest = undefined;
      });
  }
  return entry.recordedRequest;
}

async function querySingleBinding(
  query: QueryTrendRange,
  binding: PiPointBinding,
  range: PiTrendTimeRange,
): Promise<PiTrendSeriesResult> {
  const results = await query([binding], range);
  return results[bindingResultKey(binding)]
    ?? { status: 'error', error: new Error('Trend sem resposta') };
}

function getEntry(
  entries: Map<string, TrendCacheEntry>,
  binding: PiPointBinding,
  range: PiTrendTimeRange,
): TrendCacheEntry {
  const key = `${range.from}:${range.to}|${bindingResultKey(binding)}`;
  const entry = entries.get(key) ?? {};
  entries.set(key, entry);
  trimEntries(entries, key);
  return entry;
}

function bindingResultKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function trimEntries(entries: Map<string, TrendCacheEntry>, currentKey: string): void {
  while (entries.size > 24) {
    const key = entries.keys().next().value as string | undefined;
    if (!key || key === currentKey) {
      return;
    }
    entries.delete(key);
  }
}
