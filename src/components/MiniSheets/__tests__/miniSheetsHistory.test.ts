import {
  createMiniSheetsHistory,
  commitMiniSheetsHistory,
  undoMiniSheetsHistory,
  redoMiniSheetsHistory,
  canUndoMiniSheetsHistory,
  canRedoMiniSheetsHistory,
  areMiniSheetsDocsEqual,
  MINI_SHEETS_HISTORY_LIMIT,
} from '../miniSheetsHistory';
import { MiniSheetsDocument } from '../miniSheetsDocument';

describe('miniSheetsHistory', () => {
  const docA: MiniSheetsDocument = {
    version: 1,
    columnCount: 20,
    rowCount: 50,
    cells: {
      A1: { rawValue: 'Motor A' },
    },
  };

  const docB: MiniSheetsDocument = {
    version: 1,
    columnCount: 20,
    rowCount: 50,
    cells: {
      A1: { rawValue: 'Motor A' },
      B2: { rawValue: '=PICurrVal("TAG_A")', format: { bold: true } },
    },
  };

  const docC: MiniSheetsDocument = {
    version: 1,
    columnCount: 20,
    rowCount: 50,
    cells: {
      A1: { rawValue: 'Motor A' },
      B2: { rawValue: '=PICurrVal("TAG_B")', format: { bold: true } },
    },
  };

  it('creates initial history with empty past and future', () => {
    const history = createMiniSheetsHistory(docA);
    expect(canUndoMiniSheetsHistory(history)).toBe(false);
    expect(canRedoMiniSheetsHistory(history)).toBe(false);
    expect(history.past).toHaveLength(0);
    expect(history.future).toHaveLength(0);
    expect(history.present.cells.A1?.rawValue).toBe('Motor A');
  });

  it('commits new state, pushing present to past and clearing future', () => {
    let history = createMiniSheetsHistory(docA);
    history = commitMiniSheetsHistory(history, docB);

    expect(canUndoMiniSheetsHistory(history)).toBe(true);
    expect(canRedoMiniSheetsHistory(history)).toBe(false);
    expect(history.past).toHaveLength(1);
    expect(history.present.cells.B2?.rawValue).toBe('=PICurrVal("TAG_A")');
  });

  it('ignores no-op commits with semantically equal documents', () => {
    let history = createMiniSheetsHistory(docA);
    const sameDocA: MiniSheetsDocument = {
      version: 1,
      columnCount: 20,
      rowCount: 50,
      cells: {
        A1: { rawValue: 'Motor A' },
      },
    };

    const nextHistory = commitMiniSheetsHistory(history, sameDocA);
    expect(nextHistory).toBe(history);
  });

  it('performs undo and redo correctly', () => {
    let history = createMiniSheetsHistory(docA);
    history = commitMiniSheetsHistory(history, docB);
    history = commitMiniSheetsHistory(history, docC);

    expect(history.present.cells.B2?.rawValue).toBe('=PICurrVal("TAG_B")');

    // Undo 1: C -> B
    history = undoMiniSheetsHistory(history);
    expect(history.present.cells.B2?.rawValue).toBe('=PICurrVal("TAG_A")');
    expect(canUndoMiniSheetsHistory(history)).toBe(true);
    expect(canRedoMiniSheetsHistory(history)).toBe(true);

    // Undo 2: B -> A
    history = undoMiniSheetsHistory(history);
    expect(history.present.cells.B2).toBeUndefined();
    expect(history.present.cells.A1?.rawValue).toBe('Motor A');
    expect(canUndoMiniSheetsHistory(history)).toBe(false);
    expect(canRedoMiniSheetsHistory(history)).toBe(true);

    // Redo 1: A -> B
    history = redoMiniSheetsHistory(history);
    expect(history.present.cells.B2?.rawValue).toBe('=PICurrVal("TAG_A")');

    // Redo 2: B -> C
    history = redoMiniSheetsHistory(history);
    expect(history.present.cells.B2?.rawValue).toBe('=PICurrVal("TAG_B")');
    expect(canUndoMiniSheetsHistory(history)).toBe(true);
    expect(canRedoMiniSheetsHistory(history)).toBe(false);
  });

  it('clears future stack when a new commit is made after undo', () => {
    let history = createMiniSheetsHistory(docA);
    history = commitMiniSheetsHistory(history, docB);
    history = undoMiniSheetsHistory(history);

    expect(canRedoMiniSheetsHistory(history)).toBe(true);

    // New commit: docC
    history = commitMiniSheetsHistory(history, docC);
    expect(canRedoMiniSheetsHistory(history)).toBe(false);
    expect(history.future).toHaveLength(0);
    expect(history.present.cells.B2?.rawValue).toBe('=PICurrVal("TAG_B")');
  });

  it('enforces limit of 100 entries in past', () => {
    let history = createMiniSheetsHistory(docA);
    for (let i = 1; i <= 150; i++) {
      const doc: MiniSheetsDocument = {
        version: 1,
        columnCount: 20,
        rowCount: 50,
        cells: {
          A1: { rawValue: `Val ${i}` },
        },
      };
      history = commitMiniSheetsHistory(history, doc);
    }

    expect(history.past).toHaveLength(MINI_SHEETS_HISTORY_LIMIT);
    expect(history.past[0].cells.A1?.rawValue).toBe('Val 50');
    expect(history.present.cells.A1?.rawValue).toBe('Val 150');
  });

  it('correctly compares documents with areMiniSheetsDocsEqual', () => {
    expect(areMiniSheetsDocsEqual(docA, docA)).toBe(true);
    expect(areMiniSheetsDocsEqual(docA, docB)).toBe(false);

    const docWithWidths1: MiniSheetsDocument = {
      version: 1,
      columnCount: 20,
      rowCount: 50,
      columnWidths: { '0': 150 },
      cells: {},
    };
    const docWithWidths2: MiniSheetsDocument = {
      version: 1,
      columnCount: 20,
      rowCount: 50,
      columnWidths: { '0': 150 },
      cells: {},
    };
    const docWithWidths3: MiniSheetsDocument = {
      version: 1,
      columnCount: 20,
      rowCount: 50,
      columnWidths: { '0': 200 },
      cells: {},
    };

    expect(areMiniSheetsDocsEqual(docWithWidths1, docWithWidths2)).toBe(true);
    expect(areMiniSheetsDocsEqual(docWithWidths1, docWithWidths3)).toBe(false);
  });
});
