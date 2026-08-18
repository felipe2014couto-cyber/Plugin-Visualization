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
  calculationId?: string;
  minimum: number;
  maximum: number;
  showValue: boolean;
  showTagName: boolean;
  showUnit?: boolean;
  showTimestamp?: boolean;
  tagNameMode?: 'tag' | 'custom';
  customTagName?: string;
  decimals: number | null;
  orientation: BarOrientation;
  multistate?: MultistateConfig;
  scaleMode?: 'custom' | 'database';
  showScale?: boolean;
  fillColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

export type BarElement = DisplayElement<typeof BAR_TYPE, BarProperties>;

const DEFAULT_BAR_WIDTH = 180;
const DEFAULT_BAR_HEIGHT = 300;

export interface CreateBarOptions {
  binding?: PiPointBinding;
  calculationId?: string;
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
      ...(options.calculationId ? { calculationId: options.calculationId } : {}),
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

export function getBarOptions(properties: Partial<BarProperties>): ScaleVisualOptions & { orientation: BarOrientation; scaleMode: 'custom' | 'database'; showScale: boolean; showUnit: boolean; showTimestamp: boolean; tagNameMode: 'tag' | 'custom'; customTagName: string; fillColor: string; backgroundColor: string; borderColor: string; borderWidth: number } {
  return {
    ...normalizeScaleOptions(properties),
    orientation: properties.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    scaleMode: properties.scaleMode === 'custom' ? 'custom' : 'database',
    showScale: properties.showScale !== false,
    showUnit: properties.showUnit === true,
    showTimestamp: properties.showTimestamp === true,
    tagNameMode: properties.tagNameMode === 'custom' ? 'custom' : 'tag',
    customTagName: typeof properties.customTagName === 'string' ? properties.customTagName : '',
    fillColor: typeof properties.fillColor === 'string' ? properties.fillColor : normalizeScaleOptions(properties).color,
    backgroundColor: typeof properties.backgroundColor === 'string' ? properties.backgroundColor : '#2d3b4f',
    borderColor: typeof properties.borderColor === 'string' ? properties.borderColor : '#ffffff',
    borderWidth: typeof properties.borderWidth === 'number' && Number.isFinite(properties.borderWidth) ? Math.max(0, Math.min(8, properties.borderWidth)) : 1,
  };
}

export function updateBarOptions(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<ScaleVisualOptions> & { orientation?: BarOrientation; scaleMode?: 'custom' | 'database'; showScale?: boolean; showUnit?: boolean; showTimestamp?: boolean; tagNameMode?: 'tag' | 'custom'; customTagName?: string; fillColor?: string; backgroundColor?: string; borderColor?: string; borderWidth?: number },
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
        scaleMode: patch.scaleMode === 'custom' || patch.scaleMode === 'database' ? patch.scaleMode : getBarOptions(properties).scaleMode,
        showScale: typeof patch.showScale === 'boolean' ? patch.showScale : getBarOptions(properties).showScale,
        showUnit: typeof patch.showUnit === 'boolean' ? patch.showUnit : getBarOptions(properties).showUnit,
        showTimestamp: typeof patch.showTimestamp === 'boolean' ? patch.showTimestamp : getBarOptions(properties).showTimestamp,
        tagNameMode: patch.tagNameMode === 'tag' || patch.tagNameMode === 'custom' ? patch.tagNameMode : getBarOptions(properties).tagNameMode,
        customTagName: typeof patch.customTagName === 'string' ? patch.customTagName : getBarOptions(properties).customTagName,
        fillColor: typeof patch.fillColor === 'string' ? patch.fillColor : getBarOptions(properties).fillColor,
        backgroundColor: typeof patch.backgroundColor === 'string' ? patch.backgroundColor : getBarOptions(properties).backgroundColor,
        borderColor: typeof patch.borderColor === 'string' ? patch.borderColor : getBarOptions(properties).borderColor,
        borderWidth: typeof patch.borderWidth === 'number' ? Math.max(0, Math.min(8, patch.borderWidth)) : getBarOptions(properties).borderWidth,
        orientation: patch.orientation === 'horizontal' ? 'horizontal' : patch.orientation === 'vertical' ? 'vertical' : getBarOptions(properties).orientation,
      },
    } as BarElement;
  });
  return changed ? { ...document, elements } : document;
}
