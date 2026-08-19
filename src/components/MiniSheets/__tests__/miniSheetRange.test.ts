import {
  normalizeRange,
  isCellInsideRange,
  isCellInsideRanges,
  rangeFromCells,
  rangeFromColumns,
  rangeFromRows,
  rangeSelectAll,
  isColumnSelected,
  isRowSelected,
  formatRangeAddress,
} from '../miniSheetRange';

describe('miniSheetRange', () => {
  const TOTAL_COLS = 20;
  const TOTAL_ROWS = 50;

  it('normalizes single cell and rectangular block ranges', () => {
    // Normal single cell
    expect(normalizeRange({ startCol: 1, startRow: 2, endCol: 1, endRow: 2 })).toEqual({
      left: 1,
      right: 1,
      top: 2,
      bottom: 2,
    });

    // Inverted drag from D8 (col 3, row 7) to B3 (col 1, row 2)
    const inv = normalizeRange({ startCol: 3, startRow: 7, endCol: 1, endRow: 2 });
    expect(inv).toEqual({
      left: 1,
      right: 3,
      top: 2,
      bottom: 7,
    });
  });

  it('tests if a cell is inside range', () => {
    const range = rangeFromCells({ col: 1, row: 1 }, { col: 3, row: 5 }); // B2:D6
    expect(isCellInsideRange(1, 1, range)).toBe(true); // B2
    expect(isCellInsideRange(2, 4, range)).toBe(true); // C5
    expect(isCellInsideRange(3, 5, range)).toBe(true); // D6
    expect(isCellInsideRange(0, 1, range)).toBe(false); // A2
    expect(isCellInsideRange(4, 5, range)).toBe(false); // E6
    expect(isCellInsideRange(2, 6, range)).toBe(false); // C7
  });

  it('tests multiple non-adjacent ranges (Ctrl/Cmd selection)', () => {
    const r1 = rangeFromCells({ col: 0, row: 0 }, { col: 1, row: 4 }); // A1:B5
    const r2 = rangeFromCells({ col: 3, row: 0 }, { col: 4, row: 4 }); // D1:E5
    const ranges = [r1, r2];

    expect(isCellInsideRanges(0, 0, ranges)).toBe(true); // A1
    expect(isCellInsideRanges(1, 4, ranges)).toBe(true); // B5
    expect(isCellInsideRanges(3, 2, ranges)).toBe(true); // D3
    expect(isCellInsideRanges(4, 4, ranges)).toBe(true); // E5
    expect(isCellInsideRanges(2, 2, ranges)).toBe(false); // C3 (middle gap)
  });

  it('creates whole column ranges and tests selection', () => {
    const colRange = rangeFromColumns(1, 3, TOTAL_ROWS); // B:D
    expect(colRange).toEqual({
      startCol: 1,
      startRow: 0,
      endCol: 3,
      endRow: 49,
    });
    expect(isColumnSelected(1, [colRange])).toBe(true);
    expect(isColumnSelected(2, [colRange])).toBe(true);
    expect(isColumnSelected(3, [colRange])).toBe(true);
    expect(isColumnSelected(0, [colRange])).toBe(false);
    expect(isColumnSelected(4, [colRange])).toBe(false);
  });

  it('creates whole row ranges and tests selection', () => {
    const rowRange = rangeFromRows(4, 11, TOTAL_COLS); // rows 5 to 12
    expect(rowRange).toEqual({
      startCol: 0,
      startRow: 4,
      endCol: 19,
      endRow: 11,
    });
    expect(isRowSelected(4, [rowRange])).toBe(true);
    expect(isRowSelected(11, [rowRange])).toBe(true);
    expect(isRowSelected(3, [rowRange])).toBe(false);
    expect(isRowSelected(12, [rowRange])).toBe(false);
  });

  it('creates select-all range', () => {
    const all = rangeSelectAll(TOTAL_COLS, TOTAL_ROWS);
    expect(all).toEqual({
      startCol: 0,
      startRow: 0,
      endCol: 19,
      endRow: 49,
    });
    expect(isCellInsideRange(0, 0, all)).toBe(true);
    expect(isCellInsideRange(19, 49, all)).toBe(true);
  });

  it('formats range addresses cleanly for address bar', () => {
    // Single cell
    expect(formatRangeAddress(rangeFromCells({ col: 1, row: 3 }, { col: 1, row: 3 }), TOTAL_COLS, TOTAL_ROWS)).toBe('B4');

    // Block
    expect(formatRangeAddress(rangeFromCells({ col: 1, row: 1 }, { col: 4, row: 7 }), TOTAL_COLS, TOTAL_ROWS)).toBe('B2:E8');

    // Inverted block
    expect(formatRangeAddress(rangeFromCells({ col: 4, row: 7 }, { col: 1, row: 1 }), TOTAL_COLS, TOTAL_ROWS)).toBe('B2:E8');

    // Single column
    expect(formatRangeAddress(rangeFromColumns(1, 1, TOTAL_ROWS), TOTAL_COLS, TOTAL_ROWS)).toBe('B');

    // Multiple columns
    expect(formatRangeAddress(rangeFromColumns(1, 5, TOTAL_ROWS), TOTAL_COLS, TOTAL_ROWS)).toBe('B:F');

    // Single row
    expect(formatRangeAddress(rangeFromRows(3, 3, TOTAL_COLS), TOTAL_COLS, TOTAL_ROWS)).toBe('4');

    // Multiple rows
    expect(formatRangeAddress(rangeFromRows(4, 11, TOTAL_COLS), TOTAL_COLS, TOTAL_ROWS)).toBe('5:12');

    // Select all
    expect(formatRangeAddress(rangeSelectAll(TOTAL_COLS, TOTAL_ROWS), TOTAL_COLS, TOTAL_ROWS)).toBe('A1:T50');
  });
});
