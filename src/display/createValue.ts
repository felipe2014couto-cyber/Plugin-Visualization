import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import type { MultistateConfig } from './multistate';

export const VALUE_TYPE = 'value' as const;

export type ValueTextAlign = 'left' | 'center' | 'right';

export interface ValueVisualOptions {
  decimals: number | null;
  showTagName: boolean;
  labelMode: 'tag' | 'custom';
  customLabel: string;
  showUnit: boolean;
  showTimestamp: boolean;
  showValue: boolean;
  fontSize: number;
  color: string;
  textAlign: ValueTextAlign;
}

export const DEFAULT_VALUE_VISUAL_OPTIONS: ValueVisualOptions = {
  decimals: null,
  showTagName: true,
  labelMode: 'tag',
  customLabel: '',
  showUnit: false,
  showTimestamp: false,
  showValue: true,
  fontSize: 16,
  color: '#ffffff',
  textAlign: 'center',
};

export interface ValueProperties extends Record<string, unknown> {
  binding?: PiPointBinding;
  calculationId?: string;
  visual: ValueVisualOptions;
  multistate?: MultistateConfig;
}

export type ValueElement = DisplayElement<typeof VALUE_TYPE, ValueProperties>;

const DEFAULT_VALUE_WIDTH = 240;
const DEFAULT_VALUE_HEIGHT = 100;

export interface CreateValueOptions {
  binding?: PiPointBinding;
  calculationId?: string;
  visual?: Partial<ValueVisualOptions>;
  multistate?: MultistateConfig;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createValue(options: CreateValueOptions): ValueElement {
  if (!isPiPointBinding(options.binding) && !options.calculationId) {
    throw new Error('Value requer um binding de PI Point válido');
  }

  const surface = options.surface;
  const width = options.width ?? Math.min(DEFAULT_VALUE_WIDTH, surface?.width ?? DEFAULT_VALUE_WIDTH);
  const height = options.height ?? Math.min(DEFAULT_VALUE_HEIGHT, surface?.height ?? DEFAULT_VALUE_HEIGHT);
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
    type: VALUE_TYPE,
    x,
    y,
    width: safeWidth,
    height: safeHeight,
    properties: {
      ...(options.binding ? { binding: { ...options.binding } } : {}),
      ...(options.calculationId ? { calculationId: options.calculationId } : {}),
      visual: normalizeValueVisualOptions(options.visual),
      ...(options.multistate ? { multistate: options.multistate } : {}),
    },
  };
}

export function appendValue(document: DisplayDocument, element: ValueElement): DisplayDocument {
  return {
    ...document,
    elements: [...document.elements, element],
  };
}

export function normalizeValueVisualOptions(
  options?: Partial<ValueVisualOptions> | null,
): ValueVisualOptions {
  const decimals = options?.decimals;
  const normalizedDecimals = typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0 && decimals <= 10
    ? decimals
    : DEFAULT_VALUE_VISUAL_OPTIONS.decimals;
  const fontSize = options?.fontSize;
  const normalizedFontSize = typeof fontSize === 'number' && Number.isFinite(fontSize)
    ? Math.max(8, Math.min(96, fontSize))
    : DEFAULT_VALUE_VISUAL_OPTIONS.fontSize;
  const color = options?.color;

  return {
    decimals: normalizedDecimals,
    showTagName: typeof options?.showTagName === 'boolean'
      ? options.showTagName
      : DEFAULT_VALUE_VISUAL_OPTIONS.showTagName,
    labelMode: options?.labelMode === 'custom' ? 'custom' : 'tag',
    customLabel: typeof options?.customLabel === 'string' ? options.customLabel : '',
    showUnit: options?.showUnit === true,
    showTimestamp: options?.showTimestamp === true,
    showValue: options?.showValue !== false,
    fontSize: normalizedFontSize,
    color: typeof color === 'string' && isValidColor(color)
      ? color
      : DEFAULT_VALUE_VISUAL_OPTIONS.color,
    textAlign: options?.textAlign === 'left' || options?.textAlign === 'right'
      ? options.textAlign
      : DEFAULT_VALUE_VISUAL_OPTIONS.textAlign,
  };
}

export function getValueVisualOptions(properties: Partial<ValueProperties>): ValueVisualOptions {
  return normalizeValueVisualOptions(properties.visual);
}

export function updateValueVisualOptions(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<ValueVisualOptions>,
): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    if (element.id !== elementId || element.type !== VALUE_TYPE) {
      return element;
    }
    const properties = element.properties as Partial<ValueProperties>;
    if (!isPiPointBinding(properties.binding)) {
      return element;
    }
    changed = true;
    return {
      ...element,
      properties: {
        ...properties,
        binding: properties.binding,
        visual: normalizeValueVisualOptions({ ...getValueVisualOptions(properties), ...patch }),
      },
    } as ValueElement;
  });

  return changed ? { ...document, elements } : document;
}

function isValidColor(color: string): boolean {
  return color.trim().toLowerCase() === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(color.trim());
}
