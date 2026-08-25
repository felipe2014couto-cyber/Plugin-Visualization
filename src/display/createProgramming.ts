import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import type { PiPointBinding } from '../pi/piPointBinding';
import { generateId } from './ids';

export const PROGRAMMING_TYPE = 'programming' as const;

export interface ProgrammingQueryItem {
  name: string;
  binding: PiPointBinding;
  unit?: string;
}

export interface ProgrammingProperties extends Record<string, unknown> {
  html: string;
  css: string;
  javascript: string;
  query: ProgrammingQueryItem[];
}

export type ProgrammingElement = DisplayElement<typeof PROGRAMMING_TYPE, ProgrammingProperties>;

export interface CreateProgrammingOptions {
  html: string;
  css: string;
  javascript: string;
  query?: ProgrammingQueryItem[];
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createProgramming(options: CreateProgrammingOptions): ProgrammingElement {
  const surface = options.surface;
  const width = Math.max(1, Math.min(options.width ?? 420, surface?.width ?? 420));
  const height = Math.max(1, Math.min(options.height ?? 260, surface?.height ?? 260));
  const generate = options.generateId ?? generateId;
  const existingIds = new Set(options.existingIds ?? []);
  let id = options.id ?? generate();
  while (existingIds.has(id)) id = generate();
  return {
    id,
    type: PROGRAMMING_TYPE,
    x: options.x ?? Math.max(0, ((surface?.width ?? width) - width) / 2),
    y: options.y ?? Math.max(0, ((surface?.height ?? height) - height) / 2),
    width,
    height,
    properties: {
      html: options.html,
      css: options.css,
      javascript: options.javascript,
      query: (options.query ?? []).map((item) => ({ ...item, binding: { ...item.binding } })),
    },
  };
}

export function appendProgramming(document: DisplayDocument, element: ProgrammingElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}
