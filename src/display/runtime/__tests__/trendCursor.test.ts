import {
  clampTrendCursorTime,
  isTrendCursorWithinSeries,
  resolveTrendCursorValue,
} from '../trendCursor';

describe('trendCursor', () => {
  it('resolve ponto exato e interpolação linear, inclusive série negativa', () => {
    const points = [{ time: 1_000, value: -10 }, { time: 2_000, value: 10 }];

    expect(resolveTrendCursorValue(points, 1_000)).toBe(-10);
    expect(resolveTrendCursorValue(points, 1_250)).toBe(-5);
    expect(resolveTrendCursorValue(points, 1_500)).toBe(0);
  });

  it('trata série constante, um ponto, timestamps duplicados e limites', () => {
    expect(resolveTrendCursorValue([{ time: 1, value: 7 }, { time: 2, value: 7 }], 1.5)).toBe(7);
    expect(resolveTrendCursorValue([{ time: 1, value: 7 }], 1)).toBe(7);
    expect(resolveTrendCursorValue([{ time: 1, value: 7 }], 2)).toBeUndefined();
    expect(resolveTrendCursorValue([{ time: 1, value: 3 }, { time: 1, value: 4 }, { time: 2, value: 8 }], 1)).toBe(4);
    expect(resolveTrendCursorValue([{ time: 1, value: 3 }, { time: 2, value: 8 }], 0)).toBeUndefined();
    expect(resolveTrendCursorValue([{ time: 1, value: 3 }, { time: 2, value: 8 }], 3)).toBeUndefined();
  });

  it('nunca retorna NaN ou Infinity para dados inválidos e limita o timestamp ao domínio válido', () => {
    const points = [
      { time: Number.NaN, value: 1 },
      { time: 1_000, value: 2 },
      { time: 2_000, value: Number.POSITIVE_INFINITY },
      { time: 3_000, value: 4 },
    ];

    expect(resolveTrendCursorValue(points, 2_000)).toBe(3);
    expect(resolveTrendCursorValue([], 1)).toBeUndefined();
    expect(resolveTrendCursorValue(points, Number.NaN)).toBeUndefined();
    expect(clampTrendCursorTime(points, 100)).toBe(1_000);
    expect(clampTrendCursorTime(points, 5_000)).toBe(3_000);
    expect(clampTrendCursorTime([], 1_000)).toBeUndefined();
    expect(isTrendCursorWithinSeries(points, 2_000)).toBe(true);
    expect(isTrendCursorWithinSeries(points, 4_000)).toBe(false);
  });
});
