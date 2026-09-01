import { createDisplayDocument } from '../createDisplayDocument';
import { appendGauge, createGauge, getGaugeOptions, updateGaugeOptions, GAUGE_TYPE } from '../createGauge';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('GaugeElement', () => {
  it('cria com escala padrão e pode permanecer sem binding', () => {
    const gauge = createGauge({ id: 'gauge-1', binding });
    expect(gauge).toMatchObject({ id: 'gauge-1', type: GAUGE_TYPE, properties: { binding, minimum: 0, maximum: 100, showScale: true } });
    expect(createGauge({ id: 'placeholder' }).properties.binding).toBeUndefined();
  });

  it('usa a cor base padrão quando ausente', () => {
    const gauge = createGauge({ id: 'gauge-default', binding });
    expect(getGaugeOptions(gauge.properties).color).toBe('#00a2e8');
  });

  it('permite ocultar a escala', () => {
    const gauge = createGauge({ id: 'gauge-no-scale', binding, options: { showScale: false } });
    expect(getGaugeOptions(gauge.properties).showScale).toBe(false);
  });

  it('preserva e normaliza a cor base configurada', () => {
    const gauge = createGauge({ id: 'gauge-color', binding, options: { color: '#ff9830' } });
    expect(gauge.properties.color).toBe('#ff9830');
    expect(getGaugeOptions({ minimum: 0, maximum: 100, color: 'not-a-color' }).color).toBe('#00a2e8');
    expect(getGaugeOptions({ minimum: 0, maximum: 100 }).color).toBe('#00a2e8');
  });

  it('atualiza a cor base sem alterar demais opções', () => {
    const document = createDisplayDocument({ id: 'display' });
    const gauge = createGauge({ id: 'gauge-1', binding, options: { minimum: 10, maximum: 90, decimals: 2, color: '#6e9fff' } });
    const next = updateGaugeOptions(appendGauge(document, gauge), gauge.id, { color: '#73bf69' });
    expect(next.elements[0].properties).toMatchObject({
      binding,
      minimum: 10,
      maximum: 90,
      decimals: 2,
      color: '#73bf69',
    });
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
