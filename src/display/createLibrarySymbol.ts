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
  binding?: PiPointBinding;
  calculationId?: string;
  multistate?: MultistateConfig;
  surface?: DisplaySurface;
  existingIds?: readonly string[];
  generateId?: () => string;
}

export function createLibrarySymbol(options: CreateLibrarySymbolOptions): LibrarySymbolElement {
  const symbol = typeof options.symbol === 'string' ? findIndustrialSymbol(options.symbol) : options.symbol;
  if (!symbol) {
    throw new Error('Símbolo da Library não encontrado.');
  }
  if (options.binding !== undefined && !isPiPointBinding(options.binding)) {
    throw new Error('Símbolo da Library requer um binding de PI Point válido');
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
      color: normalizeLibrarySymbolColor(options.color),
      rotation: 0,
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
