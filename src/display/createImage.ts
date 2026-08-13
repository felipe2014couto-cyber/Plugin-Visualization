import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { generateId } from './ids';

export const IMAGE_TYPE = 'image' as const;
export interface ImageProperties extends Record<string, unknown> { src: string; alt: string; }
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
  return { id, type: IMAGE_TYPE, x: options.x ?? 0, y: options.y ?? 0, width: Math.max(1, width), height: Math.max(1, height), properties: { src: options.src, alt: options.alt ?? 'Imagem' } };
}
export function appendImage(document: DisplayDocument, element: ImageElement): DisplayDocument { return { ...document, elements: [...document.elements, element] }; }
