import type { IndustrialSymbolDefinition } from './catalog';

export const LIBRARY_SYMBOL_DRAG_MIME = 'application/x-pims-vision-library-symbol';

export function serializeLibrarySymbolDragData(symbol: IndustrialSymbolDefinition): string {
  return JSON.stringify({ symbolId: symbol.id });
}

export function parseLibrarySymbolDragData(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null) {
      const symbolId = (parsed as { symbolId?: unknown }).symbolId;
      if (typeof symbolId === 'string' && symbolId.trim().length > 0) {
        return symbolId;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}
