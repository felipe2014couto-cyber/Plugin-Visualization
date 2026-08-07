import { createDisplayDocument } from '../createDisplayDocument';
import {
  DISPLAY_HISTORY_LIMIT,
  createDisplayHistory,
  hasRedo,
  hasUndo,
  recordDisplayEdit,
  redoDisplayEdit,
  undoDisplayEdit,
} from '../displayHistory';
import { createRectangle } from '../createRectangle';

function documentWithName(name: string) {
  return { ...createDisplayDocument({ name: 'History' }), name };
}

describe('displayHistory', () => {
  it('começa sem Undo/Redo, registra, desfaz e refaz', () => {
    const first = documentWithName('A');
    const second = documentWithName('B');
    let history = createDisplayHistory(first);

    expect(hasUndo(history)).toBe(false);
    expect(hasRedo(history)).toBe(false);
    history = recordDisplayEdit(history, second);
    expect(history.present.name).toBe('B');
    expect(hasUndo(history)).toBe(true);
    history = undoDisplayEdit(history);
    expect(history.present.name).toBe('A');
    expect(hasRedo(history)).toBe(true);
    history = redoDisplayEdit(history);
    expect(history.present.name).toBe('B');
  });

  it('suporta múltiplos Undo/Redo, no-op, branch novo e limite', () => {
    const first = documentWithName('0');
    let history = createDisplayHistory(first);
    history = recordDisplayEdit(history, first);
    expect(history.past).toHaveLength(0);

    for (let index = 1; index <= DISPLAY_HISTORY_LIMIT + 5; index += 1) {
      history = recordDisplayEdit(history, documentWithName(String(index)));
    }
    expect(history.past).toHaveLength(DISPLAY_HISTORY_LIMIT);
    expect(history.past[0].name).toBe('5');

    history = undoDisplayEdit(history);
    history = recordDisplayEdit(history, documentWithName('branch'));
    expect(history.present.name).toBe('branch');
    expect(hasRedo(history)).toBe(false);
  });

  it('preserva ID e snapshot completo de elemento restaurado', () => {
    const first = createDisplayDocument({ name: 'History' });
    const rectangle = createRectangle({ id: 'rectangle-fixed', x: 10, y: 20, width: 30, height: 40 });
    const second = { ...first, elements: [rectangle] };
    let history = createDisplayHistory(first);
    history = recordDisplayEdit(history, second);
    history = undoDisplayEdit(history);
    history = redoDisplayEdit(history);

    expect(history.present.elements[0]).toEqual(rectangle);
    expect(history.present.elements[0].id).toBe('rectangle-fixed');
  });
});
