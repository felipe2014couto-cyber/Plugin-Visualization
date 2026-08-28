import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import { updateElementInDocument } from './createGroup';

export const XY_PLOT_TYPE = 'xy-plot' as const;
export interface XYPlotProperties extends Record<string, unknown> {
  xBinding: PiPointBinding;
  yBinding?: PiPointBinding;
  connectPoints?: boolean;
}
export type XYPlotElement = DisplayElement<typeof XY_PLOT_TYPE, XYPlotProperties>;
export const DEFAULT_XY_PLOT_WIDTH = 480;
export const DEFAULT_XY_PLOT_HEIGHT = 300;

export function createXYPlot(options: { xBinding: PiPointBinding; yBinding?: PiPointBinding; id?: string; x?: number; y?: number; width?: number; height?: number; surface?: DisplaySurface; existingIds?: readonly string[]; generateId?: () => string }): XYPlotElement {
  if (!isPiPointBinding(options.xBinding) || (options.yBinding && !isPiPointBinding(options.yBinding))) throw new Error('XY Plot requer PI Points válidos');
  const surface = options.surface;
  const width = Math.max(1, Math.min(options.width ?? DEFAULT_XY_PLOT_WIDTH, surface?.width ?? DEFAULT_XY_PLOT_WIDTH));
  const height = Math.max(1, Math.min(options.height ?? DEFAULT_XY_PLOT_HEIGHT, surface?.height ?? DEFAULT_XY_PLOT_HEIGHT));
  const ids = new Set(options.existingIds ?? []);
  const nextId = options.generateId ?? generateId;
  let id = options.id ?? nextId();
  while (ids.has(id)) id = nextId();
  return { id, type: XY_PLOT_TYPE, x: options.x ?? Math.max(0, ((surface?.width ?? width) - width) / 2), y: options.y ?? Math.max(0, ((surface?.height ?? height) - height) / 2), width, height, properties: { xBinding: { ...options.xBinding }, ...(options.yBinding ? { yBinding: { ...options.yBinding } } : {}), connectPoints: false } };
}
export function appendXYPlot(document: DisplayDocument, element: XYPlotElement): DisplayDocument { return { ...document, elements: [...document.elements, element] }; }
export function updateXYPlotProperties(document: DisplayDocument, elementId: string, patch: Partial<XYPlotProperties>): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => element.type === XY_PLOT_TYPE ? { ...element, properties: { ...element.properties, ...patch } } as XYPlotElement : element);
}
