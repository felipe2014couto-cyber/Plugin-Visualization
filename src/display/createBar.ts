import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import { normalizeScaleOptions, type ScaleVisualOptions, type BarOrientation } from './scaleOptions';
import type { MultistateConfig } from './multistate';

export const BAR_TYPE = 'bar' as const;

export interface BarProperties extends Record<string, unknown> {
  binding?: PiPointBinding;
  minimum: number;
  maximum: number;
  showValue: boolean;
  showTagName: boolean;
  decimals: number | null;
  orientation: BarOrientation;
  multistate?: MultistateConfig;
  scaleMode?: 'custom' | 'database';
}

export type BarElement = DisplayElement<typeof BAR_TYPE, BarProperties>;

const DEFAULT_BAR_WIDTH = 180;
const DEFAULT_BAR_HEIGHT = 300;

export interface CreateBarOptions {
  binding?: PiPointBinding;
  multistate?: MultistateConfig;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  options?: Partial<ScaleVisualOptions>;
  orientation?: BarOrientation;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createBar(options: CreateBarOptions): BarElement {
  if (options.binding !== undefined && !isPiPointBinding(options.binding)) {
    throw new Error('Bar requer um binding de PI Point válido');
  }
  const surface = options.surface;
  const width = options.width ?? Math.min(DEFAULT_BAR_WIDTH, surface?.width ?? DEFAULT_BAR_WIDTH);
  const height = options.height ?? Math.min(DEFAULT_BAR_HEIGHT, surface?.height ?? DEFAULT_BAR_HEIGHT);
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
    type: BAR_TYPE,
    x: options.x ?? Math.max(0, ((surface?.width ?? safeWidth) - safeWidth) / 2),
    y: options.y ?? Math.max(0, ((surface?.height ?? safeHeight) - safeHeight) / 2),
    width: safeWidth,
    height: safeHeight,
    properties: {
      ...(options.binding ? { binding: { ...options.binding } } : {}),
      ...normalizeScaleOptions(options.options),
      scaleMode: 'database',
      orientation: options.orientation ?? 'vertical',
      ...(options.multistate ? { multistate: options.multistate } : {}),
    },
  };
}

export function appendBar(document: DisplayDocument, element: BarElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}

export function getBarOptions(properties: Partial<BarProperties>): ScaleVisualOptions & { orientation: BarOrientation; scaleMode: 'custom' | 'database' } {
  return {
    ...normalizeScaleOptions(properties),
    orientation: properties.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    scaleMode: properties.scaleMode === 'custom' ? 'custom' : 'database',
  };
}

export function updateBarOptions(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<ScaleVisualOptions> & { orientation?: BarOrientation },
): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    if (element.id !== elementId || element.type !== BAR_TYPE) {
      return element;
    }
    changed = true;
    const properties = element.properties as Partial<BarProperties>;
    return {
      ...element,
      properties: {
        ...properties,
        ...normalizeScaleOptions({ ...properties, ...patch }),
        orientation: patch.orientation === 'horizontal' ? 'horizontal' : patch.orientation === 'vertical' ? 'vertical' : getBarOptions(properties).orientation,
      },
    } as BarElement;
  });
  return changed ? { ...document, elements } : document;
}
