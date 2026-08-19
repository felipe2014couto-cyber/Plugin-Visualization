import { colIndexToLetter, colLetterToIndex } from './miniSheetFormula';
import { normalizeRange, SheetRange } from './miniSheetRange';

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  backgroundColor?: string;
  horizontalAlign?: 'left' | 'center' | 'right';
  decimalPlaces?: number | 'auto';
}

export interface ClipboardCell {
  rawValue: string;
  displayValue: string;
  format?: CellFormat;
}

export interface MiniSheetClipboard {
  rows: number;
  cols: number;
  matrix: ClipboardCell[][];
  sourceOrigin?: { col: number; row: number };
}

/**
 * Adjusts relative and absolute cell references in a spreadsheet formula.
 * E.g., '=A1*2' with deltaRow=1, deltaCol=0 -> '=A2*2'.
 * '$A$1' -> '$A$1', '$A1' with deltaCol=1 -> '$A1', 'A$1' with deltaRow=1 -> 'A$1'.
 * Preserves strings within quotes (e.g. '=PICurrVal("TAG")' will not modify "TAG").
 */
export function shiftFormulaReferences(
  formula: string,
  deltaCol: number,
  deltaRow: number,
  totalCols = 20,
  totalRows = 50
): string {
  if (!formula.startsWith('=')) {
    return formula;
  }

  // Regex matches quoted strings OR cell references like ($?)([A-Za-z]+)($?)(\d+)
  // We match double quotes, single quotes, or cell references
  const tokenRegex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\$?)([A-Za-z]+)(\$?)([0-9]+)/g;

  return formula.replace(tokenRegex, (match, quotedString, absCol, colLetters, absRow, rowDigits) => {
    // If it's a quoted string, preserve it as is
    if (quotedString !== undefined) {
      return quotedString;
    }

    const colIndex = colLetterToIndex(colLetters);
    const rowIndex = parseInt(rowDigits, 10) - 1;

    // Check if valid row and column range
    if (colIndex < 0 || rowIndex < 0) {
      return match;
    }

    const isColAbsolute = absCol === '$';
    const isRowAbsolute = absRow === '$';

    let newCol = colIndex;
    if (!isColAbsolute) {
      newCol = colIndex + deltaCol;
    }

    let newRow = rowIndex;
    if (!isRowAbsolute) {
      newRow = rowIndex + deltaRow;
    }

    // If shifted out of bounds, clamp to bounds or keep reference
    if (newCol < 0 || newCol >= totalCols || newRow < 0 || newRow >= totalRows) {
      return '#REF!';
    }

    const newColStr = (isColAbsolute ? '$' : '') + colIndexToLetter(newCol);
    const newRowStr = (isRowAbsolute ? '$' : '') + (newRow + 1);

    return `${newColStr}${newRowStr}`;
  });
}

/**
 * Checks if a list of numbers forms a strict arithmetic sequence (e.g., [1, 2] -> step: 1, [10, 20] -> step: 10).
 */
export function detectArithmeticSequence(values: number[]): { step: number } | null {
  if (values.length < 2) {
    return null;
  }
  const step = values[1] - values[0];
  if (Number.isNaN(step)) {
    return null;
  }
  for (let i = 2; i < values.length; i++) {
    if (Math.abs(values[i] - values[i - 1] - step) > 1e-9) {
      return null;
    }
  }
  return { step };
}

/**
 * Generates cells for an autofill operation in horizontal or vertical direction.
 */
export interface AutofillSourceCell {
  col: number;
  row: number;
  rawValue: string;
  displayValue: string;
  format?: CellFormat;
}

export interface AutofillGeneratedCell {
  col: number;
  row: number;
  rawValue: string;
  displayValue: string;
  format?: CellFormat;
}

export type AutofillDirection = 'down' | 'up' | 'right' | 'left';

export function calculateAutofillCells(
  sourceRange: SheetRange,
  targetRange: SheetRange,
  getCell: (col: number, row: number) => { rawValue?: string; displayValue?: string; format?: CellFormat } | undefined,
  totalCols = 20,
  totalRows = 50
): AutofillGeneratedCell[] {
  const normSource = normalizeRange(sourceRange);
  const normTarget = normalizeRange(targetRange);

  const sourceWidth = normSource.right - normSource.left + 1;
  const sourceHeight = normSource.bottom - normSource.top + 1;

  // Determine direction
  let direction: AutofillDirection = 'down';
  if (normTarget.bottom > normSource.bottom) {
    direction = 'down';
  } else if (normTarget.top < normSource.top) {
    direction = 'up';
  } else if (normTarget.right > normSource.right) {
    direction = 'right';
  } else if (normTarget.left < normSource.left) {
    direction = 'left';
  }

  const generated: AutofillGeneratedCell[] = [];

  if (direction === 'down' || direction === 'up') {
    // Column-by-column extrapolation
    for (let c = normSource.left; c <= normSource.right; c++) {
      const colCells: AutofillSourceCell[] = [];
      for (let r = normSource.top; r <= normSource.bottom; r++) {
        const data = getCell(c, r);
        colCells.push({
          col: c,
          row: r,
          rawValue: data?.rawValue ?? '',
          displayValue: data?.displayValue ?? '',
          format: data?.format,
        });
      }

      // Check if this column is an arithmetic sequence of numbers
      const numericValues: number[] = [];
      let allNumbers = colCells.length >= 2;
      for (const cell of colCells) {
        const val = parseFloat(cell.rawValue);
        if (cell.rawValue.startsWith('=') || Number.isNaN(val) || cell.rawValue.trim() === '') {
          allNumbers = false;
          break;
        }
        numericValues.push(val);
      }

      const seq = allNumbers ? detectArithmeticSequence(numericValues) : null;

      if (direction === 'down') {
        const targetStartRow = normSource.bottom + 1;
        const targetEndRow = normTarget.bottom;
        for (let r = targetStartRow; r <= targetEndRow; r++) {
          const offset = r - normSource.top;
          const templateIndex = (r - normSource.top) % sourceHeight;
          const templateCell = colCells[templateIndex >= 0 ? templateIndex : 0];

          if (seq) {
            const stepMultiplier = offset;
            const nextVal = numericValues[0] + stepMultiplier * seq.step;
            const strVal = String(Math.round(nextVal * 1e9) / 1e9);
            generated.push({
              col: c,
              row: r,
              rawValue: strVal,
              displayValue: strVal,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          } else {
            const deltaRow = r - templateCell.row;
            const deltaCol = 0;
            const newRawValue = templateCell.rawValue.startsWith('=')
              ? shiftFormulaReferences(templateCell.rawValue, deltaCol, deltaRow, totalCols, totalRows)
              : templateCell.rawValue;
            generated.push({
              col: c,
              row: r,
              rawValue: newRawValue,
              displayValue: newRawValue.startsWith('=') ? 'Carregando...' : templateCell.displayValue,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          }
        }
      } else {
        // direction === 'up'
        const targetStartRow = normTarget.top;
        const targetEndRow = normSource.top - 1;
        for (let r = targetEndRow; r >= targetStartRow; r--) {
          const offset = r - normSource.top;
          const templateIndex = ((r - normSource.top) % sourceHeight + sourceHeight) % sourceHeight;
          const templateCell = colCells[templateIndex];

          if (seq) {
            const stepMultiplier = offset;
            const nextVal = numericValues[0] + stepMultiplier * seq.step;
            const strVal = String(Math.round(nextVal * 1e9) / 1e9);
            generated.push({
              col: c,
              row: r,
              rawValue: strVal,
              displayValue: strVal,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          } else {
            const deltaRow = r - templateCell.row;
            const deltaCol = 0;
            const newRawValue = templateCell.rawValue.startsWith('=')
              ? shiftFormulaReferences(templateCell.rawValue, deltaCol, deltaRow, totalCols, totalRows)
              : templateCell.rawValue;
            generated.push({
              col: c,
              row: r,
              rawValue: newRawValue,
              displayValue: newRawValue.startsWith('=') ? 'Carregando...' : templateCell.displayValue,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          }
        }
      }
    }
  } else {
    // direction === 'right' || direction === 'left'
    for (let r = normSource.top; r <= normSource.bottom; r++) {
      const rowCells: AutofillSourceCell[] = [];
      for (let c = normSource.left; c <= normSource.right; c++) {
        const data = getCell(c, r);
        rowCells.push({
          col: c,
          row: r,
          rawValue: data?.rawValue ?? '',
          displayValue: data?.displayValue ?? '',
          format: data?.format,
        });
      }

      const numericValues: number[] = [];
      let allNumbers = rowCells.length >= 2;
      for (const cell of rowCells) {
        const val = parseFloat(cell.rawValue);
        if (cell.rawValue.startsWith('=') || Number.isNaN(val) || cell.rawValue.trim() === '') {
          allNumbers = false;
          break;
        }
        numericValues.push(val);
      }

      const seq = allNumbers ? detectArithmeticSequence(numericValues) : null;

      if (direction === 'right') {
        const targetStartCol = normSource.right + 1;
        const targetEndCol = normTarget.right;
        for (let c = targetStartCol; c <= targetEndCol; c++) {
          const offset = c - normSource.left;
          const templateIndex = (c - normSource.left) % sourceWidth;
          const templateCell = rowCells[templateIndex >= 0 ? templateIndex : 0];

          if (seq) {
            const stepMultiplier = offset;
            const nextVal = numericValues[0] + stepMultiplier * seq.step;
            const strVal = String(Math.round(nextVal * 1e9) / 1e9);
            generated.push({
              col: c,
              row: r,
              rawValue: strVal,
              displayValue: strVal,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          } else {
            const deltaCol = c - templateCell.col;
            const deltaRow = 0;
            const newRawValue = templateCell.rawValue.startsWith('=')
              ? shiftFormulaReferences(templateCell.rawValue, deltaCol, deltaRow, totalCols, totalRows)
              : templateCell.rawValue;
            generated.push({
              col: c,
              row: r,
              rawValue: newRawValue,
              displayValue: newRawValue.startsWith('=') ? 'Carregando...' : templateCell.displayValue,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          }
        }
      } else {
        // direction === 'left'
        const targetStartCol = normTarget.left;
        const targetEndCol = normSource.left - 1;
        for (let c = targetEndCol; c >= targetStartCol; c--) {
          const offset = c - normSource.left;
          const templateIndex = ((c - normSource.left) % sourceWidth + sourceWidth) % sourceWidth;
          const templateCell = rowCells[templateIndex];

          if (seq) {
            const stepMultiplier = offset;
            const nextVal = numericValues[0] + stepMultiplier * seq.step;
            const strVal = String(Math.round(nextVal * 1e9) / 1e9);
            generated.push({
              col: c,
              row: r,
              rawValue: strVal,
              displayValue: strVal,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          } else {
            const deltaCol = c - templateCell.col;
            const deltaRow = 0;
            const newRawValue = templateCell.rawValue.startsWith('=')
              ? shiftFormulaReferences(templateCell.rawValue, deltaCol, deltaRow, totalCols, totalRows)
              : templateCell.rawValue;
            generated.push({
              col: c,
              row: r,
              rawValue: newRawValue,
              displayValue: newRawValue.startsWith('=') ? 'Carregando...' : templateCell.displayValue,
              format: templateCell?.format ? { ...templateCell.format } : undefined,
            });
          }
        }
      }
    }
  }

  return generated;
}

/**
 * Builds a TSV string from a matrix of cells for OS clipboard paste into Google Sheets / Excel.
 */
export function matrixToTsv(matrix: ClipboardCell[][]): string {
  return matrix.map((row) => row.map((cell) => cell.displayValue ?? cell.rawValue ?? '').join('\t')).join('\n');
}

/**
 * Formats a display value with specified decimal places.
 */
export function formatDisplayNumber(displayValue: string, decimalPlaces?: number | 'auto'): string {
  if (decimalPlaces === undefined || decimalPlaces === 'auto' || !displayValue) {
    return displayValue;
  }
  const num = parseFloat(displayValue);
  if (Number.isNaN(num)) {
    return displayValue;
  }
  return num.toFixed(decimalPlaces);
}
