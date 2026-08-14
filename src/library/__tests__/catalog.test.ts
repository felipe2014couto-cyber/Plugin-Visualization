import {
  INDUSTRIAL_SYMBOL_CATALOG,
  INDUSTRIAL_SYMBOL_CATEGORIES,
  filterIndustrialSymbols,
} from '../catalog';
import { parseLibrarySymbolDragData, serializeLibrarySymbolDragData } from '../librarySymbolDrag';

describe('Library catalog', () => {
  it('mantém as categorias siderúrgicas e os símbolos locais com metadados', () => {
    expect(INDUSTRIAL_SYMBOL_CATEGORIES).toHaveLength(10);
    expect(INDUSTRIAL_SYMBOL_CATALOG).toHaveLength(2);
    expect(INDUSTRIAL_SYMBOL_CATALOG.every((symbol) => symbol.source === 'equinor-engineering-symbols')).toBe(true);
    expect(INDUSTRIAL_SYMBOL_CATALOG.every((symbol) => symbol.license === 'MIT')).toBe(true);
    expect(INDUSTRIAL_SYMBOL_CATALOG.map((symbol) => symbol.svg)).toEqual([
      'img/library-PT002A_Option1.svg',
      'img/library-PV003B.svg',
    ]);
  });

  it('filtra por nome, categoria e palavras-chave', () => {
    expect(filterIndustrialSymbols('PV003B')).toHaveLength(1);
    expect(filterIndustrialSymbols('instrumentação')).toHaveLength(2);
    expect(filterIndustrialSymbols('não existe')).toHaveLength(0);
  });

  it('serializa e valida o payload de arraste', () => {
    const payload = serializeLibrarySymbolDragData(INDUSTRIAL_SYMBOL_CATALOG[0]);
    expect(parseLibrarySymbolDragData(payload)).toBe('PT002A_Option1');
    expect(parseLibrarySymbolDragData('{"symbolId": ""}')).toBeUndefined();
    expect(parseLibrarySymbolDragData('{')).toBeUndefined();
  });
});
