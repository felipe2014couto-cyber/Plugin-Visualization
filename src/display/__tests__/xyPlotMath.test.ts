import { linearRegression, pairXYByPosition, pairXYByTimestamp, pearsonCorrelation } from '../xyPlotMath';

describe('XY Plot pairings', () => {
  const xs = [{ time: 10, value: 1 }, { time: 20, value: 2 }, { time: 30, value: 3 }];
  const ys = [{ time: 10, value: 10 }, { time: 30, value: 30 }];
  it('interpolates only inside the Y historical range', () => expect(pairXYByTimestamp(xs, ys, 'interpolated')).toEqual([{ time: 10, x: 1, y: 10 }, { time: 20, x: 2, y: 20 }, { time: 30, x: 3, y: 30 }]));
  it('supports exact, previous and next timestamp semantics', () => { expect(pairXYByTimestamp(xs, ys, 'exact')).toHaveLength(2); expect(pairXYByTimestamp(xs, ys, 'previous')[1].y).toBe(10); expect(pairXYByTimestamp(xs, ys, 'next')[1].y).toBe(30); });
  it('pairs by list position without interpolating', () => expect(pairXYByPosition(xs, ys)).toEqual([{ time: 10, x: 1, y: 10 }, { time: 20, x: 2, y: 30 }]));
  it('calculates linear regression and Pearson correlation', () => { const pairs = [{ time: 1, x: 1, y: 3 }, { time: 2, x: 2, y: 5 }, { time: 3, x: 3, y: 7 }]; expect(linearRegression(pairs)).toEqual({ slope: 2, intercept: 1 }); expect(pearsonCorrelation(pairs)).toBeCloseTo(1); });
});
