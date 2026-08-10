import { useEffect, useRef, useState } from 'react';
import type { PiPointBinding } from '../../pi/piPointBinding';
import type { PiPointValue, PiPointValueResult } from '../../pi/piDataSource';
import { DATA_QUERY_BATCH_WINDOW_MS } from '../../pi/dataQueryPolicy';

export const VALUE_REFRESH_INTERVAL_MS = 5000;
// Four seconds keeps a re-added symbol responsive without extending beyond the
// normal five-second refresh cadence. The cap prevents long editing sessions
// with many distinct tags from growing the runtime indefinitely.
export const CURRENT_VALUE_CACHE_TTL_MS = 4000;
export const CURRENT_VALUE_CACHE_MAX_ENTRIES = 256;

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
  private cache = new Map<string, { value: PiPointValue; storedAt: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private batchTimer: ReturnType<typeof setTimeout> | undefined;
  private activeRequest: { keys: Set<string>; lifecycle: number } | undefined;
  private pendingImmediate = new Map<string, PiPointBinding>();
  private lifecycle = 0;
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
    this.consumers = nextConsumers;
    const nextStates = new Map<string, ValueRuntimeState>();
    for (const [elementId, consumer] of nextConsumers) {
      const previousConsumer = previousConsumers.get(elementId);
      const previousState = this.states.get(elementId);
      const bindingKey = getBindingKey(consumer.binding);
      if (previousState && previousConsumer && getBindingKey(previousConsumer.binding) === bindingKey) {
        nextStates.set(elementId, previousState);
        continue;
      }
      const sharedState = findStateForBinding(previousConsumers, this.states, bindingKey);
      const cached = this.getFreshCacheValue(bindingKey);
      nextStates.set(elementId, sharedState ?? (cached
        ? { status: 'success', result: cached }
        : { status: 'loading' }));
    }
    this.replaceStates(nextStates);

    if (nextConsumers.size === 0) {
      this.stopTimer();
      this.stopBatchTimer();
      this.pendingImmediate.clear();
      return;
    }

    this.startTimer();
    const addedBindings = uniqueBindings([...nextConsumers.values()]
      .filter(({ elementId, binding }) => {
        const previous = previousConsumers.get(elementId);
        return !previous || getBindingKey(previous.binding) !== getBindingKey(binding);
      })
      .map(({ binding }) => binding));
    if (addedBindings.length > 0) {
      void this.request(addedBindings);
    }
  }

  getStates(): Map<string, ValueRuntimeState> {
    return new Map(this.states);
  }

  stop(): void {
    this.lifecycle += 1;
    this.consumers.clear();
    this.states.clear();
    this.cache.clear();
    this.pendingImmediate.clear();
    this.activeRequest = undefined;
    this.consumerSignature = '';
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

  private async tick(): Promise<void> {
    if (this.consumers.size === 0) {
      return;
    }
    const bindings = uniqueBindings([...this.consumers.values()].map(({ binding }) => binding));
    if (this.activeRequest) {
      this.request(bindings);
      return;
    }
    await this.executeRequest(bindings);
  }

  private request(bindings: readonly PiPointBinding[]): void {
    const unique = uniqueBindings(bindings);
    if (unique.length === 0 || this.consumers.size === 0) {
      return;
    }
    for (const binding of unique) {
      const key = getBindingKey(binding);
      if (!this.activeRequest || !this.activeRequest.keys.has(key)) {
        this.pendingImmediate.set(key, binding);
      }
    }
    if (this.activeRequest || this.pendingImmediate.size === 0) {
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
    if (this.activeRequest || this.pendingImmediate.size === 0 || this.consumers.size === 0) {
      return;
    }
    const bindings = [...this.pendingImmediate.values()]
      .filter((binding) => hasBindingConsumer(this.consumers, getBindingKey(binding)));
    this.pendingImmediate.clear();
    if (bindings.length > 0) {
      void this.executeRequest(bindings);
    }
  }

  private async executeRequest(bindings: readonly PiPointBinding[]): Promise<void> {
    const unique = uniqueBindings(bindings);

    const lifecycle = this.lifecycle;
    const keys = new Set(unique.map(getBindingKey));
    const request = { keys, lifecycle };
    this.activeRequest = request;

    try {
      const results = await this.loader(unique);
      if (lifecycle !== this.lifecycle) {
        return;
      }
      const nextStates = new Map(this.states);
      for (const [elementId, consumer] of this.consumers) {
        const key = getBindingKey(consumer.binding);
        if (!keys.has(key)) {
          continue;
        }
        const result = results[key];
        const previous = this.states.get(consumer.elementId);
        if (result?.status === 'success') {
          this.putCacheValue(key, result.value);
          nextStates.set(elementId, stateWithValue(previous, result.value));
        } else if (result?.status === 'error') {
          nextStates.set(elementId, stateWithError(previous));
        } else {
          nextStates.set(elementId, stateWithError(previous));
        }
      }
      this.replaceStates(nextStates);
    } catch {
      if (lifecycle === this.lifecycle) {
        const nextStates = new Map(this.states);
        for (const [elementId, consumer] of this.consumers) {
          if (keys.has(getBindingKey(consumer.binding))) {
            nextStates.set(elementId, stateWithError(this.states.get(elementId)));
          }
        }
        this.replaceStates(nextStates);
      }
    } finally {
      if (this.activeRequest === request) {
        this.activeRequest = undefined;
        if (lifecycle === this.lifecycle && this.consumers.size > 0) {
          const pending = [...this.pendingImmediate.values()]
            .filter((binding) => hasBindingConsumer(this.consumers, getBindingKey(binding)));
          this.pendingImmediate.clear();
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

  private getFreshCacheValue(key: string): PiPointValue | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.storedAt > CURRENT_VALUE_CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  private putCacheValue(key: string, value: PiPointValue): void {
    this.cache.delete(key);
    this.cache.set(key, { value, storedAt: Date.now() });
    while (this.cache.size > CURRENT_VALUE_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
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

function findStateForBinding(
  consumers: Map<string, ValueRuntimeConsumer>,
  states: Map<string, ValueRuntimeState>,
  bindingKey: string,
): ValueRuntimeState | undefined {
  for (const [elementId, consumer] of consumers) {
    if (getBindingKey(consumer.binding) === bindingKey) {
      return states.get(elementId);
    }
  }
  return undefined;
}

function hasBindingConsumer(
  consumers: Map<string, ValueRuntimeConsumer>,
  bindingKey: string,
): boolean {
  return [...consumers.values()].some(({ binding }) => getBindingKey(binding) === bindingKey);
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
  return left.value === right.value
    && left.timestamp === right.timestamp
    && sameQuality(left.quality, right.quality);
}

function sameQuality(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => left[key] === right[key]);
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
