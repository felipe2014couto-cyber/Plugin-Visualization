import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';

export const TREND_TYPE = 'trend' as const;

export interface TrendSeries {
  binding: PiPointBinding;
  color: string;
}

export interface TrendProperties extends Record<string, unknown> {
  /** Legacy single-series contract, read for backwards compatibility only. */
  binding?: PiPointBinding;
  series?: TrendSeries[];
}

export type TrendElement = DisplayElement<typeof TREND_TYPE, TrendProperties>;

const DEFAULT_TREND_WIDTH = 520;
const DEFAULT_TREND_HEIGHT = 280;
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
  binding: PiPointBinding;
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
  if (!isPiPointBinding(options.binding)) {
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
      series: [{ binding: { ...options.binding }, color: trendSeriesColor(0) }],
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

export function trendSeriesColor(index: number): string {
  return TREND_SERIES_COLORS[index % TREND_SERIES_COLORS.length];
}

function deduplicateTrendSeries(series: readonly TrendSeries[]): TrendSeries[] {
  const unique = new Map<string, TrendSeries>();
  for (const item of series) {
    const key = trendBindingKey(item.binding);
    if (!unique.has(key)) {
      unique.set(key, { binding: { ...item.binding }, color: item.color });
    }
  }
  return [...unique.values()];
}
