import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import { DEFAULT_SCALE_OPTIONS, normalizeScaleOptions, type ScaleVisualOptions } from './scaleOptions';
import type { MultistateConfig } from './multistate';

export const GAUGE_TYPE = 'gauge' as const;
export type GaugeStyle = 'arc' | 'triangle' | 'pointer' | 'line';
export type GaugeVisualOptions = ScaleVisualOptions & {
  gaugeStyle: GaugeStyle;
  gaugeBorderColor: string;
  gaugeScaleColor: string;
};

export interface GaugeProperties extends Record<string, unknown> {
  binding?: PiPointBinding;
  minimum: number;
  maximum: number;
  showValue: boolean;
  showTagName: boolean;
  decimals: number | null;
  gaugeStyle: GaugeStyle;
  gaugeBorderColor: string;
  gaugeScaleColor: string;
  multistate?: MultistateConfig;
}

export type GaugeElement = DisplayElement<typeof GAUGE_TYPE, GaugeProperties>;

const DEFAULT_GAUGE_WIDTH = 280;
const DEFAULT_GAUGE_HEIGHT = 220;

export interface CreateGaugeOptions {
  binding?: PiPointBinding;
  multistate?: MultistateConfig;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  options?: Partial<ScaleVisualOptions> & { gaugeStyle?: GaugeStyle };
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createGauge(options: CreateGaugeOptions): GaugeElement {
  if (options.binding !== undefined && !isPiPointBinding(options.binding)) {
    throw new Error('Gauge requer um binding de PI Point válido');
  }
  const surface = options.surface;
  const width = options.width ?? Math.min(DEFAULT_GAUGE_WIDTH, surface?.width ?? DEFAULT_GAUGE_WIDTH);
  const height = options.height ?? Math.min(DEFAULT_GAUGE_HEIGHT, surface?.height ?? DEFAULT_GAUGE_HEIGHT);
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
    type: GAUGE_TYPE,
    x: options.x ?? Math.max(0, ((surface?.width ?? safeWidth) - safeWidth) / 2),
    y: options.y ?? Math.max(0, ((surface?.height ?? safeHeight) - safeHeight) / 2),
    width: safeWidth,
    height: safeHeight,
    properties: {
      ...(options.binding ? { binding: { ...options.binding } } : {}),
      ...normalizeGaugeOptions(options.options),
      ...(options.multistate ? { multistate: options.multistate } : {}),
    },
  };
}

export function appendGauge(document: DisplayDocument, element: GaugeElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}

export function getGaugeOptions(properties: Partial<GaugeProperties>): GaugeVisualOptions {
  return normalizeGaugeOptions(properties);
}

export function updateGaugeOptions(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<GaugeVisualOptions>,
): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    if (element.id !== elementId || element.type !== GAUGE_TYPE) {
      return element;
    }
    changed = true;
    const properties = element.properties as Partial<GaugeProperties>;
    return { ...element, properties: { ...properties, ...normalizeGaugeOptions({ ...properties, ...patch }) } } as GaugeElement;
  });
  return changed ? { ...document, elements } : document;
}

export { DEFAULT_SCALE_OPTIONS };

export function normalizeGaugeOptions(options?: Partial<GaugeProperties> | null): GaugeVisualOptions {
  const scale = normalizeScaleOptions(options);
  const gaugeStyle = options?.gaugeStyle === 'arc' || options?.gaugeStyle === 'triangle' || options?.gaugeStyle === 'line'
    ? options.gaugeStyle
    : 'pointer';
  return {
    ...scale,
    color: isColor(options?.color) ? scale.color : '#00a2e8',
    gaugeStyle,
    gaugeBorderColor: isColor(options?.gaugeBorderColor) ? options!.gaugeBorderColor! : '#ffffff',
    gaugeScaleColor: isColor(options?.gaugeScaleColor) ? options!.gaugeScaleColor! : '#ffffff',
  };
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && (value === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(value));
}
