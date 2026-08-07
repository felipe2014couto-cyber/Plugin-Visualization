import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';

export const TREND_TYPE = 'trend' as const;

export interface TrendProperties extends Record<string, unknown> {
  binding: PiPointBinding;
}

export type TrendElement = DisplayElement<typeof TREND_TYPE, TrendProperties>;

const DEFAULT_TREND_WIDTH = 520;
const DEFAULT_TREND_HEIGHT = 280;

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
    properties: { binding: { ...options.binding } },
  };
}

export function appendTrend(document: DisplayDocument, element: TrendElement): DisplayDocument {
  return {
    ...document,
    elements: [...document.elements, element],
  };
}
