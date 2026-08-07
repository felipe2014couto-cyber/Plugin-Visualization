import {
  TrendRuntime,
  TREND_INITIAL_ERROR_GRACE_MS,
  TREND_REFRESH_INTERVAL_MS,
  type TrendRuntimeConsumer,
} from '../trendRuntime';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
const secondBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'OTHER' };

function consumer(elementId: string, selectedBinding = binding): TrendRuntimeConsumer {
  return { elementId, binding: selectedBinding };
}

describe('TrendRuntime', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('faz leitura inicial, ciclos periódicos e mantém um scheduler para vários Trends', async () => {
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] } },
      'ds\u0000pims\u0000OTHER': { status: 'success' as const, series: { pointName: 'OTHER', points: [{ time: 1, value: 2 }] } },
    }));
    const runtime = new TrendRuntime(load, jest.fn());
    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith([binding, secondBinding], expect.any(Function));
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(TREND_REFRESH_INTERVAL_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(TREND_REFRESH_INTERVAL_MS);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);
    runtime.stop();
  });

  it('bloqueia sobreposição, retoma após resolução e preserva lastSuccess após erro', async () => {
    const resolvers: Array<(value: Record<string, { status: 'success'; series: { pointName: string; points: Array<{ time: number; value: number }> } }>) => void> = [];
    const load = jest.fn(() => new Promise<Record<string, { status: 'success'; series: { pointName: string; points: Array<{ time: number; value: number }> } }>>((resolve) => {
      resolvers.push(resolve);
    }));
    const states: Array<Map<string, unknown>> = [];
    const runtime = new TrendRuntime(load, (next) => states.push(next));
    runtime.setConsumers([consumer('one')]);
    jest.advanceTimersByTime(TREND_REFRESH_INTERVAL_MS * 2);
    expect(load).toHaveBeenCalledTimes(1);

    resolvers.shift()?.({ 'ds\u0000pims\u0000SINUSOID': { status: 'success', series: { pointName: 'SINUSOID', points: [{ time: 1, value: 5 }] } } });
    await Promise.resolve();
    jest.advanceTimersByTime(TREND_REFRESH_INTERVAL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    resolvers.shift()?.({ 'ds\u0000pims\u0000SINUSOID': { status: 'success', series: { pointName: 'SINUSOID', points: [{ time: 2, value: 6 }] } } });
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toEqual({ status: 'success', data: { pointName: 'SINUSOID', points: [{ time: 2, value: 6 }] } });
    runtime.stop();
  });

  it('remove o último Trend e limpa o timer', async () => {
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } },
    }));
    const runtime = new TrendRuntime(load, jest.fn());
    runtime.setConsumers([consumer('one')]);
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(1);
    runtime.setConsumers([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('recarrega imediatamente quando a chave do período muda', async () => {
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } },
    }));
    const runtime = new TrendRuntime(load, jest.fn());
    runtime.setConsumers([consumer('one')], 'range-one');
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    runtime.setConsumers([consumer('one')], 'range-two');
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    runtime.stop();
  });

  it('mantém o Trend existente visível enquanto um novo Trend começa a carregar', async () => {
    const states: Array<Map<string, unknown>> = [];
    const load = jest.fn()
      .mockResolvedValueOnce({
        'ds\u0000pims\u0000SINUSOID': {
          status: 'success' as const,
          series: { pointName: 'SINUSOID', points: [{ time: 1, value: 7 }] },
        },
      })
      .mockReturnValueOnce(new Promise(() => undefined));
    const runtime = new TrendRuntime(load, (next) => states.push(next));
    runtime.setConsumers([consumer('one')]);
    await Promise.resolve();

    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);

    expect(states[states.length - 1]?.get('one')).toEqual({
      status: 'success',
      data: { pointName: 'SINUSOID', points: [{ time: 1, value: 7 }] },
    });
    expect(states[states.length - 1]?.get('two')).toEqual({ status: 'loading' });
    runtime.stop();
  });

  it('publica a série completa recebida após a prévia', async () => {
    const states: Array<Map<string, unknown>> = [];
    const load = jest.fn(async (_bindings, publishUpdate) => {
      publishUpdate?.({
        'ds\u0000pims\u0000SINUSOID': {
          status: 'success' as const,
          series: { pointName: 'SINUSOID', points: [{ time: 2, value: 2 }] },
        },
      });
      return {
        'ds\u0000pims\u0000SINUSOID': {
          status: 'success' as const,
          series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] },
        },
      };
    });
    const runtime = new TrendRuntime(load, (next) => states.push(next));

    runtime.setConsumers([consumer('one')]);
    await Promise.resolve();

    expect(states.some((state) => (
      state.get('one') as { data?: { points: Array<{ value: number }> } }
    )?.data?.points[0]?.value === 2)).toBe(true);
    runtime.stop();
  });

  it('mantém Carregando durante falhas transitórias da primeira carga', async () => {
    const states: Array<Map<string, unknown>> = [];
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'error' as const, error: new Error('temporário') },
    }));
    const runtime = new TrendRuntime(load, (next) => states.push(next));

    runtime.setConsumers([consumer('one')]);
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toEqual({ status: 'loading' });

    jest.advanceTimersByTime(TREND_INITIAL_ERROR_GRACE_MS + TREND_REFRESH_INTERVAL_MS);
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toMatchObject({ status: 'error' });
    runtime.stop();
  });
});
