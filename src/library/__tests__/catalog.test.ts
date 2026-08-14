import {
  INDUSTRIAL_SYMBOL_CATALOG,
  INDUSTRIAL_SYMBOL_CATEGORIES,
  filterIndustrialSymbols,
} from '../catalog';
import { parseLibrarySymbolDragData, serializeLibrarySymbolDragData } from '../librarySymbolDrag';

describe('Library catalog', () => {
  it('preserva os dois símbolos existentes e registra os seis SVGs de motores', () => {
    expect(INDUSTRIAL_SYMBOL_CATEGORIES).toHaveLength(10);
    expect(INDUSTRIAL_SYMBOL_CATALOG).toHaveLength(8);
    expect(INDUSTRIAL_SYMBOL_CATALOG.slice(0, 2).map((symbol) => symbol.id)).toEqual(['PT002A_Option1', 'PV003B']);

    const motors = INDUSTRIAL_SYMBOL_CATALOG.filter((symbol) => symbol.source === 'openclipart');
    expect(motors).toHaveLength(6);
    expect(motors.every((symbol) => symbol.category === 'Motores')).toBe(true);
    expect(motors.every((symbol) => symbol.license === 'Public Domain')).toBe(true);
    expect(new Set(INDUSTRIAL_SYMBOL_CATALOG.map((symbol) => symbol.id)).size).toBe(8);
  });

  it('filtra por nome, categoria, palavras-chave e sinônimos', () => {
    expect(filterIndustrialSymbols('PV003B')).toHaveLength(1);
    expect(filterIndustrialSymbols('instrumentação')).toHaveLength(2);
    expect(filterIndustrialSymbols('trifásico').map((symbol) => symbol.id)).toEqual(['openclipart:three-phase-motor']);
    expect(filterIndustrialSymbols('vibratório').map((symbol) => symbol.id)).toEqual(['openclipart:vibrating-motor']);
    expect(filterIndustrialSymbols('passo').map((symbol) => symbol.id)).toEqual(['openclipart:stepper-motor']);
    expect(filterIndustrialSymbols('ventilação').map((symbol) => symbol.id)).toEqual(['openclipart:ventilation-electric-motor']);
    expect(filterIndustrialSymbols('motor')).toHaveLength(6);
    expect(filterIndustrialSymbols('não existe')).toHaveLength(0);
  });

  it('serializa e valida o payload de arraste', () => {
    const payload = serializeLibrarySymbolDragData(INDUSTRIAL_SYMBOL_CATALOG[0]);
    expect(parseLibrarySymbolDragData(payload)).toBe('PT002A_Option1');
    expect(parseLibrarySymbolDragData('{"symbolId": ""}')).toBeUndefined();
    expect(parseLibrarySymbolDragData('{')).toBeUndefined();
  });
});
