import { useEffect, useRef, useState } from 'react';
import type { PiPointBinding } from '../../pi/piPointBinding';
import type { PiTrendSeries, PiTrendSeriesResult } from '../../pi/piDataSource';

export const TREND_REFRESH_INTERVAL_MS = 5000;
export const TREND_INITIAL_ERROR_GRACE_MS = 90_000;

export interface TrendRuntimeConsumer {
  elementId: string;
  binding: PiPointBinding;
}

export type TrendRuntimeState =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: PiTrendSeries; error?: undefined }
  | { status: 'error'; data?: PiTrendSeries; error: Error };

export type LoadTrendSeries = (
  bindings: readonly PiPointBinding[],
  publishUpdate?: (results: Record<string, PiTrendSeriesResult>) => void,
) => Promise<Record<string, PiTrendSeriesResult>>;

type TrendRuntimeListener = (states: Map<string, TrendRuntimeState>) => void;

export class TrendRuntime {
  private consumers = new Map<string, TrendRuntimeConsumer>();
  private states = new Map<string, TrendRuntimeState>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private generation = 0;
  private consumerSignature = '';
  private firstErrorAt = new Map<string, number>();
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
    const nextConsumers = new Map(consumers.map((consumer) => [consumer.elementId, consumer]));
    const signature = `${refreshKey}|${[...nextConsumers.values()]
      .map(({ elementId, binding }) => `${elementId}:${getTrendBindingKey(binding)}`)
      .join('|')}`;

    if (signature === this.consumerSignature) {
      return;
    }

    const previousConsumers = this.consumers;
    const previousStates = this.states;
    this.consumerSignature = signature;
    this.generation += 1;
    this.consumers = nextConsumers;
    this.firstErrorAt.clear();
    this.states = new Map(
      [...nextConsumers.values()].map((consumer) => {
        const previousConsumer = previousConsumers.get(consumer.elementId);
        const previousState = previousStates.get(consumer.elementId);
        const unchanged = previousConsumer
          && getTrendBindingKey(previousConsumer.binding) === getTrendBindingKey(consumer.binding);
        return [
          consumer.elementId,
          unchanged && previousState ? previousState : { status: 'loading' },
        ] as [string, TrendRuntimeState];
      }),
    );
    this.emit();

    if (nextConsumers.size === 0) {
      this.stopTimer();
      return;
    }

    this.startTimer();
    void this.tick();
  }

  stop(): void {
    this.generation += 1;
    this.consumers.clear();
    this.states.clear();
    this.consumerSignature = '';
    this.firstErrorAt.clear();
    this.stopTimer();
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

  private async tick(): Promise<void> {
    if (this.inFlight || this.consumers.size === 0) {
      this.scheduleNextTick();
      return;
    }

    this.inFlight = true;
    const generation = this.generation;
    const snapshot = [...this.consumers.values()];
    const bindings = uniqueBindings(snapshot.map((consumer) => consumer.binding));

    try {
      const publishUpdate = (results: Record<string, PiTrendSeriesResult>) => {
        if (generation === this.generation) {
          this.applyResults(snapshot, results);
        }
      };
      const results = await this.loader(bindings, publishUpdate);
      if (generation !== this.generation) {
        return;
      }
      this.applyResults(snapshot, results);
    } catch (error) {
      if (generation === this.generation) {
        this.states = new Map(snapshot.map((consumer) => {
          const previous = this.states.get(consumer.elementId);
          return [consumer.elementId, {
            status: 'error',
            data: previous?.data,
            error: toError(error),
          } as TrendRuntimeState];
        }));
        this.emit();
      }
    } finally {
      this.inFlight = false;
      this.scheduleNextTick();
    }
  }

  private scheduleNextTick(): void {
    if (this.consumers.size > 0) {
      this.startTimer();
    }
  }

  private applyResults(
    consumers: readonly TrendRuntimeConsumer[],
    results: Record<string, PiTrendSeriesResult>,
  ): void {
    const nextStates = new Map<string, TrendRuntimeState>();
    for (const consumer of consumers) {
      const result = results[getTrendBindingKey(consumer.binding)];
      const previous = this.states.get(consumer.elementId);
      if (result?.status === 'success') {
        this.firstErrorAt.delete(consumer.elementId);
        nextStates.set(consumer.elementId, { status: 'success', data: result.series });
      } else {
        const firstErrorAt = this.firstErrorAt.get(consumer.elementId) ?? Date.now();
        this.firstErrorAt.set(consumer.elementId, firstErrorAt);
        if (!previous?.data && Date.now() - firstErrorAt < TREND_INITIAL_ERROR_GRACE_MS) {
          nextStates.set(consumer.elementId, { status: 'loading' });
        } else {
          nextStates.set(consumer.elementId, {
            status: 'error',
            data: previous?.data,
            error: result?.error ?? new Error('Trend sem resposta'),
          });
        }
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
    .map(({ elementId, binding }) => `${elementId}:${getTrendBindingKey(binding)}`)
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

function getTrendBindingKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
