import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';
import type { PiPointBinding } from '../pi/piPointBinding';
import type { MultistateConfig } from './multistate';

export const TEXT_TYPE = 'text' as const;
export type TextAlign = 'left' | 'center' | 'right';
export interface TextProperties extends Record<string, unknown> {
  text: string;
  color: string;
  backgroundColor?: string;
  fontSize: number;
  textAlign: TextAlign;
  rotation: number;
  linkUrl?: string;
  openInNewTab?: boolean;
  binding?: PiPointBinding;
  calculationId?: string;
  multistate?: MultistateConfig;
  backgroundMultistate?: MultistateConfig;
}
export type TextElement = DisplayElement<typeof TEXT_TYPE, TextProperties>;
export const DEFAULT_TEXT_PROPERTIES: TextProperties = {
  text: 'Texto',
  color: '#ffffff',
  backgroundColor: 'transparent',
  fontSize: 24,
  textAlign: 'center',
  rotation: 0,
};
export interface CreateTextOptions {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: Partial<TextProperties>;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
  binding?: PiPointBinding;
  calculationId?: string;
}

export function createText(options: CreateTextOptions = {}): TextElement {
  const surface = options.surface;
  const width = Math.min(options.width ?? 240, surface?.width ?? 240);
  const height = Math.min(options.height ?? 64, surface?.height ?? 64);
  const existing = new Set(options.existingIds ?? []);
  const generate = options.generateId ?? generateId;
  let id = options.id ?? generate();
  while (existing.has(id)) {
    id = generate();
  }
  return {
    id,
    type: TEXT_TYPE,
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: Math.max(1, width),
    height: Math.max(1, height),
    properties: {
      ...DEFAULT_TEXT_PROPERTIES,
      ...options.properties,
      rotation: typeof options.properties?.rotation === 'number' && Number.isFinite(options.properties.rotation) ? options.properties.rotation % 360 : 0,
      ...(options.binding ? { binding: { ...options.binding } } : {}),
      ...(options.calculationId ? { calculationId: options.calculationId } : {}),
    },
  };
}

import { updateElementInDocument } from './createGroup';

export function appendText(document: DisplayDocument, element: TextElement): DisplayDocument { return { ...document, elements: [...document.elements, element] }; }
export function updateTextProperties(document: DisplayDocument, elementId: string, patch: Partial<TextProperties>): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => {
    if (element.type !== TEXT_TYPE) return element;
    return {
      ...element,
      properties: {
        ...DEFAULT_TEXT_PROPERTIES,
        ...element.properties,
        ...patch,
        rotation: normalizeRotation({ ...element.properties, ...patch }.rotation),
      },
    } as TextElement;
  });
}
function normalizeRotation(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value % 360 : 0; }
