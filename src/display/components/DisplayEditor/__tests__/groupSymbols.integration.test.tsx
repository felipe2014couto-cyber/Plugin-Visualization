import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, createRectangle, createText, createTrend, GROUP_TYPE, groupElements, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

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

describe('DisplayEditor - Group Symbols (Agrupar Símbolos)', () => {
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

  it('exibe opção "Agrupar Símbolos" ao clicar com botão direito quando há mais de um elemento selecionado', () => {
    const doc = createDisplayDocument({ name: 'Test Group' });
    const r1 = createRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 60 });
    const t1 = createText({ id: 't1', x: 200, y: 100, width: 80, height: 40 });
    doc.elements = [r1, t1];

    render(<Harness initialDoc={doc} />);

    const elR1 = screen.getByTestId('display-element-r1');
    const elT1 = screen.getByTestId('display-element-t1');

    // Select r1
    act(() => {
      fireEvent.pointerDown(elR1, { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
    });

    // Multi-select t1 with Ctrl
    act(() => {
      fireEvent.pointerDown(elT1, { clientX: 210, clientY: 110, pointerId: 2, ctrlKey: true, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 210, clientY: 110, pointerId: 2, ctrlKey: true, button: 0 });
    });

    // Right-click on r1 (part of the multi-selection)
    act(() => {
      fireEvent.contextMenu(elR1, { clientX: 60, clientY: 60 });
    });

    // Expect context menu to appear with "Agrupar Símbolos"
    expect(screen.getByTestId('display-context-menu')).toBeInTheDocument();
    const groupOption = screen.getByTestId('context-menu-group');
    expect(groupOption).toBeInTheDocument();
    expect(groupOption).toHaveTextContent('Agrupar Símbolos');

    // Click "Agrupar Símbolos"
    act(() => {
      fireEvent.click(groupOption);
    });

    // Document elements should now contain 1 group element
    const updatedDoc = getDoc();
    expect(updatedDoc.elements).toHaveLength(1);
    expect(updatedDoc.elements[0].type).toBe(GROUP_TYPE);
    expect((updatedDoc.elements[0].properties as { elements: unknown[] }).elements).toHaveLength(2);
  });

  it('permite desagrupar um grupo através do menu de contexto com "Desagrupar Símbolos"', () => {
    const doc = createDisplayDocument({ name: 'Test Group' });
    const r1 = createRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 60 });
    const t1 = createText({ id: 't1', x: 200, y: 100, width: 80, height: 40 });
    doc.elements = [r1, t1];

    render(<Harness initialDoc={doc} />);

    const elR1 = screen.getByTestId('display-element-r1');
    const elT1 = screen.getByTestId('display-element-t1');

    act(() => {
      fireEvent.pointerDown(elR1, { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
      fireEvent.pointerDown(elT1, { clientX: 210, clientY: 110, pointerId: 2, ctrlKey: true, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 210, clientY: 110, pointerId: 2, ctrlKey: true, button: 0 });
      fireEvent.contextMenu(elR1, { clientX: 60, clientY: 60 });
    });

    act(() => {
      fireEvent.click(screen.getByTestId('context-menu-group'));
    });

    const groupElementId = getDoc().elements[0].id;
    const groupNode = screen.getByTestId(`display-element-${groupElementId}`);

    // Right-click on the group element
    act(() => {
      fireEvent.contextMenu(groupNode, { clientX: 60, clientY: 60 });
    });

    expect(screen.getByTestId('display-context-menu')).toBeInTheDocument();
    const ungroupOption = screen.getByTestId('context-menu-ungroup');
    expect(ungroupOption).toBeInTheDocument();
    expect(ungroupOption).toHaveTextContent('Desagrupar Símbolos');

    // Click "Desagrupar Símbolos"
    act(() => {
      fireEvent.click(ungroupOption);
    });

    const finalDoc = getDoc();
    expect(finalDoc.elements).toHaveLength(2);
    expect(finalDoc.elements.map((el) => el.id)).toEqual(['r1', 't1']);
  });

  it('seleciona todo o grupo ao clicar em QUALQUER um dos elementos filhos agrupados', () => {
    const doc = createDisplayDocument({ name: 'Test Group Selection' });
    const r1 = createRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 60 });
    const t1 = createText({ id: 't1', x: 200, y: 100, width: 80, height: 40 });
    doc.elements = [r1, t1];

    render(<Harness initialDoc={doc} />);

    // Multi-select r1 and t1 and group them via r1
    act(() => {
      fireEvent.pointerDown(screen.getByTestId('display-element-r1'), { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 60, clientY: 60, pointerId: 1, button: 0 });
      fireEvent.pointerDown(screen.getByTestId('display-element-t1'), { clientX: 210, clientY: 110, pointerId: 2, ctrlKey: true, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 210, clientY: 110, pointerId: 2, ctrlKey: true, button: 0 });
      fireEvent.contextMenu(screen.getByTestId('display-element-r1'), { clientX: 60, clientY: 60 });
    });

    act(() => {
      fireEvent.click(screen.getByTestId('context-menu-group'));
    });

    const groupElement = getDoc().elements[0];
    expect(groupElement.type).toBe(GROUP_TYPE);

    // Unselect by clicking canvas background
    act(() => {
      fireEvent.pointerDown(screen.getByTestId('display-surface'), { clientX: 500, clientY: 500, pointerId: 3, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 500, clientY: 500, pointerId: 3, button: 0 });
    });

    // Now click on t1 (the element that was NOT the one right-clicked to group)
    const childT1 = screen.getByTestId('display-element-t1');
    act(() => {
      fireEvent.pointerDown(childT1, { clientX: 210, clientY: 110, pointerId: 4, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 210, clientY: 110, pointerId: 4, button: 0 });
    });

    // The entire group bounding box and resize handles should be selected
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    expect(screen.getByTestId('display-resize-handle-tl')).toBeInTheDocument();
    expect(screen.getByTestId('display-resize-handle-br')).toBeInTheDocument();

    // Right-clicking on child t1 should also open context menu with "Desagrupar Símbolos"
    act(() => {
      fireEvent.contextMenu(childT1, { clientX: 210, clientY: 110 });
    });

    expect(screen.getByTestId('display-context-menu')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-ungroup')).toBeInTheDocument();
  });

  it('carrega os dados do gráfico de tendência normalmente quando agrupado', async () => {
    const doc = createDisplayDocument({ name: 'Test Group Trend' });
    const r1 = createRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 60 });
    const binding = { dataSourceUid: 'ds-1', serverPath: 'pims', pointName: 'SINUSOID' };
    const tr1 = createTrend({ binding, x: 200, y: 100, width: 400, height: 300, id: 'tr1' });
    const grouped = groupElements({ ...doc, elements: [r1, tr1] }, ['r1', 'tr1']);
    if (!grouped) throw new Error('Grouping failed');

    const loadTrendMock = jest.fn().mockResolvedValue({
      'ds-1\u0000pims\u0000SINUSOID': {
        status: 'success',
        series: {
          points: [{ time: 1000, value: 50 }, { time: 2000, value: 75 }],
        },
      },
    });

    render(
      <DisplayEditor
        document={grouped.document}
        loadTrend={loadTrendMock}
      />
    );

    await waitFor(() => {
      expect(loadTrendMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ pointName: 'SINUSOID' })]),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  it('seleciona apenas o elemento filho e abre suas propriedades ao clicar duas vezes nele dentro do grupo', async () => {
    const doc = createDisplayDocument({ name: 'Test Group Double Click' });
    const r1 = createRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 60 });
    const t1 = createText({ id: 't1', x: 200, y: 100, width: 80, height: 40, properties: { text: 'Meu Texto' } });
    const grouped = groupElements({ ...doc, elements: [r1, t1] }, ['r1', 't1']);
    if (!grouped) throw new Error('Grouping failed');

    render(<Harness initialDoc={grouped.document} />);

    const childT1 = screen.getByTestId('text-background-t1');

    // Double click on child text element inside group
    act(() => {
      fireEvent.doubleClick(childT1);
    });

    // Properties panel for text element should open
    expect(screen.getByTestId('text-properties-panel')).toBeInTheDocument();
  });
});
