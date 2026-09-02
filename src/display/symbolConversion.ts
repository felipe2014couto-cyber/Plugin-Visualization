import type { PiPointBinding } from '../pi/piPointBinding';
import { isPiPointBinding } from '../pi/piPointBinding';
import type { DisplayElement } from './displayElement';
import { createValue, VALUE_TYPE } from './createValue';
import { createGauge, GAUGE_TYPE } from './createGauge';
import { createBar, BAR_TYPE } from './createBar';
import { createTrend, getTrendSeries, trendSeriesColor, TREND_TYPE } from './createTrend';
import { createTable, TABLE_TYPE } from './createTable';
import { createBarChart, BAR_CHART_TYPE } from './createBarChart';
import { createXYPlot, getXYPlotYSeries, XY_PLOT_TYPE } from './createXYPlot';

/** The data binding contract used by symbol replacement. */
import type { DataSourceCapability as SymbolBindingCapability } from './dataSourceBehavior';

export type { SymbolBindingCapability };
export type SymbolConversionType = typeof VALUE_TYPE | typeof GAUGE_TYPE | typeof BAR_TYPE | typeof TREND_TYPE | typeof TABLE_TYPE | typeof BAR_CHART_TYPE | typeof XY_PLOT_TYPE;

export const symbolConversionTargets: Array<{ type: SymbolConversionType; label: string; capability: SymbolBindingCapability }> = [
  { type: TABLE_TYPE, label: 'Tabela', capability: 'multiple' },
  { type: TREND_TYPE, label: 'Tendência', capability: 'multiple' },
  { type: VALUE_TYPE, label: 'Valor', capability: 'single' },
  { type: BAR_CHART_TYPE, label: 'Gráfico de Barras', capability: 'multiple' },
  { type: GAUGE_TYPE, label: 'Medidor', capability: 'single' },
  { type: BAR_TYPE, label: 'Barra', capability: 'single' },
  { type: XY_PLOT_TYPE, label: 'Plotagem XY', capability: 'xy' },
];

const copyBinding = (binding: PiPointBinding): PiPointBinding => ({ ...binding });

/** Returns bindings in the same order in which the source visualizes them. */
export function getElementPiBindings(element: DisplayElement): PiPointBinding[] {
  const props = element.properties as Record<string, unknown>;
  if (element.type === TREND_TYPE) return getTrendSeries(element as any).map((series) => copyBinding(series.binding));
  if (element.type === XY_PLOT_TYPE) {
    const xy = element as any;
    return [xy.properties.xBinding, ...getXYPlotYSeries(xy.properties).map((series) => series.binding)]
      .filter(isPiPointBinding).map(copyBinding);
  }
  if (element.type === TABLE_TYPE || element.type === BAR_CHART_TYPE) {
    const items = Array.isArray(props.items) ? props.items : [];
    return items.map((item: any) => item?.binding).filter(isPiPointBinding).map(copyBinding);
  }
  return isPiPointBinding(props.binding) ? [copyBinding(props.binding)] : [];
}

function commonProperties(source: DisplayElement, target: DisplayElement): DisplayElement {
  const sourceProps = source.properties as Record<string, unknown>;
  const targetProps = target.properties as Record<string, unknown>;
  const common: Record<string, unknown> = {};
  for (const key of ['linkUrl', 'openInNewTab', 'locked']) {
    if (key in sourceProps) common[key] = sourceProps[key];
  }
  return { ...target, properties: { ...targetProps, ...common } };
}

/** Creates a destination element with the source identity and exact geometry. */
export function convertDisplayElementType(source: DisplayElement, targetType: SymbolConversionType, bindings: PiPointBinding[]): DisplayElement {
  if (!bindings.length) throw new Error('O elemento não possui PI Point para converter.');
  const geometry = { id: source.id, x: source.x, y: source.y, width: source.width, height: source.height };
  const first = bindings[0];
  let target: DisplayElement;
  switch (targetType) {
    case VALUE_TYPE: target = createValue({ ...geometry, binding: first }); break;
    case GAUGE_TYPE: target = createGauge({ ...geometry, binding: first }); break;
    case BAR_TYPE: target = createBar({ ...geometry, binding: first }); break;
    case TREND_TYPE: {
      const trend = createTrend({ ...geometry, binding: first });
      target = { ...trend, properties: { ...trend.properties, series: bindings.map((binding, index) => ({ binding: copyBinding(binding), color: trendSeriesColor(index) })) } };
      break;
    }
    case TABLE_TYPE: {
      const table = createTable({ ...geometry, item: { binding: first } });
      target = { ...table, properties: { ...table.properties, items: bindings.map((binding) => ({ binding: copyBinding(binding) })) } };
      break;
    }
    case BAR_CHART_TYPE: {
      const chart = createBarChart({ ...geometry, binding: first });
      target = { ...chart, properties: { ...chart.properties, items: bindings.map((binding) => ({ binding: copyBinding(binding) })) } };
      break;
    }
    case XY_PLOT_TYPE:
      target = createXYPlot({ ...geometry, xBinding: first, ySeries: bindings.slice(1).map((binding) => ({ binding: copyBinding(binding) })) });
      break;
    default: throw new Error('Tipo de símbolo não suportado.');
  }
  return commonProperties(source, target);
}
