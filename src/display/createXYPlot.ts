import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import { updateElementInDocument } from './createGroup';

export const XY_PLOT_TYPE = 'xy-plot' as const;
export type XYPairing = 'timestamp' | 'position';
export type XYTimestampMatch = 'interpolated' | 'exact' | 'previous' | 'next';
export type XYMarkerStyle = 'circle' | 'square' | 'diamond' | 'triangle' | 'cross';
export type XYScaleMode = 'plotted' | 'database' | 'custom';
export interface XYPlotYSeries { binding: PiPointBinding; label?: string; pairing?: XYPairing; timestampMatch?: XYTimestampMatch; color?: string; marker?: XYMarkerStyle; connectLine?: boolean; regression?: boolean; correlation?: boolean; recentCount?: number; recentColor?: string; scaleMode?: XYScaleMode; min?: number; max?: number; }
export interface XYPlotProperties extends Record<string, unknown> {
  xBinding?: PiPointBinding;
  xLabel?: string;
  /** Legacy alias for the first Y series. */
  yBinding?: PiPointBinding;
  ySeries?: XYPlotYSeries[];
  connectPoints?: boolean;
  multipleYScales?: boolean;
  xScaleMode?: XYScaleMode; xMin?: number; xMax?: number;
  title?: string; showTitle?: boolean; showLegend?: boolean; showGrid?: boolean;
  backgroundColor?: string; format?: 'database' | 'general' | 'number' | 'scientific';
}
export type XYPlotElement = DisplayElement<typeof XY_PLOT_TYPE, XYPlotProperties>;
export const DEFAULT_XY_PLOT_WIDTH = 480;
export const DEFAULT_XY_PLOT_HEIGHT = 300;

const bindingKey = (binding: PiPointBinding) => `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
export function getXYPlotYSeries(properties: XYPlotProperties): XYPlotYSeries[] {
  const source = Array.isArray(properties.ySeries) && properties.ySeries.length ? properties.ySeries : properties.yBinding ? [{ binding: properties.yBinding, connectLine: properties.connectPoints }] : [];
  const used = new Set<string>();
  return source.filter((item): item is XYPlotYSeries => isPiPointBinding(item?.binding) && (!properties.xBinding || bindingKey(item.binding) !== bindingKey(properties.xBinding)) && !used.has(bindingKey(item.binding)) && Boolean(used.add(bindingKey(item.binding)))).map((item) => ({ ...item, binding: { ...item.binding }, ...(item.label ? { label: item.label } : {}), pairing: item.pairing ?? 'timestamp', timestampMatch: item.timestampMatch ?? 'interpolated', marker: item.marker ?? 'circle', color: item.color ?? '#6e9fff', connectLine: item.connectLine ?? properties.connectPoints ?? false, scaleMode: item.scaleMode ?? 'plotted' }));
}
export function normalizeXYPlotProperties(properties: XYPlotProperties): XYPlotProperties { const ySeries = getXYPlotYSeries(properties); return { ...properties, ySeries, ...(ySeries[0] ? { yBinding: { ...ySeries[0].binding } } : {}), ...(properties.xLabel ? { xLabel: properties.xLabel } : {}), connectPoints: ySeries.some((item) => item.connectLine), multipleYScales: properties.multipleYScales === true, xScaleMode: properties.xScaleMode ?? 'plotted', showTitle: properties.showTitle !== false, showLegend: properties.showLegend !== false, showGrid: properties.showGrid !== false, format: properties.format ?? 'general' }; }
export function createXYPlot(options: { xBinding: PiPointBinding; xLabel?: string; yBinding?: PiPointBinding; ySeries?: XYPlotYSeries[]; id?: string; x?: number; y?: number; width?: number; height?: number; surface?: DisplaySurface; existingIds?: readonly string[]; generateId?: () => string }): XYPlotElement {
  if (!isPiPointBinding(options.xBinding) || (options.yBinding && !isPiPointBinding(options.yBinding))) throw new Error('XY Plot requer PI Points válidos');
  const surface = options.surface;
  const width = Math.max(1, Math.min(options.width ?? DEFAULT_XY_PLOT_WIDTH, surface?.width ?? DEFAULT_XY_PLOT_WIDTH));
  const height = Math.max(1, Math.min(options.height ?? DEFAULT_XY_PLOT_HEIGHT, surface?.height ?? DEFAULT_XY_PLOT_HEIGHT));
  const ids = new Set(options.existingIds ?? []);
  const nextId = options.generateId ?? generateId;
  let id = options.id ?? nextId();
  while (ids.has(id)) id = nextId();
  return { id, type: XY_PLOT_TYPE, x: options.x ?? Math.max(0, ((surface?.width ?? width) - width) / 2), y: options.y ?? Math.max(0, ((surface?.height ?? height) - height) / 2), width, height, properties: normalizeXYPlotProperties({ xBinding: { ...options.xBinding }, ...(options.xLabel ? { xLabel: options.xLabel } : {}), ...(options.yBinding ? { yBinding: { ...options.yBinding } } : {}), ...(options.ySeries ? { ySeries: options.ySeries } : {}) }) };
}
export function appendXYPlot(document: DisplayDocument, element: XYPlotElement): DisplayDocument { return { ...document, elements: [...document.elements, element] }; }
export function updateXYPlotProperties(document: DisplayDocument, elementId: string, patch: Partial<XYPlotProperties>): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => element.type === XY_PLOT_TYPE ? { ...element, properties: normalizeXYPlotProperties({ ...(element as XYPlotElement).properties, ...patch }) } as XYPlotElement : element);
}
export function addXYPlotYSeries(document: DisplayDocument, elementId: string, binding: PiPointBinding, label?: string): DisplayDocument { return updateElementInDocument(document, elementId, (element) => { if (element.type !== XY_PLOT_TYPE) return element; const properties = normalizeXYPlotProperties((element as XYPlotElement).properties); if ((properties.xBinding && bindingKey(binding) === bindingKey(properties.xBinding)) || getXYPlotYSeries(properties).some((item) => bindingKey(item.binding) === bindingKey(binding))) return element; return { ...element, properties: normalizeXYPlotProperties({ ...properties, ySeries: [...getXYPlotYSeries(properties), { binding: { ...binding }, ...(label ? { label } : {}) }] }) } as XYPlotElement; }); }
export function removeXYPlotYSeries(document: DisplayDocument, elementId: string, index: number): DisplayDocument { return updateElementInDocument(document, elementId, (element) => element.type === XY_PLOT_TYPE ? { ...element, properties: normalizeXYPlotProperties({ ...(element as XYPlotElement).properties, ySeries: getXYPlotYSeries((element as XYPlotElement).properties).filter((_, i) => i !== index) }) } as XYPlotElement : element); }
export function moveXYPlotYSeries(document: DisplayDocument, elementId: string, index: number, offset: -1 | 1): DisplayDocument { return updateElementInDocument(document, elementId, (element) => { if (element.type !== XY_PLOT_TYPE) return element; const ySeries = getXYPlotYSeries((element as XYPlotElement).properties); const target = index + offset; if (target < 0 || target >= ySeries.length) return element; [ySeries[index], ySeries[target]] = [ySeries[target], ySeries[index]]; return { ...element, properties: normalizeXYPlotProperties({ ...(element as XYPlotElement).properties, ySeries }) } as XYPlotElement; }); }
