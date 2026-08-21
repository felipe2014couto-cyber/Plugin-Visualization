import { createDisplayDocument } from '../createDisplayDocument';
import {
  addCalculationTrendSeries,
  addTrendSeries,
  appendTrend,
  createTrend,
  getTrendSeries,
  getTrendVisualOptions,
  updateTrendVisualOptions,
  TREND_TYPE,
} from '../createTrend';

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
      width: 1100,
      height: 460,
      properties: { series: [{ binding, color: '#6e9fff' }] },
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
    expect(next.elements[0].properties).toEqual({ series: [{ binding, color: '#6e9fff' }] });
    expect(next.elements[0].properties).not.toHaveProperty('points');
    expect(next.elements[0].properties).not.toHaveProperty('loading');
  });

  it('adiciona séries em ordem, evita duplicação e distingue datasource/servidor', () => {
    const trend = createTrend({ binding, id: 'trend-1' });
    const document = appendTrend(createDisplayDocument({ id: 'display-1' }), trend);
    const second = { ...binding, pointName: 'OTHER' };
    const sameNameOtherDataSource = { ...binding, dataSourceUid: 'other-ds' };

    const withSecond = addTrendSeries(document, trend.id, second);
    expect(addTrendSeries(withSecond, trend.id, second)).toBe(withSecond);
    const next = addTrendSeries(withSecond, trend.id, sameNameOtherDataSource);

    expect(getTrendSeries(next.elements[0] as typeof trend)).toEqual([
      { binding, color: '#6e9fff' },
      { binding: second, color: '#ff9830' },
      { binding: sameNameOtherDataSource, color: '#73bf69' },
    ]);
    expect(next.elements).toHaveLength(1);
  });

  it('adiciona um cálculo a uma Trend que já possui PI Points', () => {
    const trend = createTrend({ binding, id: 'trend-1' });
    const document = appendTrend(createDisplayDocument({ id: 'display-1' }), trend);

    const next = addCalculationTrendSeries(document, trend.id, 'calculation-1', 'Eficiência');

    expect(getTrendSeries(next.elements[0] as typeof trend)).toEqual([
      { binding, color: '#6e9fff' },
      {
        binding: { dataSourceUid: '__pims_calculation__', serverPath: 'calculation-1', pointName: 'calculation-1' },
        calculationId: 'calculation-1',
        legendLabel: 'Eficiência',
        color: '#ff9830',
      },
    ]);
    expect(addCalculationTrendSeries(next, trend.id, 'calculation-1', 'Eficiência')).toBe(next);
  });

  it('preserva e atualiza legendWidth nas opções visuais da Trend', () => {
    const trend = createTrend({ binding, id: 'trend-1' });
    const document = appendTrend(createDisplayDocument({ id: 'display-1' }), trend);

    const updated = updateTrendVisualOptions(document, trend.id, { legendWidth: 280 });
    const updatedTrend = updated.elements[0] as typeof trend;
    const visual = getTrendVisualOptions(updatedTrend);

    expect(visual.legendWidth).toBe(280);
  });
});
