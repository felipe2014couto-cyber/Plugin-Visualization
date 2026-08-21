import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, createTrend, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointSearchResult } from '../../../../pi/piDataSource';
import type { LoadTrendSeries } from '../../../runtime/trendRuntime';

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

const selectedPiPoint: PiPointSearchResult = {
  name: 'SINUSOID',
  path: '\\\\pims\\SINUSOID',
  webId: 'point-webid',
  dataSourceUid: 'resolved-datasource',
};

function Harness({
  loadTrend,
  loadRecordedTrend,
  initial,
  point = selectedPiPoint,
  onDocumentChange,
}: {
  loadTrend: LoadTrendSeries;
  loadRecordedTrend?: LoadTrendSeries;
  initial?: DisplayDocument;
  point?: PiPointSearchResult;
  onDocumentChange?: (document: DisplayDocument) => void;
}) {
  const [document, setDocument] = useState<DisplayDocument>(() => initial ?? createDisplayDocument({ name: 'Trend Display' }));
  return (
    <DisplayEditor
      document={document}
      onChange={(nextDocument) => {
        setDocument(nextDocument);
        onDocumentChange?.(nextDocument);
      }}
      selectedPiPoint={point}
      loadTrend={loadTrend}
      loadRecordedTrend={loadRecordedTrend}
    />
  );
}

describe('DisplayEditor - Trend', () => {
  it('adiciona a tag selecionada à Trend selecionada pelo botão dedicado', () => {
    const initial = createDisplayDocument({ name: 'Trend com séries' });
    initial.elements = [createTrend({
      id: 'existing-trend',
      binding: { dataSourceUid: 'resolved-datasource', serverPath: 'pims', pointName: 'EXISTING' },
      surface: initial.surface,
      x: 100,
      y: 100,
    })];
    const onDocumentChange = jest.fn();
    const secondPoint = { ...selectedPiPoint, name: 'SECOND', path: '\\pims\\SECOND' };
    render(<Harness loadTrend={jest.fn(async () => ({}))} initial={initial} point={secondPoint} onDocumentChange={onDocumentChange} />);

    const trend = screen.getByTestId('display-element-existing-trend');
    fireEvent.pointerDown(trend, { clientX: 200, clientY: 200, pointerId: 1, button: 0 });
    fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 200, clientY: 200, pointerId: 1 });

    const addButton = screen.getByTestId('display-add-tag-to-selected-trend');
    expect(addButton).not.toBeDisabled();
    fireEvent.click(addButton);

    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      elements: [expect.objectContaining({
        id: 'existing-trend',
        properties: expect.objectContaining({
          series: expect.arrayContaining([
            expect.objectContaining({ binding: expect.objectContaining({ pointName: 'EXISTING' }) }),
            expect.objectContaining({ binding: expect.objectContaining({ pointName: 'SECOND' }) }),
          ]),
        }),
      })],
    }));
    expect(screen.getAllByTestId(/^display-element-/)).toHaveLength(1);
  });

  it('cria Trend somente após seleção explícita e preserva o gráfico em Visualizar', async () => {
    const loadTrend = jest.fn(async (bindings) => ({
      'resolved-datasource\u0000pims\u0000SINUSOID': {
        status: 'success' as const,
        series: {
          pointName: bindings[0].pointName,
          points: [{ time: Date.parse('2026-08-06T12:00:00.000Z'), value: 10 }, { time: Date.parse('2026-08-06T12:30:00.000Z'), value: 12 }],
        },
      },
    }));
    render(<Harness loadTrend={loadTrend} />);

    const insert = screen.getByTestId('display-insert-trend');
    expect(insert).not.toBeDisabled();
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();
    fireEvent.click(insert);

    const trend = screen.getByTestId(/^display-element-/);
    expect(trend).toHaveAttribute('data-element-type', 'trend');
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('trend-line-' + trend.getAttribute('data-element-id'))).toBeInTheDocument());
    expect(loadTrend).toHaveBeenCalledWith([{
      dataSourceUid: 'resolved-datasource',
      serverPath: 'pims',
      pointName: 'SINUSOID',
      webId: 'point-webid',
    }], expect.any(Function), { maxDataPoints: expect.any(Number) });

    expect(trend).toHaveStyle({ cursor: 'move' });
    const backgroundBeforeDrag = screen.getByTestId(`trend-background-${trend.getAttribute('data-element-id')}`);
    const xBeforeDrag = backgroundBeforeDrag.getAttribute('x');
    fireEvent.pointerDown(screen.getByTestId(`trend-plot-${trend.getAttribute('data-element-id')}`), { clientX: 300, clientY: 180, pointerId: 7 });
    fireEvent.pointerMove(screen.getByTestId('display-surface'), { clientX: 200, clientY: 120, pointerId: 7 });
    fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 200, clientY: 120, pointerId: 7 });
    expect(screen.getByTestId(`trend-background-${trend.getAttribute('data-element-id')}`).getAttribute('x')).not.toBe(xBeforeDrag);

    fireEvent.click(screen.getByTestId('display-mode-view'));
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();
    expect(screen.getByTestId('trend-line-' + trend.getAttribute('data-element-id'))).toBeInTheDocument();
    expect(screen.getByTestId(`display-element-${trend.getAttribute('data-element-id')}`)).toHaveStyle({ cursor: 'default' });
  });

  it('abre o pop-up com valores gravados no duplo clique somente em Visualizar', async () => {
    const resultKey = 'resolved-datasource\u0000pims\u0000SINUSOID';
    const loadTrend = jest.fn(async () => ({
      [resultKey]: {
        status: 'success' as const,
        series: { pointName: 'SINUSOID', points: [
          { time: 1, value: 0 }, { time: 2, value: 5 }, { time: 3, value: 0 },
        ] },
      },
    }));
    const loadRecordedTrend = jest.fn(async () => ({
      [resultKey]: {
        status: 'success' as const,
        series: {
          pointName: 'SINUSOID',
          points: [],
          states: [{ time: 1, value: 'Off' }, { time: 2, value: 'On' }],
        },
      },
    }));
    render(<Harness loadTrend={loadTrend} loadRecordedTrend={loadRecordedTrend} />);
    fireEvent.click(screen.getByTestId('display-insert-trend'));
    const trend = screen.getByTestId(/^display-element-/);
    const elementId = trend.getAttribute('data-element-id');
    await screen.findByTestId(`trend-line-${elementId}`);

    fireEvent.doubleClick(trend);
    expect(loadRecordedTrend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('display-mode-view'));
    fireEvent.doubleClick(trend);

    await waitFor(() => expect(loadRecordedTrend).toHaveBeenCalledWith([{
      dataSourceUid: 'resolved-datasource',
      serverPath: 'pims',
      pointName: 'SINUSOID',
      webId: 'point-webid',
    }], expect.any(Function), { maxDataPoints: 500 }));
    expect(screen.getByTestId('trend-popup')).toBeInTheDocument();
    expect(screen.getByTestId('trend-popup')).toHaveTextContent('Pop-up de tendência');
    expect(await screen.findByTestId('trend-popup-state-line-0')).toBeInTheDocument();
    expect(screen.getByTestId('trend-popup')).toHaveTextContent('On');

    expect(screen.getByTestId('trend-popup-cursor-mode')).toHaveAttribute('aria-pressed', 'true');
    const popupSvg = screen.getByLabelText('Trend detalhada') as unknown as SVGSVGElement;
    jest.spyOn(popupSvg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1600, bottom: 800, width: 1600, height: 800, toJSON: () => ({}) });
    fireEvent.pointerDown(screen.getByTestId('trend-popup-cursor-plot'), { clientX: 400, clientY: 300, pointerId: 10 });
    fireEvent.pointerUp(screen.getByTestId('trend-popup-cursor-plot'), { clientX: 400, clientY: 300, pointerId: 10 });
    expect(screen.getByTestId('trend-popup-cursor-popup-cursor-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-popup-cursor-reading-popup-cursor-1-0')).toHaveTextContent('SINUSOID');
    const cursorLine = screen.getByTestId('trend-popup-cursor-line-popup-cursor-1');
    const cursorX = cursorLine.getAttribute('x1');
    const cursorHit = screen.getByTestId('trend-popup-cursor-hit-popup-cursor-1');
    fireEvent.pointerDown(cursorHit, { clientX: 400, clientY: 300, pointerId: 11 });
    fireEvent.pointerMove(cursorHit, { clientX: 1000, clientY: 300, pointerId: 11 });
    fireEvent.pointerUp(cursorHit, { clientX: 1000, clientY: 300, pointerId: 11 });
    expect(screen.getByTestId('trend-popup-cursor-line-popup-cursor-1').getAttribute('x1')).not.toBe(cursorX);
    fireEvent.doubleClick(screen.getByTestId('trend-popup-cursor-hit-popup-cursor-1'));
    expect(screen.queryByTestId('trend-popup-cursor-popup-cursor-1')).toBeNull();
    fireEvent.click(screen.getByTestId('trend-popup-close'));
    expect(screen.queryByTestId('trend-popup')).toBeNull();
  });
});
