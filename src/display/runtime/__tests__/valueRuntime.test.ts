import React, { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import {
  useValueRuntime,
  ValueRuntime,
  VALUE_REFRESH_INTERVAL_MS,
  type LoadCurrentValues,
  type ValueRuntimeConsumer,
} from '../valueRuntime';

const firstBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_A' };
const secondBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_B' };

function consumer(elementId: string, binding = firstBinding): ValueRuntimeConsumer {
  return { elementId, binding };
}

describe('ValueRuntime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('faz leitura inicial, respeita 4999ms, atualiza em 5000ms e continua em 10000ms', async () => {
    const loadValues = jest.fn(async () => ({
      'ds\u0000pims\u0000TAG_A': { status: 'success' as const, value: { value: 10 } },
      'ds\u0000pims\u0000TAG_B': { status: 'success' as const, value: { value: 20 } },
    }));
    const runtime = new ValueRuntime(loadValues, jest.fn());

    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);
    await Promise.resolve();
    expect(loadValues).toHaveBeenCalledTimes(1);
    expect(loadValues).toHaveBeenCalledWith([firstBinding, secondBinding]);
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS - 1);
    expect(loadValues).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(loadValues).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS);
    await Promise.resolve();
    expect(loadValues).toHaveBeenCalledTimes(3);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    }
    expect(loadValues).toHaveBeenCalledTimes(6);
    runtime.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('não sobrepõe consultas e ignora resposta de consumidores removidos', async () => {
    let resolve: ((result: Record<string, { status: 'success'; value: { value: number } }>) => void) | undefined;
    const loadValues = jest.fn(() => new Promise<Record<string, { status: 'success'; value: { value: number } }>>((done) => {
      resolve = done;
    }));
    const listener = jest.fn();
    const runtime = new ValueRuntime(loadValues, listener);
    runtime.setConsumers([consumer('one')]);
    jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS * 2);
    expect(loadValues).toHaveBeenCalledTimes(1);

    runtime.setConsumers([]);
    resolve?.({ 'ds\u0000pims\u0000TAG_A': { status: 'success', value: { value: 10 } } });
    await Promise.resolve();
    expect(listener.mock.calls.at(-1)?.[0]).toEqual(new Map());
    runtime.stop();
  });

  it('deduplica bindings mantendo consumidores visualmente independentes', async () => {
    const loadValues = jest.fn(async () => ({
      'ds\u0000pims\u0000TAG_A': { status: 'success' as const, value: { value: 10 } },
    }));
    const states: Array<Map<string, unknown>> = [];
    const runtime = new ValueRuntime(loadValues, (next) => states.push(next));

    runtime.setConsumers([consumer('one'), consumer('two')]);
    await Promise.resolve();
    expect(loadValues).toHaveBeenCalledWith([firstBinding]);
    expect(states[states.length - 1]?.get('one')).toEqual({ status: 'success', result: { value: 10 } });
    expect(states[states.length - 1]?.get('two')).toEqual({ status: 'success', result: { value: 10 } });
    runtime.stop();
  });

  it('preserva referências de consumidores cujo Current Value não mudou', async () => {
    let cycle = 0;
    const loadValues = jest.fn(async () => {
      cycle += 1;
      return {
        'ds\u0000pims\u0000TAG_A': { status: 'success' as const, value: { value: 10 } },
        'ds\u0000pims\u0000TAG_B': { status: 'success' as const, value: { value: cycle === 1 ? 20 : 21 } },
      };
    });
    const states: Array<Map<string, unknown>> = [];
    const runtime = new ValueRuntime(loadValues, (next) => states.push(next));
    runtime.setConsumers([consumer('a'), consumer('b', secondBinding)]);
    await Promise.resolve();
    const first = states[states.length - 1];

    jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS);
    await Promise.resolve();
    const second = states[states.length - 1];

    expect(second.get('a')).toBe(first.get('a'));
    expect(second.get('b')).not.toBe(first.get('b'));
    runtime.stop();
  });

  it('mantém um scheduler e uma aquisição deduplicada com 500 consumidores do mesmo binding', async () => {
    const loadValues = jest.fn(async () => ({
      'ds\u0000pims\u0000TAG_A': { status: 'success' as const, value: { value: 10 } },
    }));
    const runtime = new ValueRuntime(loadValues, jest.fn());
    runtime.setConsumers(Array.from({ length: 500 }, (_, index) => consumer(`element-${index}`)));
    await Promise.resolve();

    expect(loadValues).toHaveBeenCalledWith([firstBinding]);
    expect(jest.getTimerCount()).toBe(1);
    runtime.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('continua os ciclos depois que uma consulta inFlight resolve, sem sobreposição', async () => {
    const resolvers: Array<() => void> = [];
    const loadValues = jest.fn(() => new Promise<Record<string, { status: 'success'; value: { value: number } }>>((resolve) => {
      resolvers.push(() => resolve({
        'ds\u0000pims\u0000TAG_A': { status: 'success', value: { value: resolvers.length } },
      }));
    }));
    const runtime = new ValueRuntime(loadValues, jest.fn());
    runtime.setConsumers([consumer('one')]);

    jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS);
    expect(loadValues).toHaveBeenCalledTimes(1);
    resolvers.shift()?.();
    await Promise.resolve();

    jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS - 1);
    expect(loadValues).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(loadValues).toHaveBeenCalledTimes(2);
    resolvers.shift()?.();
    await Promise.resolve();
    runtime.stop();
  });

  it('mantém o scheduler durante re-render causado pela atualização do valor', async () => {
    let value = 0;
    const loadValues = jest.fn(async () => {
      value += 1;
      return {
        'ds\u0000pims\u0000TAG_A': { status: 'success' as const, value: { value } },
      };
    });
    const consumers = [consumer('one')];
    const onState = jest.fn();
    const view = render(React.createElement(RuntimeHookHarness, { consumers, loader: loadValues, onState }));
    await act(async () => undefined);

    expect(loadValues).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(loadValues).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(VALUE_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(loadValues).toHaveBeenCalledTimes(3);
    expect(onState.mock.calls[onState.mock.calls.length - 1]?.[0].get('one')).toEqual({
      status: 'success',
      result: { value: 3 },
    });
    view.unmount();
  });

  it('não consulta novamente por seleção, drag, resize ou opções visuais', async () => {
    const loadValues = jest.fn(async () => ({
      'ds\u0000pims\u0000TAG_A': { status: 'success' as const, value: { value: 1 } },
    }));
    const consumers = [consumer('one')];
    const view = render(React.createElement(RuntimeHookHarness, { consumers, loader: loadValues }));
    await act(async () => undefined);
    fireEvent.click(view.getByTestId('runtime-selection'));
    fireEvent.click(view.getByTestId('runtime-drag'));
    fireEvent.click(view.getByTestId('runtime-resize'));
    fireEvent.click(view.getByTestId('runtime-visual-options'));
    expect(loadValues).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('remove o último consumidor e limpa o timer no unmount', async () => {
    const loadValues = jest.fn(async () => ({
      'ds\u0000pims\u0000TAG_A': { status: 'success' as const, value: { value: 1 } },
    }));
    const view = render(React.createElement(RuntimeHookHarness, { consumers: [consumer('one')], loader: loadValues }));
    await act(async () => undefined);
    expect(jest.getTimerCount()).toBe(1);
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

function RuntimeHookHarness({
  consumers,
  loader,
  onState,
}: {
  consumers: readonly ValueRuntimeConsumer[];
  loader: LoadCurrentValues;
  onState?: (states: ReturnType<typeof useValueRuntime>) => void;
}) {
  const [, setRevision] = useState(0);
  const states = useValueRuntime(consumers, loader);
  onState?.(states);
  return React.createElement('div', null,
    React.createElement('button', {
      type: 'button',
      'data-testid': 'runtime-selection',
      onClick: () => setRevision((value) => value + 1),
    }),
    React.createElement('button', {
      type: 'button',
      'data-testid': 'runtime-drag',
      onClick: () => setRevision((value) => value + 1),
    }),
    React.createElement('button', {
      type: 'button',
      'data-testid': 'runtime-resize',
      onClick: () => setRevision((value) => value + 1),
    }),
    React.createElement('button', {
      type: 'button',
      'data-testid': 'runtime-visual-options',
      onClick: () => setRevision((value) => value + 1),
    }),
    states.get('one')?.status ?? 'empty',
  );
}
