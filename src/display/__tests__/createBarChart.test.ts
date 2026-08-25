import {
  BAR_CHART_TYPE,
  createBarChart,
  appendBarChart,
  addBarChartItem,
  removeBarChartItem,
  moveBarChartItem,
  getBarChartItems,
  getBarChartVisualOptions,
  updateBarChartVisualOptions,
  updateBarChartProperties,
  normalizeBarChartVisualOptions,
  barChartBindingKey,
  getBarChartItemConsumerId,
} from '../createBarChart';
import { createDisplayDocument } from '../createDisplayDocument';
import type { PiPointBinding } from '../../pi/piPointBinding';

describe('createBarChart', () => {
  const sampleBinding: PiPointBinding = {
    dataSourceUid: 'pi-1',
    serverPath: 'SRV\\PIMS',
    pointName: 'SINUSOID',
  };

  const sampleBinding2: PiPointBinding = {
    dataSourceUid: 'pi-1',
    serverPath: 'SRV\\PIMS',
    pointName: 'CDT158',
  };

  it('creates a bar-chart element with valid initial item and defaults', () => {
    const element = createBarChart({
      binding: sampleBinding,
      x: 10,
      y: 20,
      width: 400,
      height: 250,
    });

    expect(element.type).toBe(BAR_CHART_TYPE);
    expect(element.x).toBe(10);
    expect(element.y).toBe(20);
    expect(element.width).toBe(400);
    expect(element.height).toBe(250);
    expect(element.properties.items).toHaveLength(1);
    expect(element.properties.items[0].binding).toEqual(sampleBinding);

    const visual = getBarChartVisualOptions(element);
    expect(visual.orientation).toBe('vertical');
    expect(visual.gridMode).toBe('lines');
    expect(visual.numberFormat).toBe('database');
    expect(visual.showLabel).toBe(true);
    expect(visual.showValue).toBe(true);
    expect(visual.showUnits).toBe(false);
    expect(visual.scaleMode).toBe('database');
  });

  it('throws when no valid binding is provided', () => {
    expect(() => createBarChart({})).toThrow('Gráfico de Barras requer um binding de PI Point válido');
  });

  it('appends bar-chart to document', () => {
    const doc = createDisplayDocument({ name: 'Test' });
    const element = createBarChart({ binding: sampleBinding });
    const nextDoc = appendBarChart(doc, element);

    expect(nextDoc.elements).toHaveLength(1);
    expect(nextDoc.elements[0].id).toBe(element.id);
  });

  it('computes binding key and consumer ID deterministically', () => {
    const key = barChartBindingKey(sampleBinding);
    expect(key).toBe('pi-1\u0000SRV\\PIMS\u0000SINUSOID');

    const consumerId = getBarChartItemConsumerId('elem-1', sampleBinding);
    expect(consumerId).toBe('bar-chart:elem-1:pi-1\u0000SRV\\PIMS\u0000SINUSOID');
  });

  it('adds new items and deduplicates existing items', () => {
    const element = createBarChart({ binding: sampleBinding, id: 'bc-1' });
    let doc = createDisplayDocument({ name: 'Test' });
    doc = appendBarChart(doc, element);

    // Add another tag
    doc = addBarChartItem(doc, 'bc-1', { binding: sampleBinding2, label: 'CDT 158' });
    const items = getBarChartItems(doc.elements[0] as any);
    expect(items).toHaveLength(2);
    expect(items[1].binding.pointName).toBe('CDT158');
    expect(items[1].label).toBe('CDT 158');

    // Attempt to add duplicate tag
    const docBefore = doc;
    doc = addBarChartItem(doc, 'bc-1', { binding: sampleBinding });
    expect(doc).toBe(docBefore);
    expect(getBarChartItems(doc.elements[0] as any)).toHaveLength(2);
  });

  it('removes item by index and prevents removing the last item', () => {
    const element = createBarChart({ binding: sampleBinding, id: 'bc-1' });
    let doc = createDisplayDocument({ name: 'Test' });
    doc = appendBarChart(doc, element);
    doc = addBarChartItem(doc, 'bc-1', { binding: sampleBinding2 });

    expect(getBarChartItems(doc.elements[0] as any)).toHaveLength(2);

    // Remove first item
    doc = removeBarChartItem(doc, 'bc-1', 0);
    let items = getBarChartItems(doc.elements[0] as any);
    expect(items).toHaveLength(1);
    expect(items[0].binding.pointName).toBe('CDT158');

    // Attempt to remove the last remaining item
    const docBefore = doc;
    doc = removeBarChartItem(doc, 'bc-1', 0);
    expect(doc).toBe(docBefore);
    items = getBarChartItems(doc.elements[0] as any);
    expect(items).toHaveLength(1);
  });

  it('moves item up and down in list', () => {
    const element = createBarChart({ binding: sampleBinding, id: 'bc-1' });
    let doc = createDisplayDocument({ name: 'Test' });
    doc = appendBarChart(doc, element);
    doc = addBarChartItem(doc, 'bc-1', { binding: sampleBinding2 });

    // Move index 0 down (+1)
    doc = moveBarChartItem(doc, 'bc-1', 0, 1);
    let items = getBarChartItems(doc.elements[0] as any);
    expect(items[0].binding.pointName).toBe('CDT158');
    expect(items[1].binding.pointName).toBe('SINUSOID');

    // Move index 1 up (-1)
    doc = moveBarChartItem(doc, 'bc-1', 1, -1);
    items = getBarChartItems(doc.elements[0] as any);
    expect(items[0].binding.pointName).toBe('SINUSOID');
    expect(items[1].binding.pointName).toBe('CDT158');
  });

  it('updates visual options and properties', () => {
    const element = createBarChart({ binding: sampleBinding, id: 'bc-1' });
    let doc = createDisplayDocument({ name: 'Test' });
    doc = appendBarChart(doc, element);

    doc = updateBarChartVisualOptions(doc, 'bc-1', {
      orientation: 'horizontal',
      gridMode: 'bands',
      numberFormat: 'number',
      decimals: 3,
      useThousandsSeparator: true,
    });

    const visual = getBarChartVisualOptions(doc.elements[0] as any);
    expect(visual.orientation).toBe('horizontal');
    expect(visual.gridMode).toBe('bands');
    expect(visual.numberFormat).toBe('number');
    expect(visual.decimals).toBe(3);
    expect(visual.useThousandsSeparator).toBe(true);

    doc = updateBarChartProperties(doc, 'bc-1', {
      visual: { title: 'New Title', showTitle: true },
    });
    const updatedVisual = getBarChartVisualOptions(doc.elements[0] as any);
    expect(updatedVisual.title).toBe('New Title');
    expect(updatedVisual.showTitle).toBe(true);
  });

  it('normalizes visual options on boundary conditions', () => {
    const normalized = normalizeBarChartVisualOptions({
      minimum: 50,
      maximum: 20, // max < min -> fallback to max = min + 1
      decimals: -5, // decimals < 0 -> clamp to 0
      orientation: 'invalid' as any,
      gridMode: 'invalid' as any,
      numberFormat: 'invalid' as any,
    });

    expect(normalized.minimum).toBe(50);
    expect(normalized.maximum).toBeGreaterThan(50);
    expect(normalized.decimals).toBe(0);
    expect(normalized.orientation).toBe('vertical');
    expect(normalized.gridMode).toBe('lines');
    expect(normalized.numberFormat).toBe('database');
  });
});
