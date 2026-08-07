import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import {
  appendDisplayElement,
  createDisplayDocument,
  createRectangle,
  type PiPointBinding,
  type DisplayDocument,
} from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointSearchResult, PiPointValue } from '../../../../pi/piDataSource';

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

function makeDocument(): DisplayDocument {
  const document = createDisplayDocument({ name: 'Test Display' });
  document.surface.width = 800;
  document.surface.height = 600;
  return document;
}

function Harness({
  initial,
  selectedPiPoint,
  loadValue,
}: {
  initial: DisplayDocument;
  selectedPiPoint?: PiPointSearchResult | null;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
}) {
  const [document, setDocument] = useState(initial);
  return (
    <DisplayEditor
      document={document}
      onChange={setDocument}
      selectedPiPoint={selectedPiPoint}
      loadValue={loadValue}
    />
  );
}

function getSurface(): SVGSVGElement {
  return screen.getByTestId('display-surface') as unknown as SVGSVGElement;
}

function getRectangleElements(): HTMLElement[] {
  return screen.getAllByTestId(/^display-element-/);
}

describe('DisplayEditor - inserção de Rectangle', () => {
  it('inicia em Editar e expõe a toolbar de edição', () => {
    render(<Harness initial={makeDocument()} />);

    expect(screen.getByTestId('display-mode-edit')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('display-mode-view')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('display-editor-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('display-insert-rectangle')).toBeInTheDocument();
  });

  it('insere um Rectangle real, renderiza suas propriedades e seleciona o novo elemento', () => {
    render(<Harness initial={makeDocument()} />);

    expect(screen.queryByTestId(/^display-element-/)).toBeNull();

    fireEvent.click(screen.getByTestId('display-insert-rectangle'));

    const [rectangle] = getRectangleElements();
    expect(rectangle.getAttribute('data-element-type')).toBe('rectangle');
    expect(rectangle.getAttribute('fill')).toBe('rgba(110, 159, 255, 0.15)');
    expect(rectangle.getAttribute('stroke')).toBe('#6e9fff');
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^display-resize-handle-/)).toHaveLength(8);
  });

  it('permite inserir dois Rectangles com IDs distintos', () => {
    render(<Harness initial={makeDocument()} />);

    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));

    const rectangles = getRectangleElements();
    const ids = rectangles.map((rectangle) => rectangle.getAttribute('data-element-id'));
    expect(rectangles).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('integra Rectangle com seleção, drag, resize e desseleção genéricos', () => {
    render(<Harness initial={makeDocument()} />);

    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    const rectangle = getRectangleElements()[0];
    const startX = Number(rectangle.getAttribute('x'));
    const startY = Number(rectangle.getAttribute('y'));

    act(() => {
      fireEvent.pointerDown(rectangle, { clientX: startX + 40, clientY: startY + 40, pointerId: 1 });
      fireEvent.pointerMove(getSurface(), {
        clientX: startX + 80,
        clientY: startY + 70,
        pointerId: 1,
      });
      fireEvent.pointerUp(getSurface(), { clientX: startX + 80, clientY: startY + 70, pointerId: 1 });
    });

    expect(rectangle.getAttribute('x')).toBe(String(startX + 40));
    expect(rectangle.getAttribute('y')).toBe(String(startY + 30));

    const handle = screen.getByTestId('display-resize-handle-mr');
    const width = Number(rectangle.getAttribute('width'));
    act(() => {
      fireEvent.pointerDown(handle, { clientX: startX + 40 + width, clientY: startY + 30 + 70, pointerId: 2 });
      fireEvent.pointerMove(getSurface(), {
        clientX: startX + 40 + width + 50,
        clientY: startY + 30 + 70,
        pointerId: 2,
      });
      fireEvent.pointerUp(getSurface(), {
        clientX: startX + 40 + width + 50,
        clientY: startY + 30 + 70,
        pointerId: 2,
      });
    });

    expect(rectangle.getAttribute('width')).toBe(String(width + 50));

    act(() => {
      fireEvent.pointerDown(screen.getByTestId('display-surface-background'), {
        clientX: 20,
        clientY: 20,
        pointerId: 3,
      });
      fireEvent.pointerUp(getSurface(), { clientX: 20, clientY: 20, pointerId: 3 });
    });
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();
  });

  it('não altera outro Rectangle ao mover um elemento', () => {
    const document = makeDocument();
    const first = createRectangle({ x: 100, y: 100, surface: document.surface });
    const second = createRectangle({ x: 400, y: 300, surface: document.surface });
    const initial = appendDisplayElement(appendDisplayElement(document, first), second);
    render(<Harness initial={initial} />);

    const firstElement = screen.getByTestId(`display-element-${first.id}`);
    const secondElement = screen.getByTestId(`display-element-${second.id}`);
    act(() => {
      fireEvent.pointerDown(firstElement, { clientX: 120, clientY: 120, pointerId: 1 });
      fireEvent.pointerMove(getSurface(), { clientX: 150, clientY: 160, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: 150, clientY: 160, pointerId: 1 });
    });

    expect(firstElement.getAttribute('x')).toBe('130');
    expect(firstElement.getAttribute('y')).toBe('140');
    expect(secondElement.getAttribute('x')).toBe('400');
    expect(secondElement.getAttribute('y')).toBe('300');
  });

  it('alterna para visualização sem mutar o documento ou permitir edição', () => {
    const document = makeDocument();
    const rectangle = createRectangle({ x: 100, y: 100, surface: document.surface });
    const initial = appendDisplayElement(document, rectangle);
    const beforeView = JSON.parse(JSON.stringify(initial));
    render(<Harness initial={initial} />);

    const element = screen.getByTestId(`display-element-${rectangle.id}`);
    fireEvent.pointerDown(element, { clientX: 120, clientY: 120, pointerId: 1 });
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('display-mode-view'));

    expect(screen.getByTestId(`display-element-${rectangle.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();
    expect(screen.queryByTestId('display-resize-handle-mr')).toBeNull();
    expect(screen.queryByTestId('display-editor-toolbar')).toBeNull();
    expect(screen.getByTestId('display-mode-view')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.pointerDown(element, { clientX: 120, clientY: 120, pointerId: 2 });
    fireEvent.pointerMove(getSurface(), { clientX: 180, clientY: 180, pointerId: 2 });
    fireEvent.pointerUp(getSurface(), { clientX: 180, clientY: 180, pointerId: 2 });
    fireEvent.pointerDown(getSurface(), { clientX: 340, clientY: 170, pointerId: 3 });
    fireEvent.pointerMove(getSurface(), { clientX: 390, clientY: 170, pointerId: 3 });
    fireEvent.pointerUp(getSurface(), { clientX: 390, clientY: 170, pointerId: 3 });

    expect(JSON.parse(JSON.stringify(initial))).toEqual(beforeView);
    expect(element.getAttribute('x')).toBe('100');
    expect(element.getAttribute('y')).toBe('100');
    expect(element.getAttribute('width')).toBe(String(rectangle.width));

    fireEvent.click(screen.getByTestId('display-mode-edit'));
    expect(screen.getByTestId('display-editor-toolbar')).toBeInTheDocument();
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();

    fireEvent.pointerDown(element, { clientX: 120, clientY: 120, pointerId: 4 });
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    fireEvent.pointerMove(getSurface(), { clientX: 150, clientY: 140, pointerId: 4 });
    fireEvent.pointerUp(getSurface(), { clientX: 150, clientY: 140, pointerId: 4 });
    expect(element.getAttribute('x')).toBe('130');
    expect(element.getAttribute('y')).toBe('120');

    const width = Number(element.getAttribute('width'));
    const handle = screen.getByTestId('display-resize-handle-mr');
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 5 });
    fireEvent.pointerMove(getSurface(), { clientX: 20, clientY: 0, pointerId: 5 });
    fireEvent.pointerUp(getSurface(), { clientX: 20, clientY: 0, pointerId: 5 });
    expect(element.getAttribute('width')).toBe(String(width + 20));

    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    expect(getRectangleElements()).toHaveLength(2);
    expect(screen.getAllByTestId(/^display-resize-handle-/)).toHaveLength(8);
  });
});

describe('DisplayEditor - inserção de Value', () => {
  const selectedPiPoint: PiPointSearchResult = {
    name: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
    path: '\\\\pims\\LFI_A268SV_TEMPERATURA_AMBIENTE',
    webId: 'point-webid',
    dataSourceUid: 'resolved-datasource',
  };

  it('só cria Value após a ação explícita e grava o binding no documento', async () => {
    const loadValue = jest.fn().mockResolvedValue({ value: 23.48 });
    render(<Harness initial={makeDocument()} selectedPiPoint={selectedPiPoint} loadValue={loadValue} />);

    expect(screen.queryByTestId(/^display-element-/)).toBeNull();
    const insert = screen.getByTestId('display-insert-value');
    expect(insert).not.toBeDisabled();
    fireEvent.click(insert);

    const value = screen.getByTestId(/^display-element-/);
    expect(value).toHaveAttribute('data-element-type', 'value');
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId(/^display-value-/)).toHaveTextContent('23.48'));
    expect(loadValue).toHaveBeenCalledTimes(1);
    expect(loadValue).toHaveBeenCalledWith({
      dataSourceUid: 'resolved-datasource',
      serverPath: 'pims',
      pointName: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
    });
  });

  it('reutiliza seleção, drag, resize e Visualizar sem novas consultas', async () => {
    const loadValue = jest.fn().mockResolvedValue({ value: 'Running' });
    render(<Harness initial={makeDocument()} selectedPiPoint={selectedPiPoint} loadValue={loadValue} />);
    fireEvent.click(screen.getByTestId('display-insert-value'));
    await waitFor(() => expect(screen.getByTestId(/^display-value-/)).toHaveTextContent('Running'));

    const value = screen.getByTestId(/^display-element-/);
    const valueRect = value.querySelector('rect');
    expect(valueRect).not.toBeNull();
    const startX = Number(valueRect?.getAttribute('x'));
    const startY = Number(valueRect?.getAttribute('y'));
    act(() => {
      fireEvent.pointerDown(valueRect!, { clientX: startX + 40, clientY: startY + 40, pointerId: 1 });
      fireEvent.pointerMove(getSurface(), { clientX: startX + 80, clientY: startY + 70, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: startX + 80, clientY: startY + 70, pointerId: 1 });
    });
    expect(valueRect).toHaveAttribute('x', String(startX + 40));
    expect(valueRect).toHaveAttribute('y', String(startY + 30));

    const width = Number(valueRect?.getAttribute('width'));
    const handle = screen.getByTestId('display-resize-handle-mr');
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(getSurface(), { clientX: 30, clientY: 0, pointerId: 2 });
    fireEvent.pointerUp(getSurface(), { clientX: 30, clientY: 0, pointerId: 2 });
    expect(valueRect).toHaveAttribute('width', String(width + 30));
    expect(loadValue).toHaveBeenCalledTimes(1);
    expect(loadValue.mock.calls[0][0]).toEqual({
      dataSourceUid: 'resolved-datasource',
      serverPath: 'pims',
      pointName: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
    });

    fireEvent.click(screen.getByTestId('display-mode-view'));
    expect(screen.getByTestId(/^display-value-/)).toHaveTextContent('Running');
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();
    fireEvent.pointerDown(valueRect!, { clientX: 200, clientY: 200, pointerId: 3 });
    fireEvent.pointerMove(getSurface(), { clientX: 300, clientY: 300, pointerId: 3 });
    fireEvent.pointerUp(getSurface(), { clientX: 300, clientY: 300, pointerId: 3 });
    expect(valueRect).toHaveAttribute('x', String(startX + 40));
    expect(loadValue).toHaveBeenCalledTimes(1);
  });
});
