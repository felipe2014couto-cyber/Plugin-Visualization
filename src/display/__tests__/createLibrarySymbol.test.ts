import {
  appendLibrarySymbol,
  createDisplayDocument,
  createLibrarySymbol,
  parseImportedDisplay,
  serializeDisplay,
} from '../index';
import { INDUSTRIAL_SYMBOL_CATALOG } from '../../library';

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
    expect(symbol.width).toBe(180);
    expect(symbol.height).toBe(180);
    expect(imported.elements).toEqual([symbol]);
  });

  it('preserva os motores Openclipart no salvar e restaurar', () => {
    const motors = INDUSTRIAL_SYMBOL_CATALOG.filter((symbol) => symbol.source === 'openclipart');
    const document = motors.reduce((current, motor, index) => appendLibrarySymbol(current, createLibrarySymbol({
      symbol: motor,
      x: index * 110,
      y: 40,
      existingIds: current.elements.map(({ id }) => id),
      generateId: () => 'openclipart-motor-' + index,
    })), createDisplayDocument({ id: 'openclipart-motors', name: 'Openclipart motors' }));
    const imported = parseImportedDisplay(serializeDisplay(document));

    expect(imported.elements).toHaveLength(2);
    expect(imported.elements.map((element) => element.properties.symbolId)).toEqual(motors.map((motor) => motor.id));
  });
});
