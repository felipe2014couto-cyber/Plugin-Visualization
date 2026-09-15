import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { appendDisplayElement, appendText, createDisplayDocument, createRectangle, createText } from '../../../index';
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

describe('DisplayEditor', () => {
  it('renderiza o editor a partir de um DisplayDocument valido', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface')).toBeInTheDocument();
  });

  it('aplica width e height do documento na superficie SVG', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    doc.surface.width = 800;
    doc.surface.height = 450;

    render(<DisplayEditor document={doc} />);

    const surface = screen.getByTestId('display-surface');
    expect(surface.getAttribute('width')).toBe('800');
    expect(surface.getAttribute('height')).toBe('450');
    expect(surface.getAttribute('viewBox')).toBe('0 0 800 450');
  });

  it('aplica backgroundColor do documento no fundo da superficie', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    doc.surface.backgroundColor = '#abcdef';

    render(<DisplayEditor document={doc} />);

    const background = screen.getByTestId('display-surface-background');
    expect(background.getAttribute('fill')).toBe('#abcdef');
  });

  it('renderiza corretamente um documento com elements vazio', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    expect(doc.elements).toEqual([]);

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface-background')).toBeInTheDocument();
  });

  it('mostra o nome do documento no cabecalho', () => {
    const doc = createDisplayDocument({ name: 'Meu Display Custom' });

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor-name')).toHaveTextContent('Meu Display Custom');
  });

  it('mantém os controles existentes agrupados na toolbar compacta', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });

    render(<DisplayEditor document={doc} />);

    expect(screen.getByTestId('display-editor-toolbar')).toContainElement(screen.getByTestId('display-undo'));
    expect(screen.getByTestId('display-editor-toolbar')).toContainElement(screen.getByLabelText('Arrastar como Gauge'));
    expect(screen.getByTitle('Exportar Display')).toBeInTheDocument();
    expect(screen.getByTitle('Arrastar como Barra')).toBeInTheDocument();
  });

  it('aplica zoom somente com Ctrl + scroll e não altera o documento', () => {
    const doc = createDisplayDocument({ name: 'Test Display' });
    doc.surface.width = 800;
    doc.surface.height = 450;
    const before = JSON.stringify(doc);
    render(<DisplayEditor document={doc} />);
    const surface = screen.getByTestId('display-surface');
    const originalWidth = surface.getAttribute('width');

    fireEvent.wheel(surface, { deltaY: -1, clientX: 400, clientY: 225 });
    expect(surface.getAttribute('width')).toBe(originalWidth);

    const ctrlWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -1, clientX: 400, clientY: 225 });
    fireEvent(surface, ctrlWheel);
    expect(ctrlWheel.defaultPrevented).toBe(true);
    expect(surface.style.width).not.toBe('');
    expect(surface.style.width).not.toBe(`${originalWidth}px`);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('escala o tamanho da fonte do elemento de texto ao redimensionar a caixa', () => {
    let currentDoc = appendText(createDisplayDocument({ name: 'Test Display' }), createText({
      id: 'text-1',
      x: 100,
      y: 100,
      width: 200,
      height: 50,
      properties: { text: 'Meu Texto', fontSize: 20 },
    }));

    function EditorWrapper() {
      const [doc, setDoc] = useState(currentDoc);
      return <DisplayEditor document={doc} onChange={(next) => { setDoc(next); currentDoc = next; }} />;
    }

    render(<EditorWrapper />);
    const textEl = screen.getByTestId('display-element-text-1');
    act(() => {
      fireEvent.pointerDown(textEl, { clientX: 150, clientY: 125, pointerId: 1, button: 0 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 150, clientY: 125, pointerId: 1, button: 0 });
    });

    const handleBr = screen.getByTestId('display-resize-handle-br');
    act(() => {
      fireEvent.pointerDown(handleBr, { clientX: 300, clientY: 150, pointerId: 2, button: 0 });
      // Expand by 2x in both width and height (from 300,150 to 500,200)
      fireEvent.pointerMove(screen.getByTestId('display-surface'), { clientX: 500, clientY: 200, pointerId: 2 });
      fireEvent.pointerUp(screen.getByTestId('display-surface'), { clientX: 500, clientY: 200, pointerId: 2, button: 0 });
    });

    const updatedText = currentDoc.elements.find((el) => el.id === 'text-1');
    expect(updatedText?.properties.fontSize).toBe(40);
  });

  describe('Ajustar à tela', () => {
    it('enquadra elementos distantes reduzindo o zoom para o bounding box', () => {
      const base = createDisplayDocument({ name: 'Fit' });
      const withA = appendDisplayElement(base, createRectangle({ id: 'rect-a', x: 100, y: 100, width: 100, height: 100 }));
      const withB = appendDisplayElement(withA, createRectangle({ id: 'rect-b', x: 2000, y: 1200, width: 100, height: 100 }));
      render(<DisplayEditor document={withB} />);
      const surface = screen.getByTestId('display-surface');

      fireEvent.click(screen.getByTestId('display-zoom-fit'));

      // Conteúdo 2000x1200 em viewport 1920x1080 com margem 48 → zoom 0.82;
      // largura renderizada = canvas 2100 * 0.82 ≈ 1722.
      expect(parseFloat(surface.style.width)).toBeCloseTo(1722, 0);
      expect(withB.elements).toHaveLength(2);
    });

    it('amplia um único elemento até o zoom máximo', () => {
      const doc = appendDisplayElement(
        createDisplayDocument({ name: 'Fit' }),
        createRectangle({ id: 'rect-single', x: 500, y: 500, width: 100, height: 100 }),
      );
      render(<DisplayEditor document={doc} />);
      const surface = screen.getByTestId('display-surface');

      fireEvent.click(screen.getByTestId('display-zoom-fit'));

      // fitScale 9.84 é limitado pelo zoom máximo 5; largura = 1920 * 5.
      expect(parseFloat(surface.style.width)).toBeCloseTo(9600, 0);
    });

    it('enquadra conteúdo com coordenadas negativas', () => {
      const base = createDisplayDocument({ name: 'Fit' });
      const withA = appendDisplayElement(base, createRectangle({ id: 'rect-neg', x: -300, y: -200, width: 100, height: 100 }));
      const withB = appendDisplayElement(withA, createRectangle({ id: 'rect-pos', x: 200, y: 300, width: 100, height: 100 }));
      render(<DisplayEditor document={withB} />);
      const surface = screen.getByTestId('display-surface');

      fireEvent.click(screen.getByTestId('display-zoom-fit'));

      // Bounding box 600x600 → zoom 1.64; canvas 2220 de largura ≈ 3640.8px.
      expect(parseFloat(surface.style.width)).toBeCloseTo(3640.8, 0);
    });

    it('mantém o display vazio em zoom 1 sem quebrar', () => {
      const doc = createDisplayDocument({ name: 'Fit' });
      render(<DisplayEditor document={doc} />);
      const surface = screen.getByTestId('display-surface');

      fireEvent.click(screen.getByTestId('display-zoom-fit'));

      expect(surface.style.width).toBe('100%');
      expect(screen.getByTestId('display-surface')).toBeInTheDocument();
    });
  });
});
