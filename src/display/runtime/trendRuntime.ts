import { useEffect, useRef, useState } from 'react';
import type { PiPointBinding } from '../../pi/piPointBinding';
import type { PiTrendSeries, PiTrendSeriesResult } from '../../pi/piDataSource';
import { DATA_QUERY_BATCH_WINDOW_MS } from '../../pi/dataQueryPolicy';

export const TREND_REFRESH_INTERVAL_MS = 5000;
export { DATA_QUERY_BATCH_WINDOW_MS } from '../../pi/dataQueryPolicy';
export const TREND_POINTS_PER_PIXEL = 1.5;
export const TREND_MIN_DATA_POINTS = 100;
export const TREND_MAX_DATA_POINTS = 2000;
const TREND_REFINED_DEFAULT_WIDTH = 500;

export interface TrendRuntimeConsumer {
  elementId: string;
  consumerId?: string;
  binding: PiPointBinding;
  width?: number;
}

export interface TrendLoadRequestOptions {
  maxDataPoints: number;
}

export type TrendRuntimeState =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: PiTrendSeries; error?: undefined }
  | { status: 'error'; data?: PiTrendSeries; error: Error };

export type LoadTrendSeries = (
  bindings: readonly PiPointBinding[],
  publishUpdate?: (results: Record<string, PiTrendSeriesResult>) => void,
  options?: TrendLoadRequestOptions,
) => Promise<Record<string, PiTrendSeriesResult>>;

type TrendRuntimeListener = (states: Map<string, TrendRuntimeState>) => void;

export class TrendRuntime {
  private consumers = new Map<string, TrendRuntimeConsumer>();
  private states = new Map<string, TrendRuntimeState>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private batchTimer: ReturnType<typeof setTimeout> | undefined;
  private activeRequest: { keys: Set<string>; lifecycle: number; refreshKey: string } | undefined;
  private pendingBindings = new Map<string, PiPointBinding>();
  private lifecycle = 0;
  private requestSequence = 0;
  private latestRequestByBinding = new Map<string, number>();
  private refreshKey = '';
  private consumerSignature = '';
  private loader: LoadTrendSeries;

  constructor(
    loader: LoadTrendSeries,
    private readonly onChange: TrendRuntimeListener,
    private readonly intervalMs = TREND_REFRESH_INTERVAL_MS,
  ) {
    this.loader = loader;
  }

  updateLoader(loader: LoadTrendSeries): void {
    this.loader = loader;
  }

  setConsumers(consumers: readonly TrendRuntimeConsumer[], refreshKey = ''): void {
    const nextConsumers = new Map(consumers.map((consumer) => [getTrendConsumerKey(consumer), consumer]));
    const signature = `${refreshKey}|${[...nextConsumers.values()]
      .map((consumer) => (
        `${getTrendConsumerKey(consumer)}:${getTrendBindingKey(consumer.binding)}:${consumer.width ?? ''}`
      ))
      .join('|')}`;

    if (signature === this.consumerSignature) {
      return;
    }

    const previousConsumers = this.consumers;
    const previousStates = this.states;
    const refreshChanged = this.refreshKey !== refreshKey;
    this.consumerSignature = signature;
    this.refreshKey = refreshKey;
    this.consumers = nextConsumers;
    this.states = new Map(
      [...nextConsumers.values()].map((consumer) => {
        const consumerKey = getTrendConsumerKey(consumer);
        const previousConsumer = previousConsumers.get(consumerKey);
        const previousState = previousStates.get(consumerKey);
        const unchanged = previousConsumer
          && getTrendBindingKey(previousConsumer.binding) === getTrendBindingKey(consumer.binding);
        return [
          consumerKey,
          unchanged && previousState ? previousState : { status: 'loading' },
        ] as [string, TrendRuntimeState];
      }),
    );
    this.emit();

    if (refreshChanged && this.activeRequest?.refreshKey !== refreshKey) {
      this.activeRequest = undefined;
    }

    if (nextConsumers.size === 0) {
      this.stopTimer();
      this.stopBatchTimer();
      this.pendingBindings.clear();
      return;
    }

    this.startTimer();
    const addedBindings = uniqueBindings([...nextConsumers.values()]
      .filter((consumer) => {
        const previous = previousConsumers.get(getTrendConsumerKey(consumer));
        const { binding } = consumer;
        return refreshChanged || !previous || getTrendBindingKey(previous.binding) !== getTrendBindingKey(binding);
      })
      .map(({ binding }) => binding));
    if (addedBindings.length > 0) {
      void this.request(addedBindings);
    }
  }

  stop(): void {
    this.lifecycle += 1;
    this.consumers.clear();
    this.states.clear();
    this.consumerSignature = '';
    this.refreshKey = '';
    this.latestRequestByBinding.clear();
    this.pendingBindings.clear();
    this.activeRequest = undefined;
    this.stopTimer();
    this.stopBatchTimer();
  }

  private startTimer(): void {
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.tick();
      }, this.intervalMs);
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private stopBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }
  }

  private tick(): void {
    if (this.consumers.size === 0) {
      return;
    }
    this.request(uniqueBindings([...this.consumers.values()].map(({ binding }) => binding)));
  }

  private request(bindings: readonly PiPointBinding[]): void {
    const unique = uniqueBindings(bindings);
    if (unique.length === 0 || this.consumers.size === 0) {
      return;
    }
    for (const binding of unique) {
      const key = getTrendBindingKey(binding);
      if (!this.activeRequest
        || this.activeRequest.refreshKey !== this.refreshKey
        || !this.activeRequest.keys.has(key)) {
        this.pendingBindings.set(key, binding);
      }
    }
    if (this.activeRequest || this.pendingBindings.size === 0) {
      return;
    }
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = undefined;
        this.flushBatch();
      }, DATA_QUERY_BATCH_WINDOW_MS);
    }
  }

  private flushBatch(): void {
    if (this.activeRequest || this.pendingBindings.size === 0 || this.consumers.size === 0) {
      return;
    }
    const bindings = [...this.pendingBindings.values()]
      .filter((binding) => hasBindingConsumer(this.consumers, getTrendBindingKey(binding)));
    this.pendingBindings.clear();
    if (bindings.length > 0) {
      void this.executeRequest(bindings);
    }
  }

  private async executeRequest(bindings: readonly PiPointBinding[]): Promise<void> {
    const unique = uniqueBindings(bindings);

    const lifecycle = this.lifecycle;
    const refreshKey = this.refreshKey;
    const keys = new Set(unique.map(getTrendBindingKey));
    const sequence = ++this.requestSequence;
    for (const key of keys) {
      this.latestRequestByBinding.set(key, sequence);
    }
    const request = { keys, lifecycle, refreshKey, sequence };
    this.activeRequest = request;

    try {
      const publishUpdate = (results: Record<string, PiTrendSeriesResult>) => {
        if (this.isCurrentRequest(request)) {
          this.applyResults(request, results);
        }
      };
      const results = await this.loader(unique, publishUpdate, {
        maxDataPoints: this.getBatchMaxDataPoints(keys),
      });
      if (!this.isCurrentRequest(request)) {
        return;
      }
      this.applyResults(request, results);
    } catch (error) {
      if (this.isCurrentRequest(request)) {
        this.applyResults(request, Object.fromEntries([...keys].map((key) => [
          key,
          { status: 'error', error: toError(error) } as PiTrendSeriesResult,
        ])));
      }
    } finally {
      if (this.activeRequest === request) {
        this.activeRequest = undefined;
        if (lifecycle === this.lifecycle && this.consumers.size > 0) {
          const pending = [...this.pendingBindings.values()]
            .filter((binding) => hasBindingConsumer(this.consumers, getTrendBindingKey(binding)));
          this.pendingBindings.clear();
          if (pending.length > 0) {
            void this.executeRequest(pending);
          } else {
            this.scheduleNextTick();
          }
        }
      }
    }
  }

  private scheduleNextTick(): void {
    if (this.consumers.size > 0) {
      this.startTimer();
    }
  }

  private isCurrentRequest(request: { lifecycle: number; refreshKey: string }): boolean {
    return request.lifecycle === this.lifecycle && request.refreshKey === this.refreshKey;
  }

  private getBatchMaxDataPoints(keys: ReadonlySet<string>): number {
    const widths = [...this.consumers.values()]
      .filter(({ binding }) => keys.has(getTrendBindingKey(binding)))
      .map(({ width }) => width ?? TREND_REFINED_DEFAULT_WIDTH);
    return trendMaxDataPointsForWidth(widths.length > 0 ? Math.max(...widths) : TREND_REFINED_DEFAULT_WIDTH);
  }

  private applyResults(
    request: { keys: ReadonlySet<string>; sequence: number },
    results: Record<string, PiTrendSeriesResult>,
  ): void {
    const nextStates = new Map(this.states);
    for (const [consumerId, consumer] of this.consumers) {
      const key = getTrendBindingKey(consumer.binding);
      if (!request.keys.has(key) || this.latestRequestByBinding.get(key) !== request.sequence) {
        continue;
      }
      const result = results[key];
      const previous = this.states.get(consumerId);
      if (result?.status === 'success') {
        nextStates.set(consumerId, { status: 'success', data: result.series });
      } else {
        nextStates.set(consumerId, {
          status: 'error',
          data: previous?.data,
          error: result?.error ?? new Error('Trend sem resposta'),
        });
      }
    }
    this.states = nextStates;
    this.emit();
  }

  private emit(): void {
    this.onChange(new Map(this.states));
  }
}

export function useTrendRuntime(
  consumers: readonly TrendRuntimeConsumer[],
  loader: LoadTrendSeries,
  refreshKey = '',
): Map<string, TrendRuntimeState> {
  const [states, setStates] = useState<Map<string, TrendRuntimeState>>(new Map());
  const runtimeRef = useRef<TrendRuntime>();
  if (!runtimeRef.current) {
    runtimeRef.current = new TrendRuntime(loader, setStates);
  }

  const runtime = runtimeRef.current;
  runtime.updateLoader(loader);
  const consumerSignature = `${refreshKey}|${consumers
    .map((consumer) => `${getTrendConsumerKey(consumer)}:${getTrendBindingKey(consumer.binding)}:${consumer.width ?? ''}`)
    .join('|')}`;
  const stableConsumersRef = useRef<{
    signature: string;
    consumers: readonly TrendRuntimeConsumer[];
  }>();
  if (!stableConsumersRef.current || stableConsumersRef.current.signature !== consumerSignature) {
    stableConsumersRef.current = { signature: consumerSignature, consumers };
  }
  const stableConsumers = stableConsumersRef.current.consumers;

  useEffect(() => {
    runtime.setConsumers(stableConsumers, refreshKey);
  }, [refreshKey, runtime, stableConsumers]);

  useEffect(() => () => runtime.stop(), [runtime]);

  return states;
}

function uniqueBindings(bindings: readonly PiPointBinding[]): PiPointBinding[] {
  const unique = new Map<string, PiPointBinding>();
  for (const binding of bindings) {
    unique.set(getTrendBindingKey(binding), binding);
  }
  return [...unique.values()];
}

function hasBindingConsumer(
  consumers: Map<string, TrendRuntimeConsumer>,
  bindingKey: string,
): boolean {
  return [...consumers.values()].some(({ binding }) => getTrendBindingKey(binding) === bindingKey);
}

function getTrendBindingKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

export function getTrendSeriesConsumerId(elementId: string, binding: PiPointBinding): string {
  return `${elementId}\u0000${getTrendBindingKey(binding)}`;
}

function getTrendConsumerKey(consumer: TrendRuntimeConsumer): string {
  return consumer.consumerId ?? consumer.elementId;
}

export function trendMaxDataPointsForWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return Math.round(TREND_REFINED_DEFAULT_WIDTH * TREND_POINTS_PER_PIXEL);
  }
  return Math.min(
    TREND_MAX_DATA_POINTS,
    Math.max(TREND_MIN_DATA_POINTS, Math.round(width * TREND_POINTS_PER_PIXEL)),
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
