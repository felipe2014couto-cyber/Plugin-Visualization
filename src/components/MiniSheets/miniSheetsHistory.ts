import {
  MiniSheetsDocument,
  MINISHEETS_DOCUMENT_VERSION,
  DEFAULT_TOTAL_COLS,
  DEFAULT_TOTAL_ROWS,
  deserializeMiniSheets,
  serializeMiniSheets,
} from './miniSheetsDocument';

export interface MiniSheetsHistory {
  past: MiniSheetsDocument[];
  present: MiniSheetsDocument;
  future: MiniSheetsDocument[];
}

export const MINI_SHEETS_HISTORY_LIMIT = 100;

/**
 * Checks if two MiniSheetsDocuments are semantically equal in terms of persistent data:
 * columnCount, rowCount, columnWidths, and cells (rawValue & format).
 */
export function areMiniSheetsDocsEqual(
  docA?: MiniSheetsDocument | null,
  docB?: MiniSheetsDocument | null
): boolean {
  if (docA === docB) {
    return true;
  }
  if (!docA || !docB) {
    return false;
  }

  if (docA.columnCount !== docB.columnCount || docA.rowCount !== docB.rowCount) {
    return false;
  }

  // Compare column widths
  const widthsA = docA.columnWidths ?? {};
  const widthsB = docB.columnWidths ?? {};
  const keysA = Object.keys(widthsA);
  const keysB = Object.keys(widthsB);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const k of keysA) {
    if (widthsA[k] !== widthsB[k]) {
      return false;
    }
  }

  // Compare cells
  const cellsA = docA.cells ?? {};
  const cellsB = docB.cells ?? {};
  const cellKeysA = Object.keys(cellsA);
  const cellKeysB = Object.keys(cellsB);
  if (cellKeysA.length !== cellKeysB.length) {
    return false;
  }

  for (const k of cellKeysA) {
    const cellA = cellsA[k];
    const cellB = cellsB[k];
    if (!cellB) {
      return false;
    }
    const rawA = cellA.rawValue ?? '';
    const rawB = cellB.rawValue ?? '';
    if (rawA !== rawB) {
      return false;
    }

    const fmtA = cellA.format ?? {};
    const fmtB = cellB.format ?? {};
    if (
      fmtA.bold !== fmtB.bold ||
      fmtA.italic !== fmtB.italic ||
      fmtA.textColor !== fmtB.textColor ||
      fmtA.backgroundColor !== fmtB.backgroundColor ||
      fmtA.horizontalAlign !== fmtB.horizontalAlign ||
      fmtA.decimalPlaces !== fmtB.decimalPlaces
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Creates an initial MiniSheetsHistory instance from an optional MiniSheetsDocument.
 */
export function createMiniSheetsHistory(initialDoc?: MiniSheetsDocument): MiniSheetsHistory {
  let presentDoc: MiniSheetsDocument;
  if (initialDoc && typeof initialDoc === 'object' && initialDoc.cells) {
    // Ensure clean serialization snapshot
    const deserialized = deserializeMiniSheets(initialDoc);
    presentDoc = serializeMiniSheets(
      deserialized.cells,
      deserialized.colWidths,
      deserialized.columnCount,
      deserialized.rowCount
    );
  } else {
    presentDoc = {
      version: MINISHEETS_DOCUMENT_VERSION,
      columnCount: DEFAULT_TOTAL_COLS,
      rowCount: DEFAULT_TOTAL_ROWS,
      cells: {},
    };
  }

  return {
    past: [],
    present: presentDoc,
    future: [],
  };
}

/**
 * Commits a new MiniSheetsDocument state to history.
 * If nextDoc is semantically identical to present, history is returned unchanged.
 * Drops the oldest entries when history exceeds MINI_SHEETS_HISTORY_LIMIT (100).
 * Clears future stack.
 */
export function commitMiniSheetsHistory(
  history: MiniSheetsHistory,
  nextDoc: MiniSheetsDocument
): MiniSheetsHistory {
  if (areMiniSheetsDocsEqual(history.present, nextDoc)) {
    return history;
  }

  const newPast = [...history.past, history.present];
  if (newPast.length > MINI_SHEETS_HISTORY_LIMIT) {
    newPast.splice(0, newPast.length - MINI_SHEETS_HISTORY_LIMIT);
  }

  return {
    past: newPast,
    present: nextDoc,
    future: [],
  };
}

/**
 * Undoes the last operation, moving present to future and restoring previous present from past.
 */
export function undoMiniSheetsHistory(history: MiniSheetsHistory): MiniSheetsHistory {
  if (history.past.length === 0) {
    return history;
  }

  const newPast = [...history.past];
  const previousDoc = newPast.pop()!;
  const newFuture = [history.present, ...history.future];

  return {
    past: newPast,
    present: previousDoc,
    future: newFuture,
  };
}

/**
 * Redoes the previously undone operation, moving present to past and restoring next present from future.
 */
export function redoMiniSheetsHistory(history: MiniSheetsHistory): MiniSheetsHistory {
  if (history.future.length === 0) {
    return history;
  }

  const newFuture = [...history.future];
  const nextDoc = newFuture.shift()!;
  const newPast = [...history.past, history.present];
  if (newPast.length > MINI_SHEETS_HISTORY_LIMIT) {
    newPast.splice(0, newPast.length - MINI_SHEETS_HISTORY_LIMIT);
  }

  return {
    past: newPast,
    present: nextDoc,
    future: newFuture,
  };
}

/**
 * Returns true if there is at least one past state to undo.
 */
export function canUndoMiniSheetsHistory(history: MiniSheetsHistory): boolean {
  return history.past.length > 0;
}

/**
 * Returns true if there is at least one future state to redo.
 */
export function canRedoMiniSheetsHistory(history: MiniSheetsHistory): boolean {
  return history.future.length > 0;
}
