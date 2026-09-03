import type { DisplayDocument } from './displayDocument';

export const DISPLAY_HISTORY_LIMIT = 100;

export interface DisplayHistoryState {
  past: DisplayDocument[];
  present: DisplayDocument;
  future: DisplayDocument[];
}

export function createDisplayHistory(document: DisplayDocument): DisplayHistoryState {
  return { past: [], present: document, future: [] };
}

export function recordDisplayEdit(
  history: DisplayHistoryState,
  nextDocument: DisplayDocument,
): DisplayHistoryState {
  if (areDisplayDocumentsEqual(history.present, nextDocument)) {
    return history;
  }
  const past = [...history.past, cloneDisplayDocument(history.present)];
  return {
    past: past.slice(-DISPLAY_HISTORY_LIMIT),
    present: nextDocument,
    future: [],
  };
}

export function undoDisplayEdit(history: DisplayHistoryState): DisplayHistoryState {
  const previous = history.past[history.past.length - 1];
  if (!previous) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [cloneDisplayDocument(history.present), ...history.future],
  };
}

export function redoDisplayEdit(history: DisplayHistoryState): DisplayHistoryState {
  const next = history.future[0];
  if (!next) {
    return history;
  }
  return {
    past: [...history.past, cloneDisplayDocument(history.present)].slice(-DISPLAY_HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
  };
}

export function hasUndo(history: DisplayHistoryState): boolean {
  return history.past.length > 0;
}

export function hasRedo(history: DisplayHistoryState): boolean {
  return history.future.length > 0;
}

export function areDisplayDocumentsEqual(left: DisplayDocument, right: DisplayDocument): boolean {
  if (left === right) {
    return true;
  }
  return JSON.stringify(left, (_, value) => (value === undefined ? null : value))
    === JSON.stringify(right, (_, value) => (value === undefined ? null : value));
}

function cloneDisplayDocument(document: DisplayDocument): DisplayDocument {
  return JSON.parse(JSON.stringify(document)) as DisplayDocument;
}
