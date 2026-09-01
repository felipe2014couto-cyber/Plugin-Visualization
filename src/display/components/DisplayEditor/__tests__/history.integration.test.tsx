import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { appendTrend, createDisplayDocument, createTrend, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointSearchResult } from '../../../../pi/piDataSource';
import type { LoadTrendSeries } from '../../../runtime/trendRuntime';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

beforeAll(() => {
  const currentWindow = window as unknown as { PointerEvent?: typeof MouseEvent; MouseEvent: typeof MouseEvent };
  if (typeof currentWindow.PointerEvent !== 'function') {
    currentWindow.PointerEvent = class FakePointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    } as unknown as typeof MouseEvent;
  }
});

const selectedPiPoint: PiPointSearchResult = {
  name: 'SINUSOID',
  path: '\\\\pims\\SINUSOID',
  webId: 'point-webid',
  dataSourceUid: 'ds',
};

function Harness({ initial, loadTrend }: { initial?: DisplayDocument; loadTrend?: LoadTrendSeries }) {
  const [document, setDocument] = useState<DisplayDocument>(() => initial ?? createDisplayDocument({ name: 'History' }));
  return (
    <DisplayEditor
      document={document}
      onChange={setDocument}
      selectedPiPoint={selectedPiPoint}
      loadTrend={loadTrend}
    />
  );
}

function CloningParentHarness() {
  const [document, setDocument] = useState<DisplayDocument>(() => createDisplayDocument({ name: 'Cloned history' }));
  return <DisplayEditor document={document} onChange={(next) => setDocument({ ...next, elements: [...next.elements] })} />;
}

function NormalizingParentHarness() {
  const [document, setDocument] = useState<DisplayDocument>(() => createDisplayDocument({ name: 'Normalized history' }));
  return <DisplayEditor document={document} onChange={(next) => setDocument({ ...next, name: next.name.trim() })} />;
}

function getSurface(): SVGSVGElement {
  return screen.getByTestId('display-surface') as unknown as SVGSVGElement;
}

describe('DisplayEditor - histórico de edição', () => {
  it('preserva vários Undo quando o componente pai recria o documento', () => {
    render(<CloningParentHarness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    expect(screen.getAllByTestId(/^display-element-/)).toHaveLength(2);

    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getAllByTestId(/^display-element-/)).toHaveLength(1);
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();
  });

  it('preserva vários Undo quando o host normaliza o documento após cada edição', () => {
    render(<NormalizingParentHarness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getAllByTestId(/^display-element-/)).toHaveLength(1);
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();
  });

  it('executa múltiplos atalhos globais depois que Undo substitui o elemento focado', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getAllByTestId(/^display-element-/)).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(screen.getAllByTestId(/^display-element-/)).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(screen.getAllByTestId(/^display-element-/)).toHaveLength(2);
  });

  it('cria Rectangle, desfaz e refaz preservando o ID', () => {
    render(<Harness />);
    expect(screen.getByTestId('display-undo')).toBeDisabled();
    expect(screen.getByTestId('display-redo')).toBeDisabled();

    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    const rectangle = screen.getByTestId(/^display-element-/);
    const id = rectangle.getAttribute('data-element-id');
    expect(screen.getByTestId('display-undo')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();
    expect(screen.getByTestId('display-redo')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId(`display-element-${id}`)).toBeInTheDocument();
  });

  it('cria Text, desfaz e refaz preservando propriedades e ID', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-text'));
    const text = screen.getByTestId(/^display-element-/);
    const id = text.getAttribute('data-element-id');
    expect(screen.getByTestId('text-properties-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.queryByTestId(`display-element-${id}`)).toBeNull();
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId(`display-element-${id}`)).toBeInTheDocument();
  });

  it('não mostra o painel de Link genérico ao alternar para o modo Trend', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-trend'));
    expect(screen.queryByTestId('link-properties-panel')).toBeNull();
  });

  it('agrupa muitos pointermove de drag em uma operação e restaura/repete geometria', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    const rectangle = screen.getByTestId(/^display-element-/);
    const originalX = rectangle.getAttribute('x');
    const originalY = rectangle.getAttribute('y');

    fireEvent.pointerDown(rectangle, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(getSurface(), { clientX: 420, clientY: 310, pointerId: 1 });
    fireEvent.pointerMove(getSurface(), { clientX: 460, clientY: 330, pointerId: 1 });
    fireEvent.pointerMove(getSurface(), { clientX: 500, clientY: 350, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 500, clientY: 350, pointerId: 1 });
    const finalX = screen.getByTestId(/^display-element-/).getAttribute('x');
    const finalY = screen.getByTestId(/^display-element-/).getAttribute('y');
    expect(finalX).not.toBe(originalX);
    expect(finalY).not.toBe(originalY);

    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId(/^display-element-/)).toHaveAttribute('x', originalX);
    expect(screen.getByTestId(/^display-element-/)).toHaveAttribute('y', originalY);
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId(/^display-element-/)).toHaveAttribute('x', finalX);
    expect(screen.getByTestId(/^display-element-/)).toHaveAttribute('y', finalY);
  });

  it('resize sem movimento não consome histórico e resize real é uma operação', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    const rectangle = screen.getByTestId(/^display-element-/);
    fireEvent.pointerDown(rectangle, { clientX: 400, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 400, clientY: 300, pointerId: 1 });
    const handle = screen.getByTestId('display-resize-handle-mr');
    const originalWidth = rectangle.getAttribute('width');

    fireEvent.pointerDown(handle, { clientX: 600, clientY: 300, pointerId: 2 });
    fireEvent.pointerUp(getSurface(), { clientX: 600, clientY: 300, pointerId: 2 });
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();

    fireEvent.click(screen.getByTestId('display-redo'));
    const restoredRectangle = screen.getByTestId(/^display-element-/);
    fireEvent.pointerDown(restoredRectangle, { clientX: 400, clientY: 300, pointerId: 5 });
    fireEvent.pointerUp(getSurface(), { clientX: 400, clientY: 300, pointerId: 5 });
    fireEvent.pointerDown(screen.getByTestId('display-resize-handle-mr'), { clientX: 600, clientY: 300, pointerId: 3 });
    fireEvent.pointerMove(getSurface(), { clientX: 650, clientY: 300, pointerId: 3 });
    fireEvent.pointerMove(getSurface(), { clientX: 700, clientY: 300, pointerId: 3 });
    fireEvent.pointerUp(getSurface(), { clientX: 700, clientY: 300, pointerId: 3 });
    const resizedWidth = restoredRectangle.getAttribute('width');
    expect(resizedWidth).not.toBe(originalWidth);
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId(/^display-element-/)).toHaveAttribute('width', originalWidth);
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId(/^display-element-/)).toHaveAttribute('width', resizedWidth);
  });

  it('exclui elemento e restaura com Undo/Redo, limpando seleção inválida', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    const id = screen.getByTestId(/^display-element-/).getAttribute('data-element-id');
    fireEvent.keyDown(getSurface(), { key: 'Delete' });
    expect(screen.queryByTestId(`display-element-${id}`)).toBeNull();
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();

    fireEvent.keyDown(getSurface(), { key: 'z', ctrlKey: true });
    expect(screen.getByTestId(`display-element-${id}`)).toBeInTheDocument();
    fireEvent.keyDown(getSurface(), { key: 'y', ctrlKey: true });
    expect(screen.queryByTestId(`display-element-${id}`)).toBeNull();
    fireEvent.keyDown(getSurface(), { key: 'z', ctrlKey: true });
    expect(screen.getByTestId(`display-element-${id}`)).toBeInTheDocument();
    fireEvent.keyDown(getSurface(), { key: 'z', ctrlKey: true, shiftKey: true });
    expect(screen.queryByTestId(`display-element-${id}`)).toBeNull();
  });

  it('copia e cola os elementos selecionados com novos IDs', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    const original = screen.getByTestId(/^display-element-/);
    const originalId = original.getAttribute('data-element-id');
    const originalX = Number(original.getAttribute('x'));
    const originalY = Number(original.getAttribute('y'));

    fireEvent.keyDown(getSurface(), { key: 'c', ctrlKey: true });
    fireEvent.keyDown(getSurface(), { key: 'v', ctrlKey: true });

    const elements = screen.getAllByTestId(/^display-element-/);
    expect(elements).toHaveLength(2);
    const pasted = elements.find((element) => element.getAttribute('data-element-id') !== originalId);
    expect(pasted).toBeDefined();
    expect(Number(pasted?.getAttribute('x'))).toBe(originalX + 16);
    expect(Number(pasted?.getAttribute('y'))).toBe(originalY + 16);
  });

  it('nova edição depois de Undo invalida Redo e input não aciona histórico do editor', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.keyDown(getSurface(), { key: 'z', ctrlKey: true });
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    expect(screen.getByTestId('display-redo')).toBeDisabled();

    const input = document.createElement('input');
    screen.getByTestId('display-editor').appendChild(input);
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('display-undo')).not.toBeDisabled();
    input.remove();
  });

  it('criar e remover cursor não entra no histórico do Trend', async () => {
    const loadTrend: LoadTrendSeries = async (bindings) => Object.fromEntries(bindings.map((binding) => [
      `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
      { status: 'success' as const, series: { pointName: binding.pointName, points: [{ time: 1_000, value: 1 }, { time: 2_000, value: 2 }] } },
    ]));
    const initial = appendTrend(createDisplayDocument(), createTrend({
      id: 'trend-1',
      binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' },
    }));
    render(<Harness initial={initial} loadTrend={loadTrend} />);
    await waitFor(() => expect(screen.getByTestId('trend-plot-trend-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('display-mode-view'));
    const plot = screen.getByTestId('trend-plot-trend-1');
    fireEvent.pointerDown(plot, { clientX: 300, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 300, clientY: 180, pointerId: 1 });
    fireEvent.keyDown(getSurface(), { key: 'Delete' });
    expect(screen.queryByTestId(/^trend-cursor-/)).toBeNull();

    fireEvent.click(screen.getByTestId('display-mode-edit'));
    expect(screen.getByTestId('display-undo')).toBeDisabled();
  });
});
