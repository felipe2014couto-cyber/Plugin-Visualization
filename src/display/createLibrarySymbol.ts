import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { findIndustrialSymbol, getIndustrialSymbolAssetUrl, type IndustrialSymbolDefinition } from '../library';
import { generateId } from './ids';
import { isPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import type { MultistateConfig } from './multistate';

export const LIBRARY_SYMBOL_TYPE = 'library-symbol' as const;

export interface LibrarySymbolProperties extends Record<string, unknown> {
  symbolId: string;
  name: string;
  src: string;
  viewBox: string;
  color: string;
  rotation: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  binding?: PiPointBinding;
  calculationId?: string;
  multistate?: MultistateConfig;
}

export type LibrarySymbolElement = DisplayElement<typeof LIBRARY_SYMBOL_TYPE, LibrarySymbolProperties>;

export interface CreateLibrarySymbolOptions {
  symbol: IndustrialSymbolDefinition | string;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  binding?: PiPointBinding;
  calculationId?: string;
  multistate?: MultistateConfig;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export const MIN_LIBRARY_SYMBOL_SIZE = 180;

export function createLibrarySymbol(options: CreateLibrarySymbolOptions): LibrarySymbolElement {
  const symbol = typeof options.symbol === 'string' ? findIndustrialSymbol(options.symbol) : options.symbol;
  if (!symbol) {
    throw new Error('Símbolo da Library não encontrado.');
  }
  if (options.binding !== undefined && !isPiPointBinding(options.binding)) {
    throw new Error('Símbolo da Library requer um binding de PI Point válido');
  }
  let targetWidth = options.width ?? symbol.defaultSize.width;
  let targetHeight = options.height ?? symbol.defaultSize.height;

  // Se largura/altura não foram especificadas manualmente, garante tamanho mínimo padrão
  if (options.width === undefined && options.height === undefined) {
    const dominant = Math.max(targetWidth, targetHeight);
    if (dominant < MIN_LIBRARY_SYMBOL_SIZE && dominant > 0) {
      const scale = MIN_LIBRARY_SYMBOL_SIZE / dominant;
      targetWidth = Math.round(targetWidth * scale);
      targetHeight = Math.round(targetHeight * scale);
    }
  }

  const width = Math.min(targetWidth, options.surface?.width ?? targetWidth);
  const height = Math.min(targetHeight, options.surface?.height ?? targetHeight);
  const existing = new Set(options.existingIds ?? []);
  const generate = options.generateId ?? generateId;
  let id = options.id ?? generate();
  while (existing.has(id)) {
    id = generate();
  }
  return {
    id,
    type: LIBRARY_SYMBOL_TYPE,
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: Math.max(1, width),
    height: Math.max(1, height),
    properties: {
      symbolId: symbol.id,
      name: symbol.name,
      src: getIndustrialSymbolAssetUrl(symbol),
      viewBox: symbol.viewBox,
      color: normalizeLibrarySymbolColor(options.color),
      rotation: 0,
      ...(options.flipHorizontal ? { flipHorizontal: true } : {}),
      ...(options.flipVertical ? { flipVertical: true } : {}),
      ...(options.binding ? { binding: { ...options.binding } } : {}),
      ...(options.calculationId ? { calculationId: options.calculationId } : {}),
      ...(options.multistate ? { multistate: options.multistate } : {}),
    },
  };
}

export function appendLibrarySymbol(document: DisplayDocument, element: LibrarySymbolElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}

import { updateElementInDocument } from './createGroup';

export function updateLibrarySymbolProperties(
  document: DisplayDocument,
  elementId: string,
  patch: Partial<LibrarySymbolProperties>,
): DisplayDocument {
  return updateElementInDocument(document, elementId, (element) => {
    if (element.type !== LIBRARY_SYMBOL_TYPE) {
      return element;
    }
    const properties = element.properties as Partial<LibrarySymbolProperties>;
    return {
      ...element,
      properties: {
        ...properties,
        ...patch,
        color: normalizeLibrarySymbolColor(patch.color ?? properties.color),
        rotation: normalizeRotation(patch.rotation ?? properties.rotation),
        flipHorizontal: typeof patch.flipHorizontal === 'boolean' ? patch.flipHorizontal : properties.flipHorizontal,
        flipVertical: typeof patch.flipVertical === 'boolean' ? patch.flipVertical : properties.flipVertical,
      },
    } as LibrarySymbolElement;
  });
}

export function getLibrarySymbolColor(properties: Partial<LibrarySymbolProperties>): string {
  return normalizeLibrarySymbolColor(properties.color);
}

export const DEFAULT_LIBRARY_SYMBOL_COLOR = '#707070';

function normalizeLibrarySymbolColor(color: unknown): string {
  return color === 'transparent' || (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
    ? color
    : DEFAULT_LIBRARY_SYMBOL_COLOR;
}

function normalizeRotation(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value % 360 : 0;
}
