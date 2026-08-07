import { createProgressiveTrendLoader, TREND_PREVIEW_DURATION_MS } from '../progressiveTrendLoader';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
const resultKey = 'ds\u0000pims\u0000SINUSOID';

describe('progressive trend loader', () => {
  it('exibe 8h interpoladas e mantém Recorded Values no cache até o detalhamento', async () => {
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
    expect(queryPreview).toHaveBeenCalledWith([binding], {
      from: range.to - TREND_PREVIEW_DURATION_MS,
      to: range.to,
    });
    expect(queryRange).toHaveBeenCalledWith([binding], range);

    resolveComplete?.(complete);
    await completePromise;
    await Promise.resolve();
    await expect(loader.loadRecorded([binding], range)).resolves.toStrictEqual(complete);
    await expect(loader([binding], range)).resolves.toStrictEqual(preview);
    expect(queryPreview).toHaveBeenCalledTimes(1);
    expect(queryRange).toHaveBeenCalledTimes(1);
  });

  it('usa a prévia interpolada também no período padrão de 8h', async () => {
    const preview = { [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } } };
    const recorded = { [resultKey]: { status: 'success' as const, series: { pointName: 'SINUSOID', points: [{ time: 1, value: 1 }] } } };
    const queryRecorded = jest.fn(async () => recorded);
    const queryPreview = jest.fn(async () => preview);
    const loader = createProgressiveTrendLoader(queryRecorded, queryPreview);
    const range = { from: 0, to: TREND_PREVIEW_DURATION_MS };

    await expect(loader([binding], range)).resolves.toStrictEqual(preview);
    expect(queryPreview).toHaveBeenCalledWith([binding], range);
    expect(queryRecorded).toHaveBeenCalledWith([binding], range);
    await expect(loader.loadRecorded([binding], range)).resolves.toStrictEqual(recorded);
  });
});
