import { CellCoord, colIndexToLetter, formatCellAddress } from './miniSheetFormula';

export interface SheetRange {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

export interface NormalizedRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/**
 * Normalizes any SheetRange so that top <= bottom and left <= right.
 */
export function normalizeRange(range: SheetRange): NormalizedRange {
  return {
    top: Math.min(range.startRow, range.endRow),
    bottom: Math.max(range.startRow, range.endRow),
    left: Math.min(range.startCol, range.endCol),
    right: Math.max(range.startCol, range.endCol),
  };
}

/**
 * Checks if a specific cell coordinate is inside a normalized range.
 */
export function isCellInsideNormalizedRange(col: number, row: number, norm: NormalizedRange): boolean {
  return row >= norm.top && row <= norm.bottom && col >= norm.left && col <= norm.right;
}

/**
 * Checks if a specific cell coordinate is inside a single SheetRange.
 */
export function isCellInsideRange(col: number, row: number, range: SheetRange): boolean {
  const norm = normalizeRange(range);
  return isCellInsideNormalizedRange(col, row, norm);
}

/**
 * Checks if a specific cell coordinate is inside any of the given ranges.
 */
export function isCellInsideRanges(col: number, row: number, ranges: SheetRange[]): boolean {
  for (let i = 0; i < ranges.length; i++) {
    if (isCellInsideRange(col, row, ranges[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a SheetRange from two cell coordinates.
 */
export function rangeFromCells(start: CellCoord, end: CellCoord): SheetRange {
  return {
    startCol: start.col,
    startRow: start.row,
    endCol: end.col,
    endRow: end.row,
  };
}

/**
 * Creates a SheetRange selecting whole columns from startCol to endCol across totalRows.
 */
export function rangeFromColumns(startCol: number, endCol: number, totalRows: number): SheetRange {
  return {
    startCol,
    startRow: 0,
    endCol,
    endRow: totalRows - 1,
  };
}

/**
 * Creates a SheetRange selecting whole rows from startRow to endRow across totalCols.
 */
export function rangeFromRows(startRow: number, endRow: number, totalCols: number): SheetRange {
  return {
    startCol: 0,
    startRow,
    endCol: totalCols - 1,
    endRow,
  };
}

/**
 * Creates a SheetRange selecting all cells in the sheet.
 */
export function rangeSelectAll(totalCols: number, totalRows: number): SheetRange {
  return {
    startCol: 0,
    startRow: 0,
    endCol: totalCols - 1,
    endRow: totalRows - 1,
  };
}

/**
 * Checks if a column index is covered by any of the ranges.
 */
export function isColumnSelected(colIndex: number, ranges: SheetRange[]): boolean {
  for (const r of ranges) {
    const norm = normalizeRange(r);
    if (colIndex >= norm.left && colIndex <= norm.right) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a row index is covered by any of the ranges.
 */
export function isRowSelected(rowIndex: number, ranges: SheetRange[]): boolean {
  for (const r of ranges) {
    const norm = normalizeRange(r);
    if (rowIndex >= norm.top && rowIndex <= norm.bottom) {
      return true;
    }
  }
  return false;
}

/**
 * Formats a single range into address string (e.g. 'A1' or 'A1:D10' or 'A:A' or '1:10').
 */
export function formatRangeAddress(range: SheetRange, totalCols: number, totalRows: number): string {
  const norm = normalizeRange(range);
  const isAllCols = norm.left === 0 && norm.right === totalCols - 1;
  const isAllRows = norm.top === 0 && norm.bottom === totalRows - 1;

  if (isAllCols && isAllRows) {
    return `A1:${colIndexToLetter(totalCols - 1)}${totalRows}`;
  }
  if (isAllRows) {
    if (norm.left === norm.right) {
      return `${colIndexToLetter(norm.left)}`;
    }
    return `${colIndexToLetter(norm.left)}:${colIndexToLetter(norm.right)}`;
  }
  if (isAllCols) {
    if (norm.top === norm.bottom) {
      return `${norm.top + 1}`;
    }
    return `${norm.top + 1}:${norm.bottom + 1}`;
  }
  if (norm.top === norm.bottom && norm.left === norm.right) {
    return formatCellAddress({ col: norm.left, row: norm.top });
  }

  const startAddr = formatCellAddress({ col: norm.left, row: norm.top });
  const endAddr = formatCellAddress({ col: norm.right, row: norm.bottom });
  return `${startAddr}:${endAddr}`;
}
