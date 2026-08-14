import {
  appendLibrarySymbol,
  createDisplayDocument,
  createLibrarySymbol,
  parseImportedDisplay,
  serializeDisplay,
} from '../index';

describe('Library symbols no display', () => {
  it('cria o elemento com tamanho padrão e preserva o símbolo no export/import', () => {
    const document = createDisplayDocument({ id: 'library-document', name: 'Library' });
    const symbol = createLibrarySymbol({
      symbol: 'PV003B',
      x: 100,
      y: 80,
      existingIds: ['existing'],
      generateId: () => 'library-symbol-id',
    });
    const next = appendLibrarySymbol(document, symbol);
    const imported = parseImportedDisplay(serializeDisplay(next));

    expect(symbol.type).toBe('library-symbol');
    expect(symbol.width).toBe(96);
    expect(symbol.height).toBe(96);
    expect(imported.elements).toEqual([symbol]);
  });
});
