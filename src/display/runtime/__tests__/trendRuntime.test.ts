import {
  DATA_QUERY_BATCH_WINDOW_MS,
  TrendRuntime,
  TREND_MIN_DATA_POINTS,
  TREND_MAX_DATA_POINTS,
  trendMaxDataPointsForWidth,
  type LoadTrendSeries,
  type TrendRuntimeConsumer,
  type TrendRuntimeState,
} from '../trendRuntime';
import type { PiTrendSeriesResult } from '../../../pi/piDataSource';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
const secondBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'OTHER' };
const thirdBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'THIRD' };

function consumer(elementId: string, selectedBinding = binding): TrendRuntimeConsumer {
  return { elementId, binding: selectedBinding };
}

async function flushBatch(): Promise<void> {
  jest.advanceTimersByTime(DATA_QUERY_BATCH_WINDOW_MS);
  await Promise.resolve();
}

describe('TrendRuntime', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('faz leitura inicial e usa a chave externa de atualização para vários Trends', async () => {
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] } },
      'ds\u0000pims\u0000OTHER': { status: 'success' as const, series: { pointName: 'OTHER', points: [{ time: 1, value: 2 }] } },
    }));
    const runtime = new TrendRuntime(load, jest.fn());
    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);
    await flushBatch();

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith([binding, secondBinding], expect.any(Function), { maxDataPoints: 750 });
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(60_000);
    expect(load).toHaveBeenCalledTimes(1);
    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)], 'refresh-two');
    await flushBatch();
    expect(load).toHaveBeenCalledTimes(2);
    runtime.stop();
  });

  it('mantém carregando quando o loader progressivo ainda não publicou uma tag', async () => {
    const load = jest.fn(async () => ({}));
    const states: Array<Map<string, TrendRuntimeState>> = [];
    const runtime = new TrendRuntime(load, (next) => states.push(next));

    runtime.setConsumers([consumer('one')]);
    await flushBatch();

    expect(states[states.length - 1]?.get('one')).toEqual({ status: 'loading' });
    runtime.stop();
  });

  it('não cria atualização espontânea enquanto uma consulta está pendente', async () => {
    const resolvers: Array<(value: Record<string, { status: 'success'; series: { pointName: string; points: Array<{ time: number; value: number }> } }>) => void> = [];
    const load = jest.fn(() => new Promise<Record<string, { status: 'success'; series: { pointName: string; points: Array<{ time: number; value: number }> } }>>((resolve) => {
      resolvers.push(resolve);
    }));
    const states: Array<Map<string, unknown>> = [];
    const runtime = new TrendRuntime(load, (next) => states.push(next));
    runtime.setConsumers([consumer('one')]);
    await flushBatch();
    jest.advanceTimersByTime(120_000);
    expect(load).toHaveBeenCalledTimes(1);

    resolvers.shift()?.({ 'ds\u0000pims\u0000SINUSOID': { status: 'success', series: { pointName: 'SINUSOID', points: [{ time: 1, value: 5 }] } } });
    await Promise.resolve();
    runtime.setConsumers([consumer('one')], 'refresh-two');
    await flushBatch();
    expect(load).toHaveBeenCalledTimes(2);
    resolvers.shift()?.({ 'ds\u0000pims\u0000SINUSOID': { status: 'success', series: { pointName: 'SINUSOID', points: [{ time: 2, value: 6 }] } } });
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toEqual({ status: 'success', data: { pointName: 'SINUSOID', points: [{ time: 2, value: 6 }] } });
    runtime.stop();
  });

  it('remove o último Trend e limpa o timer de agrupamento', async () => {
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } },
    }));
    const runtime = new TrendRuntime(load, jest.fn());
    runtime.setConsumers([consumer('one')]);
    await flushBatch();
    expect(jest.getTimerCount()).toBe(0);
    runtime.setConsumers([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('recarrega imediatamente quando a chave do período muda', async () => {
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } },
    }));
    const runtime = new TrendRuntime(load, jest.fn());
    runtime.setConsumers([consumer('one')], 'range-one');
    await flushBatch();
    expect(load).toHaveBeenCalledTimes(1);

    runtime.setConsumers([consumer('one')], 'range-two');
    await flushBatch();
    expect(load).toHaveBeenCalledTimes(2);
    runtime.stop();
  });

  it('não deixa uma consulta lenta do período anterior bloquear a nova faixa', async () => {
    const resolvers: Array<(results: Record<string, PiTrendSeriesResult>) => void> = [];
    const load = jest.fn(() => new Promise<Record<string, PiTrendSeriesResult>>((resolve) => {
      resolvers.push(resolve);
    }));
    const states: Array<Map<string, TrendRuntimeState>> = [];
    const runtime = new TrendRuntime(load, (next) => states.push(next));

    runtime.setConsumers([consumer('one')], 'range-one');
    await flushBatch();
    expect(load).toHaveBeenCalledTimes(1);

    runtime.setConsumers([consumer('one')], 'range-two');
    jest.advanceTimersByTime(DATA_QUERY_BATCH_WINDOW_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(load).toHaveBeenCalledTimes(2);

    resolvers[1]?.({
      'ds\u0000pims\u0000SINUSOID': {
        status: 'success',
        series: { pointName: 'SINUSOID', points: [{ time: 2, value: 2 }] },
      },
    });
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toMatchObject({
      status: 'success',
      data: { points: [{ time: 2, value: 2 }] },
    });

    resolvers[0]?.({
      'ds\u0000pims\u0000SINUSOID': {
        status: 'success',
        series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] },
      },
    });
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toMatchObject({
      status: 'success',
      data: { points: [{ time: 2, value: 2 }] },
    });
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
    await flushBatch();

    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);

    expect(states[states.length - 1]?.get('one')).toEqual({
      status: 'success',
      data: { pointName: 'SINUSOID', points: [{ time: 1, value: 7 }] },
    });
    expect(states[states.length - 1]?.get('two')).toEqual({ status: 'loading' });
    runtime.stop();
  });

  it('carrega três Trends adicionados rapidamente sem esperar o refresh periódico', async () => {
    const resolvers: Array<(results: Record<string, PiTrendSeriesResult>) => void> = [];
    const load = jest.fn(() => new Promise<Record<string, PiTrendSeriesResult>>((resolve) => {
      resolvers.push(resolve);
    }));
    const states: Array<Map<string, TrendRuntimeState>> = [];
    const runtime = new TrendRuntime(load, (next) => states.push(next));
    runtime.setConsumers([consumer('one')]);
    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);
    runtime.setConsumers([consumer('one'), consumer('two', secondBinding), consumer('three', thirdBinding)]);

    await flushBatch();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(
      [binding, secondBinding, thirdBinding],
      expect.any(Function),
      { maxDataPoints: 750 },
    );
    resolvers[0]?.({
      'ds\u0000pims\u0000SINUSOID': { status: 'success', series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] } },
      'ds\u0000pims\u0000OTHER': { status: 'success', series: { pointName: 'OTHER', points: [{ time: 1, value: 2 }] } },
      'ds\u0000pims\u0000THIRD': { status: 'success', series: { pointName: 'THIRD', points: [{ time: 1, value: 3 }] } },
    });
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toMatchObject({ status: 'success', data: { pointName: 'SINUSOID' } });
    expect(states[states.length - 1]?.get('two')).toMatchObject({ status: 'success', data: { pointName: 'OTHER' } });
    expect(states[states.length - 1]?.get('three')).toMatchObject({ status: 'success', data: { pointName: 'THIRD' } });
    runtime.stop();
  });

  it('usa uma janela fixa de 40 ms e envia tags posteriores em outro lote', async () => {
    const load = jest.fn(async (bindings: ReadonlyArray<typeof binding>) => Object.fromEntries(bindings.map((selectedBinding) => [
      `ds\u0000pims\u0000${selectedBinding.pointName}`,
      { status: 'success' as const, series: { pointName: selectedBinding.pointName, points: [] } },
    ])));
    const runtime = new TrendRuntime(load, jest.fn());

    runtime.setConsumers([consumer('one')]);
    jest.advanceTimersByTime(DATA_QUERY_BATCH_WINDOW_MS - 1);
    expect(load).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenLastCalledWith([binding], expect.any(Function), { maxDataPoints: 750 });

    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);
    jest.advanceTimersByTime(DATA_QUERY_BATCH_WINDOW_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith([secondBinding], expect.any(Function), { maxDataPoints: 750 });
    runtime.stop();
  });

  it('agrupa vinte tags em uma única leitura previsível', async () => {
    const bindings = Array.from({ length: 20 }, (_, index) => ({
      dataSourceUid: 'ds',
      serverPath: 'pims',
      pointName: `TAG_${index + 1}`,
    }));
    const load = jest.fn<ReturnType<LoadTrendSeries>, Parameters<LoadTrendSeries>>(async () => ({}));
    const runtime = new TrendRuntime(load, jest.fn());

    runtime.setConsumers(bindings.map((selectedBinding, index) => consumer(`trend-${index + 1}`, selectedBinding)));
    await flushBatch();

    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toEqual(bindings);
    expect(load.mock.calls[0][2]).toEqual({ maxDataPoints: 750 });
    runtime.stop();
  });

  it('calcula a resolução refinada pela largura com mínimo e teto seguros', () => {
    expect(trendMaxDataPointsForWidth(20)).toBe(TREND_MIN_DATA_POINTS);
    expect(trendMaxDataPointsForWidth(520)).toBe(780);
    expect(trendMaxDataPointsForWidth(4_000)).toBe(TREND_MAX_DATA_POINTS);
    expect(trendMaxDataPointsForWidth(Number.NaN)).toBe(750);
  });

  it('não deixa a troca de um Trend descartar a resposta válida dos outros', async () => {
    const resolvers: Array<(results: Record<string, PiTrendSeriesResult>) => void> = [];
    const load = jest.fn(() => new Promise<Record<string, PiTrendSeriesResult>>((resolve) => {
      resolvers.push(resolve);
    }));
    const states: Array<Map<string, TrendRuntimeState>> = [];
    const runtime = new TrendRuntime(load, (next) => states.push(next));
    runtime.setConsumers([consumer('one'), consumer('two', secondBinding)]);
    await flushBatch();
    runtime.setConsumers([consumer('one', thirdBinding), consumer('two', secondBinding)]);

    resolvers[0]?.({
      'ds\u0000pims\u0000SINUSOID': { status: 'success', series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] } },
      'ds\u0000pims\u0000OTHER': { status: 'success', series: { pointName: 'OTHER', points: [{ time: 1, value: 2 }] } },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(states[states.length - 1]?.get('two')).toMatchObject({ status: 'success', data: { pointName: 'OTHER' } });
    expect(load).toHaveBeenLastCalledWith([thirdBinding], expect.any(Function), { maxDataPoints: 750 });

    resolvers[1]?.({
      'ds\u0000pims\u0000THIRD': { status: 'success', series: { pointName: 'THIRD', points: [{ time: 1, value: 3 }] } },
    });
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')).toMatchObject({ status: 'success', data: { pointName: 'THIRD' } });
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
    await flushBatch();

    expect(states.some((state) => (
      state.get('one') as { data?: { points: Array<{ value: number }> } }
    )?.data?.points[0]?.value === 2)).toBe(true);
    runtime.stop();
  });

  it('preserva a prévia individual quando o refinamento falha', async () => {
    let publishRefinement: ((results: Record<string, PiTrendSeriesResult>) => void) | undefined;
    const states: Array<Map<string, TrendRuntimeState>> = [];
    const load = jest.fn(async (_bindings, publishUpdate) => {
      publishRefinement = publishUpdate;
      return {
        'ds\u0000pims\u0000SINUSOID': {
          status: 'success' as const,
          series: { pointName: 'SINUSOID', points: [{ time: 1, value: 0 }] },
        },
      };
    });
    const runtime = new TrendRuntime(load, (next) => states.push(next));

    runtime.setConsumers([consumer('one')]);
    await flushBatch();
    expect(states[states.length - 1]?.get('one')).toMatchObject({
      status: 'success',
      data: { points: [{ value: 0 }] },
    });

    publishRefinement?.({
      'ds\u0000pims\u0000SINUSOID': { status: 'error', error: new Error('falha refinada') },
    });
    expect(states[states.length - 1]?.get('one')).toMatchObject({
      status: 'error',
      data: { points: [{ value: 0 }] },
      error: new Error('falha refinada'),
    });
    runtime.stop();
  });

  it('mantém estados independentes para várias séries da mesma Trend', async () => {
    const states: Array<Map<string, TrendRuntimeState>> = [];
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': {
        status: 'success' as const,
        series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] },
      },
      'ds\u0000pims\u0000OTHER': { status: 'error' as const, error: new Error('sem resposta') },
    }));
    const runtime = new TrendRuntime(load, (next) => states.push(next));
    runtime.setConsumers([
      { elementId: 'trend', consumerId: 'trend-series-a', binding },
      { elementId: 'trend', consumerId: 'trend-series-b', binding: secondBinding },
    ]);

    await flushBatch();

    expect(load).toHaveBeenCalledTimes(1);
    expect(states[states.length - 1]?.get('trend-series-a')).toMatchObject({ status: 'success' });
    expect(states[states.length - 1]?.get('trend-series-b')).toMatchObject({ status: 'error' });
    runtime.stop();
  });

  it('ignora refinamento antigo quando uma consulta mais nova da mesma janela já começou', async () => {
    const refinements: Array<(results: Record<string, PiTrendSeriesResult>) => void> = [];
    let previewValue = 1;
    const states: Array<Map<string, TrendRuntimeState>> = [];
    const load: LoadTrendSeries = jest.fn(async (_bindings, publishUpdate) => {
      refinements.push((results) => publishUpdate?.(results));
      return {
        'ds\u0000pims\u0000SINUSOID': {
          status: 'success' as const,
          series: { pointName: 'SINUSOID', points: [{ time: 1, value: previewValue++ }] },
        },
      };
    });
    const runtime = new TrendRuntime(load, (next) => states.push(next));
    runtime.setConsumers([consumer('one')]);
    await flushBatch();

    runtime.setConsumers([consumer('one')], 'refresh-two');
    await flushBatch();
    await Promise.resolve();
    await Promise.resolve();
    expect(states[states.length - 1]?.get('one')?.data?.points[0].value).toBe(2);

    refinements[0]?.({
      'ds\u0000pims\u0000SINUSOID': {
        status: 'success',
        series: { pointName: 'SINUSOID', points: [{ time: 1, value: 99 }] },
      },
    });
    expect(states[states.length - 1]?.get('one')?.data?.points[0].value).toBe(2);
    runtime.stop();
  });

  it('finaliza com erro quando a consulta falha sem dados anteriores', async () => {
    const states: Array<Map<string, unknown>> = [];
    const load = jest.fn(async () => ({
      'ds\u0000pims\u0000SINUSOID': { status: 'error' as const, error: new Error('temporário') },
    }));
    const runtime = new TrendRuntime(load, (next) => states.push(next));

    runtime.setConsumers([consumer('one')]);
    await flushBatch();
    expect(states[states.length - 1]?.get('one')).toMatchObject({ status: 'error', error: new Error('temporário') });
    runtime.stop();
  });
});
