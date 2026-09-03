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
  barStartMode?: 'default' | 'custom';
  barStartValue?: number;
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

export function getBarOptions(properties: Partial<BarProperties>): ScaleVisualOptions & { orientation: BarOrientation; scaleMode: 'custom' | 'database'; showScale: boolean; showUnit: boolean; showTimestamp: boolean; tagNameMode: 'tag' | 'custom'; customTagName: string; fillColor: string; backgroundColor: string; borderColor: string; borderWidth: number; barStartMode: 'default' | 'custom'; barStartValue: number } {
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
    barStartMode: properties.barStartMode === 'custom' ? 'custom' : 'default',
    barStartValue: typeof properties.barStartValue === 'number' && Number.isFinite(properties.barStartValue) ? properties.barStartValue : 0,
  };
}

import { updateElementInDocument } from './createGroup';

export function updateBarOptions(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<ScaleVisualOptions> & { orientation?: BarOrientation; scaleMode?: 'custom' | 'database'; showScale?: boolean; showUnit?: boolean; showTimestamp?: boolean; tagNameMode?: 'tag' | 'custom'; customTagName?: string; fillColor?: string; backgroundColor?: string; borderColor?: string; borderWidth?: number; barStartMode?: 'default' | 'custom'; barStartValue?: number },
): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => {
    if (element.type !== BAR_TYPE) {
      return element;
    }
    const properties = element.properties as Partial<BarProperties>;
    return {
      ...element,
      properties: {
        ...properties,
        ...normalizeScaleOptions({ ...properties, ...patch }),
        scaleMode: patch.scaleMode ?? properties.scaleMode,
        showScale: patch.showScale ?? properties.showScale,
        showUnit: patch.showUnit ?? properties.showUnit,
        showTimestamp: patch.showTimestamp ?? properties.showTimestamp,
        tagNameMode: patch.tagNameMode ?? properties.tagNameMode,
        customTagName: patch.customTagName ?? properties.customTagName,
        fillColor: patch.fillColor ?? properties.fillColor,
        backgroundColor: patch.backgroundColor ?? properties.backgroundColor,
        borderColor: patch.borderColor ?? properties.borderColor,
        borderWidth: patch.borderWidth ?? properties.borderWidth,
        orientation: patch.orientation ?? properties.orientation,
        barStartMode: patch.barStartMode ?? properties.barStartMode,
        barStartValue: patch.barStartValue ?? properties.barStartValue,
      },
    } as BarElement;
  });
}
