import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';

export const RECTANGLE_TYPE = 'rectangle' as const;

export type RectangleProperties = Record<string, unknown> & {
  fill: string;
  stroke: string;
};

export type RectangleElement = DisplayElement<typeof RECTANGLE_TYPE, RectangleProperties>;

export const DEFAULT_RECTANGLE_PROPERTIES: RectangleProperties = {
  fill: 'rgba(110, 159, 255, 0.15)',
  stroke: '#6e9fff',
};

const DEFAULT_RECTANGLE_WIDTH = 240;
const DEFAULT_RECTANGLE_HEIGHT = 140;

export interface CreateRectangleOptions {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: Partial<RectangleProperties>;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createRectangle(options: CreateRectangleOptions = {}): RectangleElement {
  const surface = options.surface;
  const width = options.width ?? Math.min(DEFAULT_RECTANGLE_WIDTH, surface?.width ?? DEFAULT_RECTANGLE_WIDTH);
  const height = options.height ?? Math.min(DEFAULT_RECTANGLE_HEIGHT, surface?.height ?? DEFAULT_RECTANGLE_HEIGHT);
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
    type: RECTANGLE_TYPE,
    x,
    y,
    width: safeWidth,
    height: safeHeight,
    properties: {
      ...DEFAULT_RECTANGLE_PROPERTIES,
      ...options.properties,
    },
  };
}

export function appendDisplayElement(
  document: DisplayDocument,
  element: DisplayElement,
): DisplayDocument {
  return {
    ...document,
    elements: [...document.elements, element],
  };
}

export function updateRectangleProperties(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<RectangleProperties>,
): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    if (element.id !== elementId || element.type !== RECTANGLE_TYPE) {
      return element;
    }
    changed = true;
    return {
      ...element,
      properties: {
        ...DEFAULT_RECTANGLE_PROPERTIES,
        ...element.properties,
        ...patch,
      },
    } as RectangleElement;
  });
  return changed ? { ...document, elements } : document;
}
