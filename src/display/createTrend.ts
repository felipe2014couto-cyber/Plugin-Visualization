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

export interface TrendVisualOptions {
  title: string;
  showRegression: boolean;
  numberFormat: TrendNumberFormat;
  scaleIntervals: 2 | 5 | 10;
  scaleMode: TrendScaleMode;
  fontFamily: string;
  fontSize: number;
}

export const DEFAULT_TREND_VISUAL_OPTIONS: TrendVisualOptions = {
  title: '',
  showRegression: false,
  numberFormat: 'automatic',
  scaleIntervals: 10,
  scaleMode: 'single',
  fontFamily: 'Arial',
  fontSize: 16,
};

export interface TrendProperties extends Record<string, unknown> {
  /** Legacy single-series contract, read for backwards compatibility only. */
  binding?: PiPointBinding;
  series?: TrendSeries[];
  visual?: Partial<TrendVisualOptions>;
}

export type TrendElement = DisplayElement<typeof TREND_TYPE, TrendProperties>;

const DEFAULT_TREND_WIDTH = 1100;
const DEFAULT_TREND_HEIGHT = 460;
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
  return {
    title: typeof visual.title === 'string' ? visual.title : DEFAULT_TREND_VISUAL_OPTIONS.title,
    showRegression: visual.showRegression === true,
    numberFormat: visual.numberFormat === 'integer' || visual.numberFormat === 'oneDecimal' || visual.numberFormat === 'twoDecimals'
      ? visual.numberFormat
      : 'automatic',
    scaleIntervals: visual.scaleIntervals === 2 || visual.scaleIntervals === 5 || visual.scaleIntervals === 10 ? visual.scaleIntervals : 10,
    scaleMode: visual.scaleMode === 'individual' || visual.scaleMode === 'configurable' ? visual.scaleMode : 'single',
    fontFamily: typeof visual.fontFamily === 'string' && visual.fontFamily.trim() ? visual.fontFamily : 'Arial',
    fontSize: typeof visual.fontSize === 'number' && Number.isFinite(visual.fontSize) ? Math.max(10, Math.min(24, visual.fontSize)) : 16,
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

export function addTrendSeries(
  document: DisplayDocument,
  elementId: string,
  binding: PiPointBinding,
): DisplayDocument {
  if (!isPiPointBinding(binding)) {
    return document;
  }
  const elementIndex = document.elements.findIndex((element) => element.id === elementId && element.type === TREND_TYPE);
  if (elementIndex < 0) {
    return document;
  }
  const element = document.elements[elementIndex] as TrendElement;
  const series = getTrendSeries(element);
  const bindingKey = trendBindingKey(binding);
  if (series.some((item) => trendBindingKey(item.binding) === bindingKey)) {
    return document;
  }
  const currentProperties = { ...element.properties };
  delete currentProperties.binding;
  const nextElement: TrendElement = {
    ...element,
    properties: {
      ...currentProperties,
      visual: { ...getTrendVisualOptions(element), scaleMode: 'single' },
      series: [...series, { binding: { ...binding }, color: trendSeriesColor(series.length) }],
    },
  };
  const elements = [...document.elements];
  elements[elementIndex] = nextElement;
  return { ...document, elements };
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
  const index = document.elements.findIndex((element) => element.id === elementId && element.type === TREND_TYPE);
  if (index < 0) {
    return document;
  }
  const elements = [...document.elements];
  elements[index] = update(elements[index] as TrendElement);
  return { ...document, elements };
}
