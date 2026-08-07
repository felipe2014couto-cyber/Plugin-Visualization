import { useEffect, useRef, useState } from 'react';
import type { PiPointBinding } from '../../pi/piPointBinding';
import type { PiPointValue, PiPointValueResult } from '../../pi/piDataSource';

export const VALUE_REFRESH_INTERVAL_MS = 5000;

export interface ValueRuntimeConsumer {
  elementId: string;
  binding: PiPointBinding;
}

export type ValueRuntimeState =
  | { status: 'loading'; result?: undefined }
  | { status: 'success'; result: PiPointValue }
  | { status: 'error'; result?: PiPointValue };

export type LoadCurrentValues = (
  bindings: readonly PiPointBinding[],
) => Promise<Record<string, PiPointValueResult>>;

export type ValueRuntimeListener = (states: Map<string, ValueRuntimeState>) => void;

export class ValueRuntime {
  private consumers = new Map<string, ValueRuntimeConsumer>();
  private states = new Map<string, ValueRuntimeState>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = false;
  private generation = 0;
  private consumerSignature = '';
  private loader: LoadCurrentValues;

  constructor(
    loader: LoadCurrentValues,
    private readonly onChange: ValueRuntimeListener,
    private readonly intervalMs = VALUE_REFRESH_INTERVAL_MS,
  ) {
    this.loader = loader;
  }

  updateLoader(loader: LoadCurrentValues): void {
    this.loader = loader;
  }

  setConsumers(consumers: readonly ValueRuntimeConsumer[]): void {
    const nextConsumers = new Map(consumers.map((consumer) => [consumer.elementId, consumer]));
    const signature = [...nextConsumers.values()]
      .map(({ elementId, binding }) => `${elementId}:${getBindingKey(binding)}`)
      .join('|');

    if (signature === this.consumerSignature) {
      return;
    }

    const previousConsumers = this.consumers;
    this.consumerSignature = signature;
    this.generation += 1;
    this.consumers = nextConsumers;
    const nextStates = new Map<string, ValueRuntimeState>();
    for (const [elementId, consumer] of nextConsumers) {
      const previousConsumer = previousConsumers.get(elementId);
      const previousState = this.states.get(elementId);
      nextStates.set(
        elementId,
        previousState && previousConsumer && getBindingKey(previousConsumer.binding) === getBindingKey(consumer.binding)
          ? previousState
          : { status: 'loading' },
      );
    }
    this.replaceStates(nextStates);

    if (nextConsumers.size === 0) {
      this.stopTimer();
      return;
    }

    this.startTimer();
    void this.tick();
  }

  getStates(): Map<string, ValueRuntimeState> {
    return new Map(this.states);
  }

  stop(): void {
    this.generation += 1;
    this.consumers.clear();
    this.states.clear();
    this.consumerSignature = '';
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
      clearInterval(this.timer);
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
      const results = await this.loader(bindings);
      if (generation !== this.generation) {
        return;
      }

      const nextStates = new Map<string, ValueRuntimeState>();
      for (const consumer of snapshot) {
        const result = results[getBindingKey(consumer.binding)];
        const previous = this.states.get(consumer.elementId);
        if (result?.status === 'success') {
          nextStates.set(consumer.elementId, stateWithValue(previous, result.value));
        } else if (result?.status === 'error') {
          nextStates.set(consumer.elementId, stateWithError(previous));
        } else {
          nextStates.set(consumer.elementId, stateWithError(previous));
        }
      }
      this.replaceStates(nextStates);
    } catch {
      if (generation === this.generation) {
        const nextStates = new Map(snapshot.map((consumer) => {
          const previous = this.states.get(consumer.elementId);
          return [consumer.elementId, stateWithError(previous)];
        }));
        this.replaceStates(nextStates);
      }
    } finally {
      this.inFlight = false;
      this.scheduleNextTick();
    }
  }

  private scheduleNextTick(): void {
    // Re-arm from the completed/blocked cycle so a slow query or a missed
    // callback can never leave the shared scheduler without future work.
    if (this.consumers.size > 0) {
      this.startTimer();
    }
  }

  private emit(): void {
    this.onChange(this.getStates());
  }

  private replaceStates(nextStates: Map<string, ValueRuntimeState>): void {
    if (sameStateMap(this.states, nextStates)) {
      return;
    }
    this.states = nextStates;
    this.emit();
  }
}

export function useValueRuntime(
  consumers: readonly ValueRuntimeConsumer[],
  loader: LoadCurrentValues,
): Map<string, ValueRuntimeState> {
  const [states, setStates] = useState<Map<string, ValueRuntimeState>>(new Map());
  const runtimeRef = useRef<ValueRuntime>();
  if (!runtimeRef.current) {
    runtimeRef.current = new ValueRuntime(loader, setStates);
  }

  const runtime = runtimeRef.current;
  runtime.updateLoader(loader);
  const consumerSignature = consumers
    .map(({ elementId, binding }) => `${elementId}:${getBindingKey(binding)}`)
    .join('|');
  // DisplaySurface creates its consumer array while rendering. Keep the exact
  // array used by the effect stable across value-state re-renders; only a real
  // consumer/binding change may reconfigure the scheduler.
  const stableConsumersRef = useRef<{
    signature: string;
    consumers: readonly ValueRuntimeConsumer[];
  }>();
  if (!stableConsumersRef.current || stableConsumersRef.current.signature !== consumerSignature) {
    stableConsumersRef.current = { signature: consumerSignature, consumers };
  }
  const stableConsumers = stableConsumersRef.current.consumers;

  useEffect(() => {
    runtime.setConsumers(stableConsumers);
  }, [runtime, stableConsumers]);

  useEffect(() => () => runtime.stop(), [runtime]);

  return states;
}

export function getBindingKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function uniqueBindings(bindings: readonly PiPointBinding[]): PiPointBinding[] {
  const unique = new Map<string, PiPointBinding>();
  for (const binding of bindings) {
    unique.set(getBindingKey(binding), binding);
  }
  return [...unique.values()];
}

function stateWithValue(previous: ValueRuntimeState | undefined, value: PiPointValue): ValueRuntimeState {
  if (previous?.status === 'success' && samePiPointValue(previous.result, value)) {
    return previous;
  }
  return { status: 'success', result: value };
}

function stateWithError(previous: ValueRuntimeState | undefined): ValueRuntimeState {
  const result = previous?.status === 'success' ? previous.result : previous?.result;
  if (previous?.status === 'error' && previous.result === result) {
    return previous;
  }
  return result ? { status: 'error', result } : { status: 'error' };
}

function samePiPointValue(left: PiPointValue, right: PiPointValue): boolean {
  return left.value === right.value && left.timestamp === right.timestamp;
}

function sameStateMap(left: Map<string, ValueRuntimeState>, right: Map<string, ValueRuntimeState>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [elementId, state] of right) {
    if (left.get(elementId) !== state) {
      return false;
    }
  }
  return true;
}
