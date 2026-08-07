import { createDisplayDocument } from '../createDisplayDocument';
import { appendTrend, createTrend, TREND_TYPE } from '../createTrend';

const binding = {
  dataSourceUid: 'resolved-datasource',
  serverPath: 'pims',
  pointName: 'SINUSOID',
};

describe('TrendElement', () => {
  it('cria Trend com geometry útil e binding persistível', () => {
    const document = createDisplayDocument({ id: 'display-1' });
    const trend = createTrend({ binding, id: 'trend-1', surface: document.surface });

    expect(trend).toMatchObject({
      id: 'trend-1',
      type: TREND_TYPE,
      width: 520,
      height: 280,
      properties: { binding },
    });
    expect(trend.x).toBeGreaterThanOrEqual(0);
    expect(trend.y).toBeGreaterThanOrEqual(0);
    expect(() => createTrend({ binding: { ...binding, pointName: '' } })).toThrow();
  });

  it('adiciona Trend sem persistir estado histórico', () => {
    const document = createDisplayDocument({ id: 'display-1' });
    const trend = createTrend({ binding, id: 'trend-1' });
    const next = appendTrend(document, trend);

    expect(next.elements).toEqual([trend]);
    expect(next.elements[0].properties).toEqual({ binding });
    expect(next.elements[0].properties).not.toHaveProperty('points');
    expect(next.elements[0].properties).not.toHaveProperty('loading');
  });
});
