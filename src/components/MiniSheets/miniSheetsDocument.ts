import { CellData } from './MiniSheetsPanel';
import { colIndexToLetter, parseCellAddress } from './miniSheetFormula';
import { CellFormat } from './miniSheetOperations';

export interface SipQueryMetadata {
  sql: string;
  maxRows?: number;
  targetCell: string;
  includeHeaders?: boolean;
  originCoord: { col: number; row: number };
}

export interface MiniSheetCell {
  rawValue?: string;
  format?: CellFormat;
  sipOrigin?: SipQueryMetadata;
  spilledFrom?: string;
}

export interface MiniSheetsDocument {
  version: 1;
  columnCount: number;
  rowCount: number;
  columnWidths?: Record<string, number>;
  cells: Record<string, MiniSheetCell>;
}

export const MINISHEETS_DOCUMENT_VERSION = 1;
export const DEFAULT_TOTAL_COLS = 20;
export const DEFAULT_TOTAL_ROWS = 50;

/**
 * Creates an empty, valid MiniSheetsDocument
 */
export function createEmptyMiniSheetsDocument(
  columnCount = DEFAULT_TOTAL_COLS,
  rowCount = DEFAULT_TOTAL_ROWS
): MiniSheetsDocument {
  return {
    version: MINISHEETS_DOCUMENT_VERSION,
    columnCount,
    rowCount,
    cells: {},
  };
}

/**
 * Serializes the current active sheet state into a clean, portable MiniSheetsDocument.
 * - Stores cells sparsely (only cells with rawValue or format).
 * - Excludes derived spill cells (spilledFrom) so only source formulas are persisted.
 * - Does not save transient runtime UI states (activeCell, selection, clipboard, etc.).
 */
export function serializeMiniSheets(
  cellsMap: Map<string, CellData>,
  colWidths?: Map<number, number>,
  totalCols = DEFAULT_TOTAL_COLS,
  totalRows = DEFAULT_TOTAL_ROWS
): MiniSheetsDocument {
  const cellsRecord: Record<string, MiniSheetCell> = {};

  cellsMap.forEach((cell, key) => {
    // Exclude transient formula spill cells (which have no rawValue of their own and no sipOrigin)
    // Real data cells (including SIP query results, static numbers/strings and manual entries) must always be preserved!
    if (cell.spilledFrom && !cell.sipOrigin && (!cell.rawValue || cell.rawValue.trim() === '')) {
      return;
    }

    const [colStr, rowStr] = key.split(',');
    const colIndex = parseInt(colStr, 10);
    const rowIndex = parseInt(rowStr, 10);

    if (isNaN(colIndex) || isNaN(rowIndex) || colIndex < 0 || rowIndex < 0) {
      return;
    }

    const hasRawValue = Boolean(cell.rawValue !== undefined && cell.rawValue !== null && cell.rawValue !== '');
    const hasDisplayValue = Boolean(cell.displayValue !== undefined && cell.displayValue !== null && cell.displayValue !== '');
    const hasFormat = Boolean(
      cell.format &&
        (cell.format.bold ||
          cell.format.italic ||
          cell.format.textColor ||
          cell.format.backgroundColor ||
          cell.format.horizontalAlign ||
          cell.format.scientific ||
          (cell.format.decimalPlaces !== undefined && cell.format.decimalPlaces !== 'auto'))
    );

    const hasSipOrigin = Boolean(cell.sipOrigin);

    if (hasRawValue || hasDisplayValue || hasFormat || hasSipOrigin) {
      const address = `${colIndexToLetter(colIndex)}${rowIndex + 1}`;
      const savedCell: MiniSheetCell = {};
      if (hasRawValue) {
        savedCell.rawValue = cell.rawValue;
      } else if (hasDisplayValue) {
        savedCell.rawValue = cell.displayValue;
      }
      if (hasFormat) {
        savedCell.format = { ...cell.format };
      }
      if (hasSipOrigin) {
        savedCell.sipOrigin = { ...cell.sipOrigin! };
      }
      if (cell.spilledFrom) {
        savedCell.spilledFrom = cell.spilledFrom;
      }
      cellsRecord[address] = savedCell;
    }
  });

  const doc: MiniSheetsDocument = {
    version: MINISHEETS_DOCUMENT_VERSION,
    columnCount: totalCols,
    rowCount: totalRows,
    cells: cellsRecord,
  };

  if (colWidths && colWidths.size > 0) {
    const widthRecord: Record<string, number> = {};
    colWidths.forEach((width, colIdx) => {
      if (typeof width === 'number' && width > 0 && width !== 100) {
        widthRecord[String(colIdx)] = width;
      }
    });
    if (Object.keys(widthRecord).length > 0) {
      doc.columnWidths = widthRecord;
    }
  }

  return doc;
}

export interface DeserializedMiniSheets {
  cells: Map<string, CellData>;
  colWidths: Map<number, number>;
  columnCount: number;
  rowCount: number;
}

/**
 * Defensively deserializes any input into a robust in-memory Mini-Sheets state.
 * Safely recovers valid cells and discards corrupted or invalid ones.
 */
export function deserializeMiniSheets(rawDoc?: unknown): DeserializedMiniSheets {
  const cellsMap = new Map<string, CellData>();
  const colWidthsMap = new Map<number, number>();

  if (!rawDoc || typeof rawDoc !== 'object') {
    return {
      cells: cellsMap,
      colWidths: colWidthsMap,
      columnCount: DEFAULT_TOTAL_COLS,
      rowCount: DEFAULT_TOTAL_ROWS,
    };
  }

  const doc = rawDoc as Partial<MiniSheetsDocument>;

  const columnCount =
    typeof doc.columnCount === 'number' && doc.columnCount > 0
      ? doc.columnCount
      : DEFAULT_TOTAL_COLS;
  const rowCount =
    typeof doc.rowCount === 'number' && doc.rowCount > 0 ? doc.rowCount : DEFAULT_TOTAL_ROWS;

  // Restore column widths if present
  if (doc.columnWidths && typeof doc.columnWidths === 'object') {
    Object.entries(doc.columnWidths).forEach(([key, val]) => {
      const colIdx = parseInt(key, 10);
      if (!isNaN(colIdx) && typeof val === 'number' && val >= 40) {
        colWidthsMap.set(colIdx, val);
      }
    });
  }

  // Restore cells
  if (doc.cells && typeof doc.cells === 'object') {
    Object.entries(doc.cells).forEach(([address, rawCell]) => {
      if (!rawCell || typeof rawCell !== 'object') {
        return;
      }

      const coord = parseCellAddress(address);
      if (!coord) {
        return;
      }

      const cell = rawCell as MiniSheetCell;
      const rawValue = typeof cell.rawValue === 'string' ? cell.rawValue : '';
      const cellData: CellData = {
        rawValue,
        displayValue: rawValue.startsWith('=') ? 'Carregando...' : rawValue,
      };

      if (cell.format && typeof cell.format === 'object') {
        const cleanFormat: CellFormat = {};
        if (typeof cell.format.bold === 'boolean') cleanFormat.bold = cell.format.bold;
        if (typeof cell.format.italic === 'boolean') cleanFormat.italic = cell.format.italic;
        if (typeof cell.format.textColor === 'string') cleanFormat.textColor = cell.format.textColor;
        if (typeof cell.format.backgroundColor === 'string') cleanFormat.backgroundColor = cell.format.backgroundColor;
        if (typeof cell.format.scientific === 'boolean') cleanFormat.scientific = cell.format.scientific;
        if (['left', 'center', 'right'].includes(cell.format.horizontalAlign as string)) {
          cleanFormat.horizontalAlign = cell.format.horizontalAlign;
        }
        if (
          cell.format.decimalPlaces === 'auto' ||
          (typeof cell.format.decimalPlaces === 'number' && cell.format.decimalPlaces >= 0)
        ) {
          cleanFormat.decimalPlaces = cell.format.decimalPlaces;
        }
        if (Object.keys(cleanFormat).length > 0) {
          cellData.format = cleanFormat;
        }
      }

      if (cell.sipOrigin && typeof cell.sipOrigin === 'object') {
        cellData.sipOrigin = { ...cell.sipOrigin };
      }

      if (cell.spilledFrom && typeof cell.spilledFrom === 'string') {
        cellData.spilledFrom = cell.spilledFrom;
      }

      const key = `${coord.col},${coord.row}`;
      cellsMap.set(key, cellData);
    });
  }

  return {
    cells: cellsMap,
    colWidths: colWidthsMap,
    columnCount,
    rowCount,
  };
}
