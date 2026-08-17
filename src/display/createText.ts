import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';

export const TEXT_TYPE = 'text' as const;
export type TextAlign = 'left' | 'center' | 'right';
export interface TextProperties extends Record<string, unknown> {
  text: string;
  color: string;
  fontSize: number;
  textAlign: TextAlign;
  rotation: number;
}
export type TextElement = DisplayElement<typeof TEXT_TYPE, TextProperties>;
export const DEFAULT_TEXT_PROPERTIES: TextProperties = { text: 'Texto', color: '#ffffff', fontSize: 24, textAlign: 'center', rotation: 0 };
export interface CreateTextOptions { id?: string; x?: number; y?: number; width?: number; height?: number; properties?: Partial<TextProperties>; surface?: DisplaySurface; existingIds?: readonly string[]; generateId?: () => string; }

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
  return { id, type: TEXT_TYPE, x: options.x ?? Math.max(0, ((surface?.width ?? width) - width) / 2), y: options.y ?? Math.max(0, ((surface?.height ?? height) - height) / 2), width: Math.max(1, width), height: Math.max(1, height), properties: { ...DEFAULT_TEXT_PROPERTIES, ...options.properties } };
}

export function appendText(document: DisplayDocument, element: TextElement): DisplayDocument { return { ...document, elements: [...document.elements, element] }; }
export function updateTextProperties(document: DisplayDocument, elementId: string, patch: Partial<TextProperties>): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((element) => element.id === elementId && element.type === TEXT_TYPE
    ? (changed = true, { ...element, properties: { ...DEFAULT_TEXT_PROPERTIES, ...element.properties, ...patch, rotation: normalizeRotation({ ...element.properties, ...patch }.rotation) } } as TextElement)
    : element);
  return changed ? { ...document, elements } : document;
}
function normalizeRotation(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value % 360 : 0; }
