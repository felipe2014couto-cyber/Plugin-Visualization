import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, createRectangle, createText, GROUP_TYPE, groupElements, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

beforeAll(() => {
  const w = window as unknown as {
    PointerEvent?: typeof MouseEvent;
    MouseEvent: typeof MouseEvent;
  };
  if (typeof w.PointerEvent !== 'function') {
    w.PointerEvent = class FakePointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
      }
    } as unknown as typeof MouseEvent;
  }
});

describe('DisplayEditor - Lock / Unlock Elements and Groups (Bloquear / Desbloquear)', () => {
  function Harness({ initialDoc }: { initialDoc: DisplayDocument }) {
    const [doc, setDoc] = useState(initialDoc);
    return (
      <div>
        <DisplayEditor document={doc} onChange={setDoc} />
        <pre data-testid="doc-json">{JSON.stringify(doc)}</pre>
      </div>
    );
  }

  function getDoc(): DisplayDocument {
    return JSON.parse(screen.getByTestId('doc-json').textContent ?? '{}');
  }

  it('permite bloquear um elemento pelo menu de contexto, impedindo arrastar e redimensionar', () => {
    const doc = createDisplayDocument({ name: 'Test Lock' });
    const r1 = createRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 60 });
    doc.elements = [r1];

    render(<Harness initialDoc={doc} />);

    const elR1 = screen.getByTestId('display-element-r1');

    // Right-click on r1 -> shows "Bloquear"
    act(() => {
      fireEvent.contextMenu(elR1, { clientX: 60, clientY: 60 });
    });

    expect(screen.getByTestId('display-context-menu')).toBeInTheDocument();
    const lockOption = screen.getByTestId('context-menu-lock');
    expect(lockOption).toHaveTextContent('Bloquear');

    // Click "Bloquear"
    act(() => {
      fireEvent.click(lockOption);
    });

    const lockedDoc = getDoc();
    expect((lockedDoc.elements[0].properties as { locked?: boolean }).locked).toBe(true);

    // Select the locked element -> resize handles must NOT be rendered
    act(() => {
      fireEvent.pointerDown(elR1, { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
    });

    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    expect(screen.queryByTestId('display-resize-handle-tl')).not.toBeInTheDocument();

    // Attempt to drag locked element
    act(() => {
      fireEvent.pointerDown(elR1, { clientX: 60, clientY: 60, pointerId: 2, button: 0 });
      fireEvent.pointerMove(screen.getByTestId('display-surface'), { clientX: 160, clientY: 160, pointerId: 2 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 160, clientY: 160, pointerId: 2, button: 0 });
    });

    // Position must not have changed
    const afterDragDoc = getDoc();
    expect(afterDragDoc.elements[0].x).toBe(50);
    expect(afterDragDoc.elements[0].y).toBe(50);

    // Right-click on locked element -> shows "Desbloquear"
    act(() => {
      fireEvent.contextMenu(elR1, { clientX: 60, clientY: 60 });
    });

    expect(screen.getByTestId('display-context-menu')).toBeInTheDocument();
    const unlockOption = screen.getByTestId('context-menu-unlock');
    expect(unlockOption).toHaveTextContent('Desbloquear');

    // Click "Desbloquear"
    act(() => {
      fireEvent.click(unlockOption);
    });

    const unlockedDoc = getDoc();
    expect((unlockedDoc.elements[0].properties as { locked?: boolean }).locked).toBe(false);

    // Resize handles should be restored
    expect(screen.getByTestId('display-resize-handle-tl')).toBeInTheDocument();
  });

  it('permite bloquear e desbloquear um grupo de elementos agrupados', () => {
    const doc = createDisplayDocument({ name: 'Test Group Lock' });
    const r1 = createRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 60 });
    const t1 = createText({ id: 't1', x: 200, y: 100, width: 80, height: 40 });
    const grouped = groupElements({ ...doc, elements: [r1, t1] }, ['r1', 't1']);
    if (!grouped) throw new Error('Grouping failed');

    render(<Harness initialDoc={grouped.document} />);

    const groupNode = screen.getByTestId(`display-element-${grouped.group.id}`);

    // Right-click on group -> context menu contains both "Desagrupar Símbolos" and "Bloquear"
    act(() => {
      fireEvent.contextMenu(groupNode, { clientX: 60, clientY: 60 });
    });

    expect(screen.getByTestId('context-menu-ungroup')).toBeInTheDocument();
    const lockOption = screen.getByTestId('context-menu-lock');
    expect(lockOption).toBeInTheDocument();

    // Click "Bloquear"
    act(() => {
      fireEvent.click(lockOption);
    });

    const lockedDoc = getDoc();
    expect(lockedDoc.elements[0].type).toBe(GROUP_TYPE);
    expect((lockedDoc.elements[0].properties as { locked?: boolean }).locked).toBe(true);

    // Attempt to drag group
    act(() => {
      fireEvent.pointerDown(groupNode, { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
      fireEvent.pointerMove(screen.getByTestId('display-surface'), { clientX: 200, clientY: 200, pointerId: 1 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 200, clientY: 200, pointerId: 1, button: 0 });
    });

    expect(getDoc().elements[0].x).toBe(grouped.group.x);
    expect(getDoc().elements[0].y).toBe(grouped.group.y);

    // Right-click to unlock
    act(() => {
      fireEvent.contextMenu(groupNode, { clientX: 60, clientY: 60 });
    });

    const unlockOption = screen.getByTestId('context-menu-unlock');
    expect(unlockOption).toBeInTheDocument();

    act(() => {
      fireEvent.click(unlockOption);
    });

    expect((getDoc().elements[0].properties as { locked?: boolean }).locked).toBe(false);
  });
});
