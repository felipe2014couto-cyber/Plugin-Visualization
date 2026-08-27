import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';

export const TREND_TYPE = 'trend' as const;

export interface TrendSeries {
  binding: PiPointBinding;
  calculationId?: string;
  color: string;
  legendLabel?: string;
  lineWidth?: number;
  lineStyle?: TrendLineStyle;
  marker?: TrendMarker;
  primaryScale?: boolean;
  scaleMin?: number;
  scaleMax?: number;
}

export type TrendLineStyle = 'solid' | 'dashed' | 'dotted';
export type TrendMarker = 'none' | 'circle' | 'square';
export type TrendNumberFormat = 'automatic' | 'integer' | 'oneDecimal' | 'twoDecimals';
export type TrendScaleMode = 'single' | 'individual' | 'multiple' | 'configurable';
export type TrendTraceMode = 'line' | 'line-markers' | 'markers';
export type TrendGridMode = 'horizontal' | 'both' | 'none';

export interface TrendVisualOptions {
  title: string;
  showRegression: boolean;
  hideLegend?: boolean;
  numberFormat: TrendNumberFormat;
  scaleIntervals: 2 | 5 | 10;
  scaleMode: TrendScaleMode;
  fontFamily: string;
  fontSize: number;
  legendWidth?: number;
  traceMode: TrendTraceMode;
  gridMode: TrendGridMode;
  /** Empty keeps the current theme color. */
  foregroundColor: string;
  /** Empty keeps the current theme background. */
  backgroundColor: string;
}

export const DEFAULT_TREND_VISUAL_OPTIONS: TrendVisualOptions = {
  title: '',
  showRegression: false,
  hideLegend: false,
  numberFormat: 'automatic',
  scaleIntervals: 10,
  scaleMode: 'single',
  fontFamily: 'Arial',
  fontSize: 16,
  traceMode: 'line',
  gridMode: 'horizontal',
  foregroundColor: '',
  backgroundColor: '',
};

export interface TrendProperties extends Record<string, unknown> {
  /** Legacy single-series contract, read for backwards compatibility only. */
  binding?: PiPointBinding;
  series?: TrendSeries[];
  visual?: Partial<TrendVisualOptions>;
}

export type TrendElement = DisplayElement<typeof TREND_TYPE, TrendProperties>;

// A new Trend must leave a comfortable working margin around itself.  Users
// can still resize it freely after insertion.
export const DEFAULT_TREND_WIDTH = 480;
export const DEFAULT_TREND_HEIGHT = 250;
export const TREND_SERIES_COLORS = [
  '#6e9fff',
  '#ff9830',
  '#73bf69',
  '#f2495c',
  '#b877d9',
  '#fade2a',
  '#8ab8ff',
  '#ff780a',
  '#56d2ba',
  '#e0b400',
  '#5794f2',
  '#c15c17',
  '#96d98d',
  '#ff7383',
  '#cca6e8',
  '#ffec75',
  '#1f78c1',
  '#bf1b00',
  '#37872d',
  '#8f3bb8',
] as const;

export interface CreateTrendOptions {
  binding?: PiPointBinding;
  calculationId?: string;
  calculationName?: string;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createTrend(options: CreateTrendOptions): TrendElement {
  if (!isPiPointBinding(options.binding) && !options.calculationId) {
    throw new Error('Trend requer um binding de PI Point válido');
  }

  const surface = options.surface;
  const width = options.width ?? Math.min(DEFAULT_TREND_WIDTH, surface?.width ?? DEFAULT_TREND_WIDTH);
  const height = options.height ?? Math.min(DEFAULT_TREND_HEIGHT, surface?.height ?? DEFAULT_TREND_HEIGHT);
  const safeWidth = Math.max(1, Math.min(width, surface?.width ?? width));
  const safeHeight = Math.max(1, Math.min(height, surface?.height ?? height));
  const x = options.x ?? Math.max(0, ((surface?.width ?? safeWidth) - safeWidth) / 2);
  const y = options.y ?? Math.max(0, ((surface?.height ?? safeHeight) - safeHeight) / 2);
  const generate = options.generateId ?? generateId;
  const existingIds = new Set(options.existingIds ?? []);
  let id = options.id ?? generate();

  while (existingIds.has(id)) {
    id = generate();
  }

  return {
    id,
    type: TREND_TYPE,
    x,
    y,
    width: safeWidth,
    height: safeHeight,
    properties: {
      series: [{
        binding: options.binding ? { ...options.binding } : createCalculationTrendBinding(options.calculationId!),
        ...(options.calculationId ? { calculationId: options.calculationId, legendLabel: options.calculationName } : {}),
        color: trendSeriesColor(0),
      }],
    },
  };
}

export function appendTrend(document: DisplayDocument, element: TrendElement): DisplayDocument {
  return {
    ...document,
    elements: [...document.elements, element],
  };
}

export function getTrendSeries(element: Pick<TrendElement, 'properties'>): TrendSeries[] {
  const configured = Array.isArray(element.properties.series)
    ? element.properties.series.filter((series): series is TrendSeries => (
      !!series
      && isPiPointBinding(series.binding)
      && typeof series.color === 'string'
      && series.color.trim().length > 0
    ))
    : [];
  if (configured.length > 0) {
    return deduplicateTrendSeries(configured);
  }
  return isPiPointBinding(element.properties.binding)
    ? [{ binding: element.properties.binding, color: trendSeriesColor(0) }]
    : [];
}

export function getTrendVisualOptions(element: Pick<TrendElement, 'properties'>): TrendVisualOptions {
  const visual = element.properties.visual ?? {};
  const legendWidth = typeof visual.legendWidth === 'number' && Number.isFinite(visual.legendWidth) && visual.legendWidth >= 100
    ? Math.round(visual.legendWidth)
    : undefined;
  return {
    title: typeof visual.title === 'string' ? visual.title : DEFAULT_TREND_VISUAL_OPTIONS.title,
    showRegression: visual.showRegression === true,
    hideLegend: visual.hideLegend === true,
    numberFormat: visual.numberFormat === 'integer' || visual.numberFormat === 'oneDecimal' || visual.numberFormat === 'twoDecimals'
      ? visual.numberFormat
      : 'automatic',
    scaleIntervals: visual.scaleIntervals === 2 || visual.scaleIntervals === 5 || visual.scaleIntervals === 10 ? visual.scaleIntervals : 10,
    scaleMode: visual.scaleMode === 'individual' || visual.scaleMode === 'configurable' ? visual.scaleMode : 'single',
    fontFamily: typeof visual.fontFamily === 'string' && visual.fontFamily.trim() ? visual.fontFamily : 'Arial',
    fontSize: typeof visual.fontSize === 'number' && Number.isFinite(visual.fontSize) ? Math.max(10, Math.min(24, visual.fontSize)) : 16,
    traceMode: visual.traceMode === 'line-markers' || visual.traceMode === 'markers' ? visual.traceMode : 'line',
    gridMode: visual.gridMode === 'both' || visual.gridMode === 'none' ? visual.gridMode : 'horizontal',
    foregroundColor: typeof visual.foregroundColor === 'string' ? visual.foregroundColor : '',
    backgroundColor: typeof visual.backgroundColor === 'string' ? visual.backgroundColor : '',
    ...(legendWidth !== undefined ? { legendWidth } : {}),
  };
}

export function updateTrendVisualOptions(document: DisplayDocument, elementId: string, patch: Partial<TrendVisualOptions>): DisplayDocument {
  return updateTrendElement(document, elementId, (element) => ({
    ...element,
    properties: { ...element.properties, visual: { ...getTrendVisualOptions(element), ...patch } },
  }));
}

export function updateTrendSeriesOptions(document: DisplayDocument, elementId: string, bindingKey: string, patch: Partial<Omit<TrendSeries, 'binding'>>): DisplayDocument {
  return updateTrendElement(document, elementId, (element) => ({
    ...element,
    properties: {
      ...element.properties,
      series: getTrendSeries(element).map((series) => trendBindingKey(series.binding) === bindingKey
        ? { ...series, ...patch }
        : patch.primaryScale === true ? { ...series, primaryScale: false } : series),
    },
  }));
}

export function removeTrendSeries(document: DisplayDocument, elementId: string, bindingKey: string): DisplayDocument {
  return updateTrendElement(document, elementId, (element) => {
    const series = getTrendSeries(element);
    if (series.length <= 1) {
      return element;
    }
    const remaining = series.filter((item) => trendBindingKey(item.binding) !== bindingKey);
    if (remaining.length > 0 && !remaining.some((item) => item.primaryScale === true)) {
      remaining[0] = { ...remaining[0], primaryScale: true };
    }
    return { ...element, properties: { ...element.properties, series: remaining } };
  });
}

import { updateElementInDocument } from './createGroup';

export function addTrendSeries(
  document: DisplayDocument,
  elementId: string,
  binding: PiPointBinding,
): DisplayDocument {
  if (!isPiPointBinding(binding)) {
    return document;
  }
  return updateTrendElement(document, elementId, (element) => {
    const series = getTrendSeries(element);
    const bindingKey = trendBindingKey(binding);
    if (series.some((item) => trendBindingKey(item.binding) === bindingKey)) {
      return element;
    }
    const currentProperties = { ...element.properties };
    delete currentProperties.binding;
    return {
      ...element,
      properties: {
        ...currentProperties,
        visual: { ...getTrendVisualOptions(element), scaleMode: 'single' },
        series: [...series, { binding: { ...binding }, color: trendSeriesColor(series.length) }],
      },
    };
  });
}

export function addCalculationTrendSeries(
  document: DisplayDocument,
  elementId: string,
  calculationId: string,
  calculationName?: string,
): DisplayDocument {
  if (!calculationId.trim()) {
    return document;
  }
  return updateTrendElement(document, elementId, (element) => {
    const series = getTrendSeries(element);
    if (series.some((item) => item.calculationId === calculationId)) {
      return element;
    }
    const currentProperties = { ...element.properties };
    delete currentProperties.binding;
    return {
      ...element,
      properties: {
        ...currentProperties,
        visual: { ...getTrendVisualOptions(element), scaleMode: 'single' },
        series: [...series, {
          binding: createCalculationTrendBinding(calculationId),
          calculationId,
          ...(calculationName ? { legendLabel: calculationName } : {}),
          color: trendSeriesColor(series.length),
        }],
      },
    };
  });
}

export function trendBindingKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

export function createCalculationTrendBinding(calculationId: string): PiPointBinding {
  return { dataSourceUid: '__pims_calculation__', serverPath: calculationId, pointName: calculationId };
}

export function trendSeriesColor(index: number): string {
  return TREND_SERIES_COLORS[index % TREND_SERIES_COLORS.length];
}

function deduplicateTrendSeries(series: readonly TrendSeries[]): TrendSeries[] {
  const unique = new Map<string, TrendSeries>();
  for (const item of series) {
    const key = trendBindingKey(item.binding);
    if (!unique.has(key)) {
      unique.set(key, { ...item, binding: { ...item.binding } });
    }
  }
  return [...unique.values()];
}

function updateTrendElement(document: DisplayDocument, elementId: string, update: (element: TrendElement) => TrendElement): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => {
    if (element.type !== TREND_TYPE) return element;
    return update(element as TrendElement);
  });
}

export function createTrendElementForElement(element: DisplayElement): TrendElement | null {
  if (element.type === TREND_TYPE) {
    return element as TrendElement;
  }

  if (element.type === 'bar-chart') {
    const items = ((element.properties as { items?: unknown[] })?.items ?? []) as Array<{
      binding?: unknown;
      label?: string;
      customName?: string;
      description?: string;
    }>;
    const validItems = items.filter((item) => isPiPointBinding(item.binding));
    if (validItems.length === 0) return null;
    const series: TrendSeries[] = validItems.map((item, idx) => ({
      binding: item.binding as PiPointBinding,
      color: TREND_SERIES_COLORS[idx % TREND_SERIES_COLORS.length],
      legendLabel: item.customName || item.label || item.description || (item.binding as PiPointBinding).pointName,
    }));
    const visual = (element.properties as { visual?: { title?: string } })?.visual;
    return {
      id: element.id,
      type: TREND_TYPE,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      properties: {
        series,
        visual: {
          title: visual?.title || '',
        },
      },
    };
  }

  if (element.type === 'table') {
    const items = ((element.properties as { items?: unknown[] })?.items ?? []) as Array<{
      binding?: unknown;
      label?: string;
    }>;
    const validItems = items.filter((item) => isPiPointBinding(item.binding));
    if (validItems.length === 0) return null;
    const series: TrendSeries[] = validItems.map((item, idx) => ({
      binding: item.binding as PiPointBinding,
      color: TREND_SERIES_COLORS[idx % TREND_SERIES_COLORS.length],
      legendLabel: item.label || (item.binding as PiPointBinding).pointName,
    }));
    return {
      id: element.id,
      type: TREND_TYPE,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      properties: {
        series,
        visual: {
          title: (element.properties as { title?: string })?.title || '',
        },
      },
    };
  }

  const props = element.properties as Record<string, unknown> | undefined;
  const directBinding = props?.binding;
  const multistateBinding = (props?.multistate as { binding?: unknown } | undefined)?.binding;
  const binding = isPiPointBinding(directBinding)
    ? directBinding
    : isPiPointBinding(multistateBinding)
      ? multistateBinding
      : undefined;

  if (!binding) {
    return null;
  }

  const customLabel = (typeof props?.customTagName === 'string' && props.customTagName.trim())
    || (typeof props?.customLabel === 'string' && props.customLabel.trim())
    || (typeof props?.label === 'string' && props.label.trim())
    || binding.pointName;

  const title = (typeof props?.title === 'string' && props.title.trim()) || customLabel;

  return {
    id: element.id,
    type: TREND_TYPE,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    properties: {
      series: [
        {
          binding,
          color: '#5794f2',
          legendLabel: customLabel,
        },
      ],
      visual: {
        title,
      },
    },
  };
}
