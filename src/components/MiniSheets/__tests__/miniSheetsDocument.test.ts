import {
  createEmptyMiniSheetsDocument,
  deserializeMiniSheets,
  MINISHEETS_DOCUMENT_VERSION,
  MiniSheetsDocument,
  serializeMiniSheets,
} from '../miniSheetsDocument';
import { CellData } from '../MiniSheetsPanel';

describe('miniSheetsDocument serialization and deserialization', () => {
  it('creates an empty valid MiniSheetsDocument', () => {
    const doc = createEmptyMiniSheetsDocument();
    expect(doc.version).toBe(MINISHEETS_DOCUMENT_VERSION);
    expect(doc.columnCount).toBe(20);
    expect(doc.rowCount).toBe(50);
    expect(Object.keys(doc.cells)).toHaveLength(0);
  });

  it('serializes text, numbers, formulas and formats into sparse cells map', () => {
    const cellsMap = new Map<string, CellData>();
    // A1 = "Motor A"
    cellsMap.set('0,0', { rawValue: 'Motor A', displayValue: 'Motor A' });
    // B1 = 7 with bold format
    cellsMap.set('1,0', {
      rawValue: '7',
      displayValue: '7',
      format: { bold: true, horizontalAlign: 'right' },
    });
    // C1 = =A1+B1 (local formula)
    cellsMap.set('2,0', { rawValue: '=A1+B1', displayValue: '10' });
    // D1 = =PICurrVal("TAG_A") (PI formula)
    cellsMap.set('3,0', { rawValue: '=PICurrVal("TAG_A")', displayValue: '45.8' });
    // E1 = empty cell with background color format only
    cellsMap.set('4,0', {
      rawValue: '',
      displayValue: '',
      format: { backgroundColor: '#ff0000' },
    });

    const colWidths = new Map<number, number>([[0, 150]]);

    const doc = serializeMiniSheets(cellsMap, colWidths, 20, 50);

    expect(doc.version).toBe(1);
    expect(doc.columnCount).toBe(20);
    expect(doc.rowCount).toBe(50);
    expect(doc.columnWidths).toEqual({ '0': 150 });

    expect(doc.cells['A1']).toEqual({ rawValue: 'Motor A' });
    expect(doc.cells['B1']).toEqual({
      rawValue: '7',
      format: { bold: true, horizontalAlign: 'right' },
    });
    expect(doc.cells['C1']).toEqual({ rawValue: '=A1+B1' });
    expect(doc.cells['D1']).toEqual({ rawValue: '=PICurrVal("TAG_A")' });
    expect(doc.cells['E1']).toEqual({
      format: { backgroundColor: '#ff0000' },
    });

    // Does NOT save displayValue as truth
    expect((doc.cells['C1'] as any).displayValue).toBeUndefined();
    expect((doc.cells['D1'] as any).displayValue).toBeUndefined();
  });

  it('does NOT serialize derived spill cells', () => {
    const cellsMap = new Map<string, CellData>();
    // Origin cell A1
    cellsMap.set('0,0', {
      rawValue: '=PICompDat("TAG", "*-1h", "*")',
      displayValue: '19/08/2026 07:00:00',
      spillTargetAddresses: ['B1', 'A2', 'B2'],
    });
    // Spilled cell B1
    cellsMap.set('1,0', {
      rawValue: '',
      displayValue: '35.2',
      spilledFrom: 'A1',
    });
    // Spilled cell A2
    cellsMap.set('0,1', {
      rawValue: '',
      displayValue: '19/08/2026 07:05:00',
      spilledFrom: 'A1',
    });

    const doc = serializeMiniSheets(cellsMap);

    expect(doc.cells['A1']).toEqual({ rawValue: '=PICompDat("TAG", "*-1h", "*")' });
    expect(doc.cells['B1']).toBeUndefined();
    expect(doc.cells['A2']).toBeUndefined();
  });

  it('deserializes a saved document into in-memory cells and colWidths', () => {
    const savedDoc: MiniSheetsDocument = {
      version: 1,
      columnCount: 20,
      rowCount: 50,
      columnWidths: { '1': 160 },
      cells: {
        A1: { rawValue: 'Motor A' },
        B1: { rawValue: '=PICurrVal("TAG_1")', format: { bold: true, decimalPlaces: 2 } },
      },
    };

    const restored = deserializeMiniSheets(savedDoc);
    expect(restored.columnCount).toBe(20);
    expect(restored.rowCount).toBe(50);
    expect(restored.colWidths.get(1)).toBe(160);

    const cellA1 = restored.cells.get('0,0');
    expect(cellA1).toBeDefined();
    expect(cellA1?.rawValue).toBe('Motor A');
    expect(cellA1?.displayValue).toBe('Motor A');

    const cellB1 = restored.cells.get('1,0');
    expect(cellB1).toBeDefined();
    expect(cellB1?.rawValue).toBe('=PICurrVal("TAG_1")');
    expect(cellB1?.displayValue).toBe('Carregando...');
    expect(cellB1?.format).toEqual({ bold: true, decimalPlaces: 2 });
  });

  it('defensively handles undefined, empty or corrupted document input', () => {
    const emptyResult = deserializeMiniSheets(undefined);
    expect(emptyResult.cells.size).toBe(0);
    expect(emptyResult.columnCount).toBe(20);

    const corruptedResult = deserializeMiniSheets({
      version: 1,
      cells: {
        'INVALID_COORD': { rawValue: 'Test' },
        'A1': null as any,
        'B2': { rawValue: 123 as any, format: 'invalid' as any },
      },
    });

    // Should ignore invalid coordinates and null cells without crashing
    expect(corruptedResult.cells.get('0,0')).toBeUndefined();
    // B2 should have clean empty rawValue string
    const cellB2 = corruptedResult.cells.get('1,1');
    expect(cellB2).toBeDefined();
    expect(cellB2?.rawValue).toBe('');
  });

  it('preserves SIP values as literal data across save/load without persisting secrets', () => {
    const cells = new Map<string, CellData>([
      ['0,0', {
        rawValue: '=1+1',
        displayValue: '=1+1',
        valueOrigin: 'sip',
        sipOrigin: {
          sql: 'SELECT VALUE FROM APPROVED_VIEW',
          maxRows: 200,
          targetCell: 'A1',
          includeHeaders: false,
          originCoord: { col: 0, row: 0 },
          password: 'must-not-persist',
          sessionId: 'must-not-persist',
          dsn: 'must-not-persist',
        } as any,
      }],
    ]);

    const serialized = serializeMiniSheets(cells);
    expect(serialized.cells.A1.valueOrigin).toBe('sip');
    expect(serialized.cells.A1.sipOrigin).toEqual({
      sql: 'SELECT VALUE FROM APPROVED_VIEW',
      maxRows: 200,
      targetCell: 'A1',
      includeHeaders: false,
      originCoord: { col: 0, row: 0 },
    });
    expect(JSON.stringify(serialized)).not.toContain('must-not-persist');

    const restored = deserializeMiniSheets(serialized).cells.get('0,0');
    expect(restored).toMatchObject({ rawValue: '=1+1', displayValue: '=1+1', valueOrigin: 'sip' });
  });
});
