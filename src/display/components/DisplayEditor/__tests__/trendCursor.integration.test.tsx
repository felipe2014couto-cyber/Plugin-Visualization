import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, createRectangle, createTrend, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import {
  DATA_QUERY_BATCH_WINDOW_MS,
  type LoadTrendSeries,
} from '../../../runtime/trendRuntime';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

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

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
const secondBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'CDT158' };

function makeDocument(twoTrends = false): DisplayDocument {
  const document = createDisplayDocument({ name: 'Cursores' });
  const first = createTrend({ binding, id: 'trend-a', x: 100, y: 100, width: 520, height: 280 });
  document.elements = [first];
  if (twoTrends) {
    document.elements.push(createTrend({ binding: secondBinding, id: 'trend-b', x: 100, y: 420, width: 520, height: 280 }));
  }
  return document;
}

function createLoader(): jest.MockedFunction<LoadTrendSeries> {
  return jest.fn(async (bindings) => Object.fromEntries(bindings.map((selectedBinding) => [
    `${selectedBinding.dataSourceUid}\u0000${selectedBinding.serverPath}\u0000${selectedBinding.pointName}`,
    {
      status: 'success' as const,
      series: {
        pointName: selectedBinding.pointName,
        points: [{ time: 1_000, value: selectedBinding.pointName === 'CDT158' ? 20 : 2 }, { time: 2_000, value: selectedBinding.pointName === 'CDT158' ? 40 : 4 }],
      },
    },
  ])));
}

function Harness({ document, loadTrend }: { document: DisplayDocument; loadTrend: LoadTrendSeries }) {
  const [currentDocument, setCurrentDocument] = useState(document);
  return <DisplayEditor document={currentDocument} onChange={setCurrentDocument} loadTrend={loadTrend} />;
}

function getSurface(): SVGSVGElement {
  return screen.getByTestId('display-surface') as unknown as SVGSVGElement;
}

describe('DisplayEditor - cursores de Trend', () => {
  it('fecha as opções do Trend ao selecionar outro elemento', async () => {
    const document = makeDocument();
    document.elements.push(createRectangle({ id: 'shape-a', x: 680, y: 100, width: 100, height: 100 }));
    render(<Harness document={document} loadTrend={createLoader()} />);
    await waitFor(() => expect(screen.getByTestId('trend-line-trend-a')).toBeInTheDocument());

    fireEvent.contextMenu(screen.getByTestId('display-element-trend-a'));
    expect(screen.getByTestId('trend-properties-panel')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('display-element-shape-a'), { clientX: 720, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 720, clientY: 140, pointerId: 1 });
    await waitFor(() => expect(screen.queryByTestId('trend-properties-panel')).toBeNull());
  });

  it('cria, seleciona, arrasta e remove múltiplos cursores sem nova query', async () => {
    const loadTrend = createLoader();
    render(<Harness document={makeDocument()} loadTrend={loadTrend} />);
    await waitFor(() => expect(screen.getByTestId('trend-line-trend-a')).toBeInTheDocument());
    expect(loadTrend).toHaveBeenCalledTimes(1);

    const plot = screen.getByTestId('trend-plot-trend-a');
    fireEvent.pointerDown(plot, { clientX: 250, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 250, clientY: 180, pointerId: 1 });
    expect(screen.queryByTestId(/^trend-cursor-trend-a-/)).toBeNull();

    fireEvent.click(screen.getByTestId('display-mode-view'));
    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-a'), { clientX: 250, clientY: 180, pointerId: 2 });
    fireEvent.pointerUp(getSurface(), { clientX: 250, clientY: 180, pointerId: 2 });
    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-a'), { clientX: 350, clientY: 180, pointerId: 3 });
    fireEvent.pointerUp(getSurface(), { clientX: 350, clientY: 180, pointerId: 3 });
    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-a'), { clientX: 450, clientY: 180, pointerId: 4 });
    fireEvent.pointerUp(getSurface(), { clientX: 450, clientY: 180, pointerId: 4 });

    expect(screen.getByTestId('trend-cursor-trend-a-cursor-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-2')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-3')).toBeInTheDocument();
    const firstLine = screen.getByTestId('trend-cursor-line-trend-a-cursor-1').getAttribute('x1');

    fireEvent.pointerDown(screen.getByTestId('trend-cursor-hit-trend-a-cursor-1'), { clientX: 250, clientY: 180, pointerId: 5 });
    fireEvent.pointerMove(getSurface(), { clientX: 500, clientY: 180, pointerId: 5 });
    fireEvent.pointerUp(getSurface(), { clientX: 500, clientY: 180, pointerId: 5 });
    expect(screen.getByTestId('trend-cursor-line-trend-a-cursor-1').getAttribute('x1')).not.toBe(firstLine);

    fireEvent.keyDown(getSurface(), { key: 'Delete' });
    expect(screen.queryByTestId('trend-cursor-trend-a-cursor-1')).toBeNull();
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-2')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-3')).toBeInTheDocument();
    expect(loadTrend).toHaveBeenCalledTimes(1);

    fireEvent.doubleClick(screen.getByTestId('trend-cursor-hit-trend-a-cursor-2'));
    expect(screen.queryByTestId('trend-cursor-trend-a-cursor-2')).toBeNull();
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-3')).toBeInTheDocument();
  });

  it('mantém cursor fora do documento, não cria fora do plot e preserva em Visualizar', async () => {
    const loadTrend = createLoader();
    const document = makeDocument();
    const onChange = jest.fn();
    render(<DisplayEditor document={document} onChange={onChange} loadTrend={loadTrend} />);
    await waitFor(() => expect(screen.getByTestId('trend-line-trend-a')).toBeInTheDocument());

    fireEvent.pointerDown(screen.getByTestId('trend-background-trend-a'), { clientX: 110, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 110, clientY: 110, pointerId: 1 });
    expect(screen.queryByTestId(/^trend-cursor-trend-a-/)).toBeNull();

    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-a'), { clientX: 300, clientY: 180, pointerId: 2 });
    fireEvent.pointerUp(getSurface(), { clientX: 300, clientY: 180, pointerId: 2 });
    expect(screen.queryByTestId(/^trend-cursor-trend-a-/)).toBeNull();

    fireEvent.click(screen.getByTestId('display-mode-view'));
    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-a'), { clientX: 300, clientY: 180, pointerId: 3 });
    fireEvent.pointerUp(getSurface(), { clientX: 300, clientY: 180, pointerId: 3 });
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-1')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(JSON.stringify(document)).not.toContain('cursor-1');

    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-a'), { clientX: 400, clientY: 180, pointerId: 4 });
    fireEvent.pointerUp(getSurface(), { clientX: 400, clientY: 180, pointerId: 4 });
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-2')).toBeInTheDocument();
    expect(loadTrend).toHaveBeenCalledTimes(1);
  });

  it('sincroniza cursores entre Trends e os limpa ao entrar em modo de edição', async () => {
    const loadTrend = createLoader();
    render(<Harness document={makeDocument(true)} loadTrend={loadTrend} />);
    await waitFor(() => expect(screen.getByTestId('trend-line-trend-b')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('display-mode-view'));
    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-a'), { clientX: 300, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 300, clientY: 180, pointerId: 1 });
    expect(screen.getByTestId('trend-cursor-trend-b-cursor-1')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('trend-plot-trend-b'), { clientX: 400, clientY: 500, pointerId: 2 });
    fireEvent.pointerUp(getSurface(), { clientX: 400, clientY: 500, pointerId: 2 });
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-2')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cursor-trend-b-cursor-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cursor-trend-b-cursor-2')).toBeInTheDocument();
    const beforeDragA = screen.getByTestId('trend-cursor-line-trend-a-cursor-1').getAttribute('x1');
    const beforeDragB = screen.getByTestId('trend-cursor-line-trend-b-cursor-1').getAttribute('x1');
    fireEvent.pointerDown(screen.getByTestId('trend-cursor-hit-trend-a-cursor-1'), { clientX: 300, clientY: 180, pointerId: 3 });
    fireEvent.pointerMove(getSurface(), { clientX: 500, clientY: 180, pointerId: 3 });
    fireEvent.pointerUp(getSurface(), { clientX: 500, clientY: 180, pointerId: 3 });
    expect(screen.getByTestId('trend-cursor-line-trend-a-cursor-1').getAttribute('x1')).not.toBe(beforeDragA);
    expect(screen.getByTestId('trend-cursor-line-trend-b-cursor-1').getAttribute('x1')).not.toBe(beforeDragB);
    fireEvent.click(screen.getByTestId('display-mode-edit'));
    expect(screen.queryByTestId(/^trend-cursor-/)).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('trend-background-trend-a'), { clientX: 110, clientY: 110, pointerId: 4 });
    fireEvent.pointerUp(getSurface(), { clientX: 110, clientY: 110, pointerId: 4 });
    fireEvent.pointerDown(screen.getByTestId('display-resize-handle-mr'), { clientX: 620, clientY: 240, pointerId: 5 });
    fireEvent.pointerMove(getSurface(), { clientX: 720, clientY: 240, pointerId: 5 });
    fireEvent.pointerUp(getSurface(), { clientX: 720, clientY: 240, pointerId: 5 });

    fireEvent.click(screen.getByTestId('display-mode-view'));
    expect(screen.queryByTestId(/^trend-cursor-/)).toBeNull();
    expect(loadTrend).toHaveBeenCalledTimes(1);
  });

  it('preserva cursor e id durante refresh, sem reiniciar o scheduler por interação', async () => {
    jest.useFakeTimers();
    let cycle = 0;
    const loadTrend = jest.fn<ReturnType<LoadTrendSeries>, Parameters<LoadTrendSeries>>(async (bindings) => {
      cycle += 1;
      if (cycle === 3) {
        return Object.fromEntries(bindings.map((selectedBinding) => [
          `${selectedBinding.dataSourceUid}\u0000${selectedBinding.serverPath}\u0000${selectedBinding.pointName}`,
          { status: 'error' as const, error: new Error('falha transitória') },
        ]));
      }
      return Object.fromEntries(bindings.map((selectedBinding) => [
        `${selectedBinding.dataSourceUid}\u0000${selectedBinding.serverPath}\u0000${selectedBinding.pointName}`,
        {
          status: 'success' as const,
          series: { pointName: selectedBinding.pointName, points: [{ time: 1_000, value: cycle }, { time: 2_000, value: cycle * 2 }] },
        },
      ]));
    });
    render(<Harness document={makeDocument()} loadTrend={loadTrend} />);
    await act(async () => {
      jest.advanceTimersByTime(DATA_QUERY_BATCH_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('display-mode-view'));
    const plot = screen.getByTestId('trend-plot-trend-a');
    fireEvent.pointerDown(plot, { clientX: 300, clientY: 180, pointerId: 1 });
    fireEvent.pointerUp(getSurface(), { clientX: 300, clientY: 180, pointerId: 1 });
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-1')).toBeInTheDocument();
    const firstLabel = screen.getByTestId('trend-cursor-label-trend-a-cursor-1').textContent;

    await act(async () => {
      jest.advanceTimersByTime(5_000 + DATA_QUERY_BATCH_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadTrend).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-cursor-label-trend-a-cursor-1')).not.toHaveTextContent(firstLabel ?? '');

    await act(async () => {
      jest.advanceTimersByTime(5_000 + DATA_QUERY_BATCH_WINDOW_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadTrend).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('trend-cursor-trend-a-cursor-1')).toBeInTheDocument();
    jest.useRealTimers();
  });
});
