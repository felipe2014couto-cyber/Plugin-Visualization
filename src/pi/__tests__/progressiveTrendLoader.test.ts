import {
  createProgressiveTrendLoader,
  TREND_HISTORY_CACHE_TTL_MS,
  TREND_PREVIEW_DURATION_MS,
} from '../progressiveTrendLoader';
import type { PiTrendSeriesResult } from '../piDataSource';
import type { PiPointBinding } from '../piPointBinding';
import type { TrendPersistentCache } from '../trendPersistentCache';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
const resultKey = 'ds\u0000pims\u0000SINUSOID';
const secondBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'OTHER' };
const thirdBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'THIRD' };

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('progressive trend loader', () => {
  it('reutiliza o histórico persistido após recarregar o app sem consultar o servidor', async () => {
    const cachedSeries = { pointName: 'SINUSOID', points: [{ time: 1, value: 42 }] };
    const persistentCache: TrendPersistentCache = {
      get: jest.fn(async () => cachedSeries),
      set: jest.fn(async () => undefined),
    };
    const queryRecorded = jest.fn(async () => ({}));
    const loader = createProgressiveTrendLoader(queryRecorded, jest.fn(async () => ({})), persistentCache);

    await expect(loader.loadRecorded([binding], { from: 0, to: TREND_PREVIEW_DURATION_MS }))
      .resolves.toEqual({ [resultKey]: { status: 'success', series: cachedSeries } });

    expect(queryRecorded).not.toHaveBeenCalled();
    expect(persistentCache.get).toHaveBeenCalledWith(expect.stringContaining(`|${resultKey}`));
  });

  it('persiste somente o histórico refinado obtido com sucesso', async () => {
    const recorded = {
      [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 2, value: 3 }] } },
    };
    const persistentCache: TrendPersistentCache = {
      get: jest.fn(async () => undefined),
      set: jest.fn(async () => undefined),
    };
    const loader = createProgressiveTrendLoader(
      jest.fn(async () => recorded),
      jest.fn(async () => ({})),
      persistentCache,
    );

    await loader.loadRecorded([binding], { from: 0, to: TREND_PREVIEW_DURATION_MS });

    expect(persistentCache.set).toHaveBeenCalledWith(
      expect.stringContaining(`|${resultKey}`),
      recorded[resultKey].series,
    );
  });

  it('exibe a janela completa em baixa resolução e mantém o refinamento no cache curto', async () => {
    const preview = {
      [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] } },
    };
    const complete = {
      [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 2, value: 2 }] } },
    };
    let resolveComplete: ((value: typeof complete) => void) | undefined;
    const completePromise = new Promise<typeof complete>((resolve) => {
      resolveComplete = resolve;
    });
    const queryRange = jest.fn().mockReturnValue(completePromise);
    const queryPreview = jest.fn().mockResolvedValue(preview);
    const loader = createProgressiveTrendLoader(queryRange, queryPreview);
    const range = { from: 0, to: 2 * 24 * 60 * 60 * 1000 };

    await expect(loader([binding], range)).resolves.toStrictEqual(preview);
    expect(queryPreview).toHaveBeenCalledWith([binding], range, { maxDataPoints: 250 });
    await flushAsyncWork();
    expect(queryRange).toHaveBeenCalledWith([binding], range, { maxDataPoints: 750 });

    resolveComplete?.(complete);
    await completePromise;
    await Promise.resolve();
    await expect(loader.loadRecorded([binding], range)).resolves.toStrictEqual(complete);
    await expect(loader([binding], range)).resolves.toStrictEqual(preview);
    expect(queryPreview).toHaveBeenCalledTimes(1);
    expect(queryRange).toHaveBeenCalledTimes(1);
  });

  it('revalida preview e refinamento depois do TTL sem reutilizar dados indefinidamente', async () => {
    let now = 1_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const result = { [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } } };
    const queryPreview = jest.fn(async () => result);
    const queryRecorded = jest.fn(async () => result);
    const loader = createProgressiveTrendLoader(queryRecorded, queryPreview);
    const range = { from: 0, to: TREND_PREVIEW_DURATION_MS };

    await loader([binding], range);
    await loader.loadRecorded([binding], range);
    now += TREND_HISTORY_CACHE_TTL_MS + 1;
    await loader([binding], range);
    await loader.loadRecorded([binding], range);

    expect(queryPreview).toHaveBeenCalledTimes(2);
    expect(queryRecorded).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('usa a prévia interpolada também no período padrão de 8h', async () => {
    const preview = { [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } } };
    const recorded = { [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] } } };
    const queryRecorded = jest.fn(async () => recorded);
    const queryPreview = jest.fn(async () => preview);
    const loader = createProgressiveTrendLoader(queryRecorded, queryPreview);
    const range = { from: 0, to: TREND_PREVIEW_DURATION_MS };

    await expect(loader([binding], range)).resolves.toStrictEqual(preview);
    expect(queryPreview).toHaveBeenCalledWith([binding], range, { maxDataPoints: 250 });
    await flushAsyncWork();
    expect(queryRecorded).toHaveBeenCalledWith([binding], range, { maxDataPoints: 750 });
    await expect(loader.loadRecorded([binding], range)).resolves.toStrictEqual(recorded);
  });

  it('mantém Promises separadas para tags diferentes e publica refinamento para todas', async () => {
    const bindings = [binding, secondBinding, thirdBinding];
    const range = { from: 0, to: TREND_PREVIEW_DURATION_MS };
    const queryPreview = jest.fn(async (selectedBindings: readonly PiPointBinding[]): Promise<Record<string, PiTrendSeriesResult>> => Object.fromEntries(selectedBindings.map((selectedBinding) => [
      `${selectedBinding.dataSourceUid}\u0000${selectedBinding.serverPath}\u0000${selectedBinding.pointName}`,
      { status: 'success' as const, series: { pointName: selectedBinding.pointName, points: [{ time: 1, value: 1 }] } },
    ])));
    const queryRecorded = jest.fn(async (selectedBindings: readonly PiPointBinding[]): Promise<Record<string, PiTrendSeriesResult>> => Object.fromEntries(selectedBindings.map((selectedBinding) => [
      `${selectedBinding.dataSourceUid}\u0000${selectedBinding.serverPath}\u0000${selectedBinding.pointName}`,
      { status: 'success' as const, series: { pointName: selectedBinding.pointName, points: [{ time: 2, value: 2 }] } },
    ])));
    const publishComplete = jest.fn();
    const loader = createProgressiveTrendLoader(queryRecorded, queryPreview);

    const previews = await loader(bindings, range, publishComplete);
    await Promise.all(bindings.map((selectedBinding) => loader.loadRecorded([selectedBinding], range)));
    await Promise.resolve();

    expect(Object.keys(previews)).toEqual([
      'ds\u0000pims\u0000SINUSOID',
      'ds\u0000pims\u0000OTHER',
      'ds\u0000pims\u0000THIRD',
    ]);
    expect(queryPreview).toHaveBeenCalledTimes(1);
    expect(queryPreview).toHaveBeenCalledWith(bindings, range, { maxDataPoints: 250 });
    expect(queryRecorded).toHaveBeenCalledTimes(1);
    expect(queryRecorded).toHaveBeenCalledWith(bindings, range, { maxDataPoints: 750 });
    expect(publishComplete).toHaveBeenCalledTimes(1);
  });

  it('faz somente uma consulta por fase para vinte tags', async () => {
    const bindings = Array.from({ length: 20 }, (_, index) => ({
      dataSourceUid: 'ds',
      serverPath: 'pims',
      pointName: `TAG_${index + 1}`,
    }));
    const resultFor = (selectedBindings: readonly PiPointBinding[], time: number) => Object.fromEntries(selectedBindings.map((selectedBinding) => [
      `${selectedBinding.dataSourceUid}\u0000${selectedBinding.serverPath}\u0000${selectedBinding.pointName}`,
      { status: 'success' as const, series: { pointName: selectedBinding.pointName, points: [{ time, value: time }] } },
    ]));
    const queryPreview = jest.fn(async (selectedBindings: readonly PiPointBinding[]) => resultFor(selectedBindings, 1));
    const queryRecorded = jest.fn(async (selectedBindings: readonly PiPointBinding[]) => resultFor(selectedBindings, 2));
    const publishComplete = jest.fn();
    const loader = createProgressiveTrendLoader(queryRecorded, queryPreview);
    const range = { from: 0, to: TREND_PREVIEW_DURATION_MS };

    const previews = await loader(bindings, range, publishComplete, { maxDataPoints: 900 });
    await loader.loadRecorded(bindings, range, { maxDataPoints: 900 });
    await Promise.resolve();

    expect(Object.keys(previews)).toHaveLength(20);
    expect(queryPreview).toHaveBeenCalledTimes(1);
    expect(queryPreview).toHaveBeenCalledWith(bindings, range, { maxDataPoints: 250 });
    expect(queryRecorded).toHaveBeenCalledTimes(1);
    expect(queryRecorded).toHaveBeenCalledWith(bindings, range, { maxDataPoints: 900 });
    expect(publishComplete).toHaveBeenCalledTimes(1);
  });

  it.each([1, 3, 10, 20])('mede uma chamada por fase para %i tag(s) compatíveis', async (count) => {
    const bindings = Array.from({ length: count }, (_, index) => ({
      dataSourceUid: 'ds',
      serverPath: 'pims',
      pointName: `TAG_${index + 1}`,
    }));
    const resultFor = (selectedBindings: readonly PiPointBinding[]) => Object.fromEntries(selectedBindings.map((item) => [
      `${item.dataSourceUid}\u0000${item.serverPath}\u0000${item.pointName}`,
      { status: 'success' as const, series: { pointName: item.pointName, points: [] } },
    ]));
    const queryPreview = jest.fn(async (selectedBindings: readonly PiPointBinding[]) => resultFor(selectedBindings));
    const queryRefined = jest.fn(async (selectedBindings: readonly PiPointBinding[]) => resultFor(selectedBindings));
    const loader = createProgressiveTrendLoader(queryRefined, queryPreview);

    await loader(bindings, { from: 0, to: TREND_PREVIEW_DURATION_MS });
    await loader.loadRecorded(bindings, { from: 0, to: TREND_PREVIEW_DURATION_MS });

    expect(queryPreview).toHaveBeenCalledTimes(1);
    expect(queryRefined).toHaveBeenCalledTimes(1);
    expect(queryPreview.mock.calls[0][0]).toHaveLength(count);
    expect(queryRefined.mock.calls[0][0]).toHaveLength(count);
  });

  it('publica falha refinada por tag sem rejeitar a prévia das demais', async () => {
    const secondKey = 'ds\u0000pims\u0000OTHER';
    const preview = {
      [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 1, value: 0 }] } },
      [secondKey]: { status: 'success' as const, series: { pointName: 'OTHER', points: [{ time: 1, value: 2 }] } },
    };
    const recorded = {
      [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 2, value: 3 }] } },
      [secondKey]: { status: 'error' as const, error: new Error('falha refinada') },
    };
    const publishComplete = jest.fn();
    const loader = createProgressiveTrendLoader(
      jest.fn(async () => recorded),
      jest.fn(async () => preview),
    );

    await expect(loader([binding, secondBinding], { from: 0, to: TREND_PREVIEW_DURATION_MS }, publishComplete))
      .resolves.toStrictEqual(preview);
    await loader.loadRecorded([binding, secondBinding], { from: 0, to: TREND_PREVIEW_DURATION_MS });
    await Promise.resolve();

    expect(publishComplete).toHaveBeenCalledWith(recorded);
  });

  it('deduplica somente requisições idênticas do mesmo binding, intervalo e modo', async () => {
    let resolvePreview: ((value: Record<string, PiTrendSeriesResult>) => void) | undefined;
    const queryPreview = jest.fn(() => new Promise<Record<string, PiTrendSeriesResult>>((resolve) => {
      resolvePreview = resolve;
    }));
    const queryRecorded = jest.fn(async () => ({ [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } } }));
    const loader = createProgressiveTrendLoader(queryRecorded, queryPreview);
    const range = { from: 0, to: TREND_PREVIEW_DURATION_MS };

    const first = loader([binding], range);
    const second = loader([binding], range);
    expect(queryPreview).toHaveBeenCalledTimes(1);
    resolvePreview?.({ [resultKey]: { status: 'success', series: { pointName: 'SINUSOID', points: [] } } });
    await expect(first).resolves.toEqual(await second);
  });

  it('reutiliza a prévia idêntica mesmo quando o refinamento pede outra resolução', async () => {
    const preview = { [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } } };
    const queryPreview = jest.fn(async () => preview);
    const queryRecorded = jest.fn(async () => preview);
    const loader = createProgressiveTrendLoader(queryRecorded, queryPreview);
    const range = { from: 0, to: TREND_PREVIEW_DURATION_MS };

    await loader([binding], range, undefined, { maxDataPoints: 600 });
    await loader([binding], range, undefined, { maxDataPoints: 900 });
    await flushAsyncWork();

    expect(queryPreview).toHaveBeenCalledTimes(1);
    expect(queryRecorded).toHaveBeenCalledTimes(2);
    expect(queryRecorded).toHaveBeenNthCalledWith(1, [binding], range, { maxDataPoints: 600 });
    expect(queryRecorded).toHaveBeenNthCalledWith(2, [binding], range, { maxDataPoints: 900 });
  });
});
