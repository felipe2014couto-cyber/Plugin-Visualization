import { createDisplayDocument } from '../createDisplayDocument';
import { appendGauge, createGauge, getGaugeOptions, updateGaugeOptions, GAUGE_TYPE } from '../createGauge';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('GaugeElement', () => {
  it('cria com escala padrão e pode permanecer sem binding', () => {
    const gauge = createGauge({ id: 'gauge-1', binding });
    expect(gauge).toMatchObject({ id: 'gauge-1', type: GAUGE_TYPE, properties: { binding, minimum: 0, maximum: 100 } });
    expect(createGauge({ id: 'placeholder' }).properties.binding).toBeUndefined();
  });

  it('anexa e atualiza apenas as opções do Gauge', () => {
    const document = createDisplayDocument({ id: 'display' });
    const gauge = createGauge({ id: 'gauge-1', binding });
    const next = updateGaugeOptions(appendGauge(document, gauge), gauge.id, { minimum: 10, maximum: 90, decimals: 2 });
    expect(next.elements[0]).toMatchObject({ id: gauge.id, properties: { binding, minimum: 10, maximum: 90, decimals: 2 } });
    expect(getGaugeOptions(next.elements[0].properties)).toMatchObject({ minimum: 10, maximum: 90, decimals: 2 });
    expect(document.elements).toHaveLength(0);
  });
});
