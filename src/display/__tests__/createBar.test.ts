import { createDisplayDocument } from '../createDisplayDocument';
import { appendBar, createBar, getBarOptions, updateBarOptions, BAR_TYPE } from '../createBar';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('BarElement', () => {
  it('cria vertical por padrão e aceita orientação horizontal', () => {
    expect(createBar({ id: 'bar-1', binding })).toMatchObject({ type: BAR_TYPE, properties: { binding, orientation: 'vertical' } });
    expect(createBar({ id: 'bar-2', orientation: 'horizontal' }).properties.binding).toBeUndefined();
  });

  it('persiste orientação e escala', () => {
    const document = createDisplayDocument({ id: 'display' });
    const bar = createBar({ id: 'bar-1', binding });
    const next = updateBarOptions(appendBar(document, bar), bar.id, { orientation: 'horizontal', minimum: -10, maximum: 10 });
    expect(getBarOptions(next.elements[0].properties)).toMatchObject({ orientation: 'horizontal', minimum: -10, maximum: 10 });
  });
});
