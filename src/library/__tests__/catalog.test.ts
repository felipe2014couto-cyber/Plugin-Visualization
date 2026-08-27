import {
  INDUSTRIAL_SYMBOL_CATALOG,
  INDUSTRIAL_SYMBOL_CATEGORIES,
  filterIndustrialSymbols,
} from '../catalog';
import { parseLibrarySymbolDragData, serializeLibrarySymbolDragData } from '../librarySymbolDrag';

describe('Library catalog', () => {
  it('preserva os símbolos existentes e registra os assets locais', () => {
    expect(INDUSTRIAL_SYMBOL_CATEGORIES).toHaveLength(15);
    expect(INDUSTRIAL_SYMBOL_CATALOG).toHaveLength(95);
    expect(INDUSTRIAL_SYMBOL_CATALOG.slice(0, 2).map((symbol) => symbol.id)).toEqual(['PT002A_Option1', 'PV003B']);

    const motors = INDUSTRIAL_SYMBOL_CATALOG.filter((symbol) => symbol.source === 'openclipart');
    expect(motors).toHaveLength(2);
    expect(motors.every((symbol) => symbol.category === 'Motores')).toBe(true);
    expect(motors.every((symbol) => symbol.license === 'Public Domain')).toBe(true);
    const localSymbols = INDUSTRIAL_SYMBOL_CATALOG.filter((symbol) => symbol.source === 'pims-vision');
    expect(localSymbols).toHaveLength(91);
    expect(localSymbols.every((symbol) => symbol.license === 'Project Asset')).toBe(true);
    expect(new Set(INDUSTRIAL_SYMBOL_CATALOG.map((symbol) => symbol.id)).size).toBe(95);
  });

  it('filtra por nome, categoria, palavras-chave e sinônimos', () => {
    expect(filterIndustrialSymbols('PV003B')).toHaveLength(1);
    expect(filterIndustrialSymbols('instrumentação')).toHaveLength(12);
    expect(filterIndustrialSymbols('horizontal').map((symbol) => symbol.id)).toEqual(['openclipart:industrial-electric-motor']);
    expect(filterIndustrialSymbols('compacto').map((symbol) => symbol.id)).toEqual(['openclipart:industrial-electric-motor-lower']);
    expect(filterIndustrialSymbols('ventilação')).toHaveLength(4);
    expect(filterIndustrialSymbols('motor')).toHaveLength(2 + 22);
    expect(filterIndustrialSymbols('não existe')).toHaveLength(0);
  });

  it('serializa e valida o payload de arraste', () => {
    const payload = serializeLibrarySymbolDragData(INDUSTRIAL_SYMBOL_CATALOG[0]);
    expect(parseLibrarySymbolDragData(payload)).toBe('PT002A_Option1');
    expect(parseLibrarySymbolDragData('{"symbolId": ""}')).toBeUndefined();
    expect(parseLibrarySymbolDragData('{')).toBeUndefined();
  });
});
