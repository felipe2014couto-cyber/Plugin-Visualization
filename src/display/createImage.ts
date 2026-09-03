import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';

export const IMAGE_TYPE = 'image' as const;
export interface ImageProperties extends Record<string, unknown> { src: string; alt: string; rotation: number; }
export type ImageElement = DisplayElement<typeof IMAGE_TYPE, ImageProperties>;
export interface CreateImageOptions { src: string; alt?: string; id?: string; x?: number; y?: number; width?: number; height?: number; surface?: DisplaySurface; existingIds?: readonly string[]; generateId?: () => string; }
export function createImage(options: CreateImageOptions): ImageElement {
  const width = Math.min(options.width ?? 240, options.surface?.width ?? 240);
  const height = Math.min(options.height ?? 160, options.surface?.height ?? 160);
  const existing = new Set(options.existingIds ?? []); const generate = options.generateId ?? generateId;
  let id = options.id ?? generate();
  while (existing.has(id)) {
    id = generate();
  }
  const safeWidth = Math.max(1, Math.min(width, options.surface?.width ?? width));
  const safeHeight = Math.max(1, Math.min(height, options.surface?.height ?? height));
  const x = options.x ?? Math.max(0, ((options.surface?.width ?? safeWidth) - safeWidth) / 2);
  const y = options.y ?? Math.max(0, ((options.surface?.height ?? safeHeight) - safeHeight) / 2);
  return { id, type: IMAGE_TYPE, x, y, width: safeWidth, height: safeHeight, properties: { src: options.src, alt: options.alt ?? 'Imagem', rotation: 0 } };
}
import { updateElementInDocument } from './createGroup';

export function appendImage(document: DisplayDocument, element: ImageElement): DisplayDocument { return { ...document, elements: [...document.elements, element] }; }
export function updateImageProperties(document: DisplayDocument, elementId: string, patch: Partial<ImageProperties>): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => {
    if (element.type !== IMAGE_TYPE) return element;
    return {
      ...element,
      properties: {
        ...element.properties,
        ...patch,
        rotation: normalizeRotation({ ...element.properties, ...patch }.rotation),
      },
    } as ImageElement;
  });
}
function normalizeRotation(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value % 360 : 0; }
