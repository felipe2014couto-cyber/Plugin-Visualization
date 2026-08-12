import { createDisplayDocument } from '../createDisplayDocument';
import { appendBar, createBar, getBarOptions, updateBarOptions, BAR_TYPE } from '../createBar';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('BarElement', () => {
  it('cria vertical por padrão e aceita orientação horizontal', () => {
    expect(createBar({ id: 'bar-1', binding })).toMatchObject({ type: BAR_TYPE, properties: { binding, orientation: 'vertical' } });
    expect(createBar({ id: 'bar-2', orientation: 'horizontal' }).properties.binding).toBeUndefined();
  });

  it('usa a cor base padrão quando ausente', () => {
    const bar = createBar({ id: 'bar-default', binding });
    expect(getBarOptions(bar.properties).color).toBe('#6e9fff');
    expect(getBarOptions({ minimum: 0, maximum: 100 }).color).toBe('#6e9fff');
  });

  it('preserva a cor base configurada e normaliza inválidas', () => {
    const bar = createBar({ id: 'bar-color', binding, options: { color: '#f2495c' } });
    expect(bar.properties.color).toBe('#f2495c');
    expect(getBarOptions({ minimum: 0, maximum: 100, color: 'invalid' }).color).toBe('#6e9fff');
  });

  it('atualiza a cor base sem alterar orientação nem geometria', () => {
    const document = createDisplayDocument({ id: 'display' });
    const bar = createBar({ id: 'bar-1', binding, orientation: 'horizontal', options: { minimum: -10, maximum: 10, color: '#6e9fff' } });
    const next = updateBarOptions(appendBar(document, bar), bar.id, { color: '#fade2a' });
    expect(next.elements[0].properties).toMatchObject({
      binding,
      orientation: 'horizontal',
      minimum: -10,
      maximum: 10,
      color: '#fade2a',
    });
    expect(next.elements[0].x).toBe(bar.x);
    expect(next.elements[0].y).toBe(bar.y);
    expect(next.elements[0].width).toBe(bar.width);
    expect(next.elements[0].height).toBe(bar.height);
  });

  it('persiste orientação e escala', () => {
    const document = createDisplayDocument({ id: 'display' });
    const bar = createBar({ id: 'bar-1', binding });
    const next = updateBarOptions(appendBar(document, bar), bar.id, { orientation: 'horizontal', minimum: -10, maximum: 10 });
    expect(getBarOptions(next.elements[0].properties)).toMatchObject({ orientation: 'horizontal', minimum: -10, maximum: 10 });
  });
});
