import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import { updateElementInDocument } from './createGroup';

export const BAR_CHART_TYPE = 'bar-chart' as const;

export type BarChartOrientation = 'vertical' | 'horizontal';
export type BarChartGridMode = 'bands' | 'lines' | 'plain';
export type BarChartNumberFormat = 'database' | 'general' | 'number' | 'scientific';
export type BarChartLabelMode = 'default' | 'name' | 'tag' | 'description' | 'custom';
export type BarChartScaleMode = 'database' | 'custom';
export type BarChartStartMode = 'default' | 'custom';

export interface BarChartItem {
  binding: PiPointBinding;
  label?: string;
  description?: string;
  engineeringUnit?: string;
  nameMode?: 'default' | 'custom';
  customName?: string;
}

export interface BarChartVisualOptions {
  showTitle: boolean;
  title: string;
  barColor: string;
  foregroundColor: string;
  backgroundColor: string;
  valueColor: string;
  numberFormat: BarChartNumberFormat;
  decimals: number | null;
  useThousandsSeparator: boolean;
  labelMode: BarChartLabelMode;
  orientation: BarChartOrientation;
  gridMode: BarChartGridMode;
  showLabel: boolean;
  showValue: boolean;
  showScale: boolean;
  showUnits: boolean;
  scaleMode: BarChartScaleMode;
  minimum: number;
  maximum: number;
  invertScale: boolean;
  barStartMode: BarChartStartMode;
  barStartValue: number;
}

export const DEFAULT_BAR_CHART_VISUAL_OPTIONS: BarChartVisualOptions = {
  showTitle: false,
  title: '',
  barColor: '#5794f2',
  foregroundColor: 'var(--text-primary, #f8fafc)',
  backgroundColor: 'transparent',
  valueColor: 'var(--text-primary, #f8fafc)',
  numberFormat: 'database',
  decimals: null,
  useThousandsSeparator: false,
  labelMode: 'default',
  orientation: 'vertical',
  gridMode: 'lines',
  showLabel: true,
  showValue: true,
  showScale: true,
  showUnits: false,
  scaleMode: 'database',
  minimum: 0,
  maximum: 100,
  invertScale: false,
  barStartMode: 'default',
  barStartValue: 0,
};

export interface BarChartProperties extends Record<string, unknown> {
  items: BarChartItem[];
  visual?: Partial<BarChartVisualOptions>;
}

export type BarChartElement = DisplayElement<typeof BAR_CHART_TYPE, BarChartProperties>;

export const DEFAULT_BAR_CHART_WIDTH = 420;
export const DEFAULT_BAR_CHART_HEIGHT = 280;

export interface CreateBarChartOptions {
  item?: BarChartItem;
  binding?: PiPointBinding;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visual?: Partial<BarChartVisualOptions>;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createBarChart(options: CreateBarChartOptions): BarChartElement {
  const initialItem = options.item ?? (options.binding ? { binding: { ...options.binding } } : undefined);
  if (!initialItem || !isPiPointBinding(initialItem.binding)) {
    throw new Error('Gráfico de Barras requer um binding de PI Point válido');
  }

  const surface = options.surface;
  const width = options.width ?? Math.min(DEFAULT_BAR_CHART_WIDTH, surface?.width ?? DEFAULT_BAR_CHART_WIDTH);
  const height = options.height ?? Math.min(DEFAULT_BAR_CHART_HEIGHT, surface?.height ?? DEFAULT_BAR_CHART_HEIGHT);
  const safeWidth = Math.max(1, Math.min(width, surface?.width ?? width));
  const safeHeight = Math.max(1, Math.min(height, surface?.height ?? height));
  const generate = options.generateId ?? generateId;
  const existingIds = new Set(options.existingIds ?? []);
  let id = options.id ?? generate();
  while (existingIds.has(id)) {
    id = generate();
  }

  return {
    id,
    type: BAR_CHART_TYPE,
    x: options.x ?? Math.max(0, ((surface?.width ?? safeWidth) - safeWidth) / 2),
    y: options.y ?? Math.max(0, ((surface?.height ?? safeHeight) - safeHeight) / 2),
    width: safeWidth,
    height: safeHeight,
    properties: {
      items: [copyBarChartItem(initialItem)],
      visual: normalizeBarChartVisualOptions(options.visual),
    },
  };
}

export function appendBarChart(document: DisplayDocument, element: BarChartElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}

export function barChartBindingKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.webId ?? `${binding.serverPath}\u0000${binding.pointName}`}`;
}

export function getBarChartItemConsumerId(elementId: string, binding: PiPointBinding): string {
  return `bar-chart:${elementId}:${barChartBindingKey(binding)}`;
}

export function getBarChartItems(element: BarChartElement): BarChartItem[] {
  return (element.properties.items ?? []).map(copyBarChartItem);
}

export function getBarChartVisualOptions(element: BarChartElement): BarChartVisualOptions {
  return normalizeBarChartVisualOptions(element.properties.visual);
}

export function addBarChartItem(
  document: DisplayDocument,
  elementId: string,
  item: BarChartItem,
): DisplayDocument {
  if (!isPiPointBinding(item.binding)) {
    return document;
  }
  return updateBarChartElement(document, elementId, (element) => {
    const items = getBarChartItems(element);
    const itemKey = barChartBindingKey(item.binding);
    if (items.some((existing) => barChartBindingKey(existing.binding) === itemKey)) {
      return element;
    }
    return {
      ...element,
      properties: {
        ...element.properties,
        items: [...items, copyBarChartItem(item)],
      },
    };
  });
}

export function removeBarChartItem(
  document: DisplayDocument,
  elementId: string,
  index: number,
): DisplayDocument {
  return updateBarChartElement(document, elementId, (element) => {
    const items = getBarChartItems(element);
    if (index < 0 || index >= items.length || items.length <= 1) {
      return element;
    }
    return {
      ...element,
      properties: {
        ...element.properties,
        items: items.filter((_, itemIndex) => itemIndex !== index),
      },
    };
  });
}

export function moveBarChartItem(
  document: DisplayDocument,
  elementId: string,
  index: number,
  offset: -1 | 1,
): DisplayDocument {
  return updateBarChartElement(document, elementId, (element) => {
    const items = getBarChartItems(element);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return element;
    }
    const nextItems = [...items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(nextIndex, 0, moved);
    return {
      ...element,
      properties: {
        ...element.properties,
        items: nextItems,
      },
    };
  });
}

export function updateBarChartVisualOptions(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<BarChartVisualOptions>,
): DisplayDocument {
  return updateBarChartElement(document, elementId, (element) => ({
    ...element,
    properties: {
      ...element.properties,
      visual: normalizeBarChartVisualOptions({
        ...getBarChartVisualOptions(element),
        ...patch,
      }),
    },
  }));
}

export function updateBarChartProperties(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<BarChartProperties>,
): DisplayDocument {
  return updateBarChartElement(document, elementId, (element) => ({
    ...element,
    properties: {
      ...element.properties,
      ...patch,
      ...(patch.visual ? { visual: normalizeBarChartVisualOptions({ ...getBarChartVisualOptions(element), ...patch.visual }) } : {}),
    },
  }));
}

export function normalizeBarChartVisualOptions(visual?: Partial<BarChartVisualOptions>): BarChartVisualOptions {
  const merged = { ...DEFAULT_BAR_CHART_VISUAL_OPTIONS, ...(visual ?? {}) };
  const minimum = Number.isFinite(merged.minimum) ? merged.minimum : DEFAULT_BAR_CHART_VISUAL_OPTIONS.minimum;
  const maximum = Number.isFinite(merged.maximum) && merged.maximum > minimum ? merged.maximum : Math.max(minimum + 1, DEFAULT_BAR_CHART_VISUAL_OPTIONS.maximum);
  const decimals = typeof merged.decimals === 'number' && Number.isFinite(merged.decimals) ? Math.max(0, Math.min(10, Math.round(merged.decimals))) : null;

  return {
    showTitle: typeof merged.showTitle === 'boolean' ? merged.showTitle : DEFAULT_BAR_CHART_VISUAL_OPTIONS.showTitle,
    title: typeof merged.title === 'string' ? merged.title : DEFAULT_BAR_CHART_VISUAL_OPTIONS.title,
    barColor: typeof merged.barColor === 'string' && merged.barColor.trim() ? merged.barColor : DEFAULT_BAR_CHART_VISUAL_OPTIONS.barColor,
    foregroundColor: typeof merged.foregroundColor === 'string' && merged.foregroundColor.trim() ? merged.foregroundColor : DEFAULT_BAR_CHART_VISUAL_OPTIONS.foregroundColor,
    backgroundColor: typeof merged.backgroundColor === 'string' ? merged.backgroundColor : DEFAULT_BAR_CHART_VISUAL_OPTIONS.backgroundColor,
    valueColor: typeof merged.valueColor === 'string' && merged.valueColor.trim() ? merged.valueColor : DEFAULT_BAR_CHART_VISUAL_OPTIONS.valueColor,
    numberFormat: ['database', 'general', 'number', 'scientific'].includes(merged.numberFormat) ? merged.numberFormat : DEFAULT_BAR_CHART_VISUAL_OPTIONS.numberFormat,
    decimals,
    useThousandsSeparator: typeof merged.useThousandsSeparator === 'boolean' ? merged.useThousandsSeparator : DEFAULT_BAR_CHART_VISUAL_OPTIONS.useThousandsSeparator,
    labelMode: ['default', 'tag', 'name', 'description', 'custom'].includes(merged.labelMode) ? merged.labelMode : DEFAULT_BAR_CHART_VISUAL_OPTIONS.labelMode,
    orientation: merged.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    gridMode: ['bands', 'lines', 'plain'].includes(merged.gridMode) ? merged.gridMode : DEFAULT_BAR_CHART_VISUAL_OPTIONS.gridMode,
    showLabel: typeof merged.showLabel === 'boolean' ? merged.showLabel : DEFAULT_BAR_CHART_VISUAL_OPTIONS.showLabel,
    showValue: typeof merged.showValue === 'boolean' ? merged.showValue : DEFAULT_BAR_CHART_VISUAL_OPTIONS.showValue,
    showScale: typeof merged.showScale === 'boolean' ? merged.showScale : DEFAULT_BAR_CHART_VISUAL_OPTIONS.showScale,
    showUnits: typeof merged.showUnits === 'boolean' ? merged.showUnits : DEFAULT_BAR_CHART_VISUAL_OPTIONS.showUnits,
    scaleMode: merged.scaleMode === 'custom' ? 'custom' : 'database',
    minimum,
    maximum,
    invertScale: typeof merged.invertScale === 'boolean' ? merged.invertScale : DEFAULT_BAR_CHART_VISUAL_OPTIONS.invertScale,
    barStartMode: merged.barStartMode === 'custom' ? 'custom' : 'default',
    barStartValue: Number.isFinite(merged.barStartValue) ? merged.barStartValue : DEFAULT_BAR_CHART_VISUAL_OPTIONS.barStartValue,
  };
}

function copyBarChartItem(item: BarChartItem): BarChartItem {
  return {
    binding: { ...item.binding },
    ...(item.label ? { label: item.label } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.engineeringUnit ? { engineeringUnit: item.engineeringUnit } : {}),
    ...(item.nameMode ? { nameMode: item.nameMode } : {}),
    ...(item.customName ? { customName: item.customName } : {}),
  };
}

function updateBarChartElement(
  document: DisplayDocument,
  elementId: string,
  update: (element: BarChartElement) => BarChartElement,
): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => {
    if (element.type !== BAR_CHART_TYPE) return element;
    return update(element as BarChartElement);
  });
}
