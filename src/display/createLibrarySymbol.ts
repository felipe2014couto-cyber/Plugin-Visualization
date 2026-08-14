import type { DisplayDocument } from './displayDocument';
import type { DisplayElement } from './displayElement';
import type { DisplaySurface } from './displaySurface';
import { findIndustrialSymbol, getIndustrialSymbolAssetUrl, type IndustrialSymbolDefinition } from '../library';
import { generateId } from './ids';

export const LIBRARY_SYMBOL_TYPE = 'library-symbol' as const;

export interface LibrarySymbolProperties extends Record<string, unknown> {
  symbolId: string;
  name: string;
  src: string;
  viewBox: string;
}

export type LibrarySymbolElement = DisplayElement<typeof LIBRARY_SYMBOL_TYPE, LibrarySymbolProperties>;

export interface CreateLibrarySymbolOptions {
  symbol: IndustrialSymbolDefinition | string;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createLibrarySymbol(options: CreateLibrarySymbolOptions): LibrarySymbolElement {
  const symbol = typeof options.symbol === 'string' ? findIndustrialSymbol(options.symbol) : options.symbol;
  if (!symbol) {
    throw new Error('Símbolo da Library não encontrado.');
  }
  const width = Math.min(options.width ?? symbol.defaultSize.width, options.surface?.width ?? symbol.defaultSize.width);
  const height = Math.min(options.height ?? symbol.defaultSize.height, options.surface?.height ?? symbol.defaultSize.height);
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
    },
  };
}

export function appendLibrarySymbol(document: DisplayDocument, element: LibrarySymbolElement): DisplayDocument {
  return { ...document, elements: [...document.elements, element] };
}
