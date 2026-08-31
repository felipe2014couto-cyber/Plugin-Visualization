import {
  shiftFormulaReferences,
  detectArithmeticSequence,
  calculateAutofillCells,
  matrixToTsv,
  formatDisplayNumber,
} from '../miniSheetOperations';

describe('miniSheetOperations', () => {
  describe('shiftFormulaReferences', () => {
    it('shifts relative references horizontally and vertically', () => {
      // B1 = =A1*2 shifted down 1 row -> =A2*2
      expect(shiftFormulaReferences('=A1*2', 0, 1)).toBe('=A2*2');

      // B1 = =A1*2 shifted right 2 cols -> =C1*2
      expect(shiftFormulaReferences('=A1*2', 2, 0)).toBe('=C1*2');

      // =C3+D3 shifted 1 row down -> =C4+D4
      expect(shiftFormulaReferences('=C3+D3', 0, 1)).toBe('=C4+D4');

      // =SUM(A1:A10) shifted 1 col right -> =SUM(B1:B10)
      expect(shiftFormulaReferences('=SUM(A1:A10)', 1, 0)).toBe('=SUM(B1:B10)');
    });

    it('respects absolute column and absolute row references ($A$1, $A1, A$1)', () => {
      // $A$1 does not change
      expect(shiftFormulaReferences('=$A$1*2', 2, 3)).toBe('=$A$1*2');

      // $A1 fixes column, shifts row
      expect(shiftFormulaReferences('=$A1*2', 2, 3)).toBe('=$A4*2');

      // A$1 fixes row, shifts column
      expect(shiftFormulaReferences('=A$1*2', 2, 3)).toBe('=C$1*2');
    });

    it('preserves PI formula tag names inside quotes', () => {
      expect(shiftFormulaReferences('=PICurrVal("LFS_RB2_TEMP")', 2, 3)).toBe('=PICurrVal("LFS_RB2_TEMP")');
      expect(shiftFormulaReferences('=PIArcVal("LFS_RB2_TEMP", "*-1h")', 1, 1)).toBe(
        '=PIArcVal("LFS_RB2_TEMP", "*-1h")'
      );
      expect(shiftFormulaReferences('=PICompDat("TAG_1", "*-1h", "*")', 0, 5)).toBe(
        '=PICompDat("TAG_1", "*-1h", "*")'
      );
    });

    it('handles #REF! when shifted out of bounds', () => {
      expect(shiftFormulaReferences('=A1+B1', -1, 0)).toBe('=#REF!+A1');
    });
  });

  describe('detectArithmeticSequence', () => {
    it('detects simple arithmetic progressions', () => {
      expect(detectArithmeticSequence([1, 2])).toEqual({ step: 1 });
      expect(detectArithmeticSequence([1, 2, 3, 4])).toEqual({ step: 1 });
      expect(detectArithmeticSequence([10, 20])).toEqual({ step: 10 });
      expect(detectArithmeticSequence([100, 95, 90])).toEqual({ step: -5 });
    });

    it('returns null for non-arithmetic sequences', () => {
      expect(detectArithmeticSequence([1])).toBeNull();
      expect(detectArithmeticSequence([1, 2, 4])).toBeNull();
    });
  });

  describe('calculateAutofillCells', () => {
    it('autofills numbers down in arithmetic sequence (1, 2 -> 3, 4, 5)', () => {
      const data: Record<string, string> = {
        '0,0': '1',
        '0,1': '2',
      };
      const getCell = (c: number, r: number) => ({ rawValue: data[`${c},${r}`] ?? '', displayValue: data[`${c},${r}`] ?? '' });

      const sourceRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 1 }; // A1:A2
      const targetRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 4 }; // A1:A5

      const generated = calculateAutofillCells(sourceRange, targetRange, getCell);
      expect(generated.length).toBe(3); // A3, A4, A5
      expect(generated[0]).toMatchObject({ col: 0, row: 2, rawValue: '3' });
      expect(generated[1]).toMatchObject({ col: 0, row: 3, rawValue: '4' });
      expect(generated[2]).toMatchObject({ col: 0, row: 4, rawValue: '5' });
    });

    it('autofills formulas down adjusting relative references (=A1*2 -> =A2*2, =A3*2)', () => {
      const data: Record<string, string> = {
        '1,0': '=A1*2',
      };
      const getCell = (c: number, r: number) => ({ rawValue: data[`${c},${r}`] ?? '', displayValue: '' });

      const sourceRange = { startCol: 1, startRow: 0, endCol: 1, endRow: 0 }; // B1
      const targetRange = { startCol: 1, startRow: 0, endCol: 1, endRow: 3 }; // B1:B4

      const generated = calculateAutofillCells(sourceRange, targetRange, getCell);
      expect(generated.length).toBe(3); // B2, B3, B4
      expect(generated[0]).toMatchObject({ col: 1, row: 1, rawValue: '=A2*2' });
      expect(generated[1]).toMatchObject({ col: 1, row: 2, rawValue: '=A3*2' });
      expect(generated[2]).toMatchObject({ col: 1, row: 3, rawValue: '=A4*2' });
    });

    it('autofills horizontally to the right (1, 2 -> 3, 4, 5)', () => {
      const data: Record<string, string> = {
        '0,0': '10',
        '1,0': '20',
      };
      const getCell = (c: number, r: number) => ({ rawValue: data[`${c},${r}`] ?? '', displayValue: data[`${c},${r}`] ?? '' });

      const sourceRange = { startCol: 0, startRow: 0, endCol: 1, endRow: 0 }; // A1:B1
      const targetRange = { startCol: 0, startRow: 0, endCol: 4, endRow: 0 }; // A1:E1

      const generated = calculateAutofillCells(sourceRange, targetRange, getCell);
      expect(generated.length).toBe(3); // C1, D1, E1
      expect(generated[0]).toMatchObject({ col: 2, row: 0, rawValue: '30' });
      expect(generated[1]).toMatchObject({ col: 3, row: 0, rawValue: '40' });
      expect(generated[2]).toMatchObject({ col: 4, row: 0, rawValue: '50' });
    });

    it('preserves SIP literals during autofill instead of evaluating formula-like values', () => {
      const getCell = () => ({ rawValue: '=1+1', displayValue: '=1+1', valueOrigin: 'sip' as const });
      const generated = calculateAutofillCells(
        { startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
        { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
        getCell
      );

      expect(generated).toEqual([
        expect.objectContaining({ row: 1, rawValue: '=1+1', displayValue: '=1+1', valueOrigin: 'sip' }),
        expect.objectContaining({ row: 2, rawValue: '=1+1', displayValue: '=1+1', valueOrigin: 'sip' }),
      ]);
    });
  });

  describe('matrixToTsv', () => {
    it('converts cell matrix to tab-separated text with newlines', () => {
      const matrix = [
        [{ rawValue: 'Motor A', displayValue: 'Motor A' }, { rawValue: '45.2', displayValue: '45.2' }],
        [{ rawValue: 'Motor B', displayValue: 'Motor B' }, { rawValue: '47.1', displayValue: '47.1' }],
      ];
      expect(matrixToTsv(matrix)).toBe('Motor A\t45.2\nMotor B\t47.1');
    });

    it('neutralizes formula prefixes only for untrusted SIP cells', () => {
      expect(matrixToTsv([[
        { rawValue: '=1+1', displayValue: '=1+1', valueOrigin: 'sip' },
        { rawValue: '+123', displayValue: '+123', valueOrigin: 'sip' },
        { rawValue: '-123', displayValue: '-123', valueOrigin: 'sip' },
        { rawValue: '@text', displayValue: '@text', valueOrigin: 'sip' },
        { rawValue: '=A1+B1', displayValue: '2', valueOrigin: 'formula' },
      ]])).toBe("'=1+1\t'+123\t'-123\t'@text\t2");
    });
  });

  describe('formatDisplayNumber', () => {
    it('formats decimal places correctly without altering raw number', () => {
      expect(formatDisplayNumber('12.34567', 2)).toBe('12.35');
      expect(formatDisplayNumber('12.34567', 0)).toBe('12');
      expect(formatDisplayNumber('12.34567', 'auto')).toBe('12.34567');
      expect(formatDisplayNumber('Text', 2)).toBe('Text');
    });
  });
});
