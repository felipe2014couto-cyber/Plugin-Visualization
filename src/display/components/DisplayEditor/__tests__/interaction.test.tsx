import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, type DisplayDocument, type DisplayElement } from '../../../index';
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

function makeDocWithElement(): DisplayDocument {
  const doc = createDisplayDocument({ name: 'Test Display' });
  doc.surface.width = 800;
  doc.surface.height = 600;
  const el: DisplayElement = {
    id: 'e1',
    type: 'value',
    x: 100,
    y: 100,
    width: 200,
    height: 80,
    properties: { value: 'X' },
  };
  doc.elements = [el];
  return doc;
}

function makeDocWithTwoElements(): DisplayDocument {
  const doc = makeDocWithElement();
  doc.elements.push({
    id: 'e2',
    type: 'text',
    x: 400,
    y: 300,
    width: 100,
    height: 40,
    properties: { text: 'Hello' },
  });
  return doc;
}

function Harness({ initial }: { initial: DisplayDocument }) {
  const [doc, setDoc] = useState(initial);
  return <DisplayEditor document={doc} onChange={setDoc} />;
}

function getElement(): HTMLElement {
  return screen.getByTestId('display-element-e1');
}

function getSurface(): SVGSVGElement {
  return screen.getByTestId('display-surface') as unknown as SVGSVGElement;
}

function getBackground(): HTMLElement {
  return screen.getByTestId('display-surface-background');
}

describe('DisplayEditor - selecao', () => {
  it('clicar em um elemento seleciona o elemento', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    expect(screen.getByTestId('display-resize-handle-tl')).toBeInTheDocument();
    expect(screen.getByTestId('display-resize-handle-br')).toBeInTheDocument();
  });

  it('clicar em outro elemento troca a selecao', () => {
    render(<Harness initial={makeDocWithTwoElements()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });
    expect(screen.getByTestId('display-resize-handle-tl')).toBeInTheDocument();

    act(() => {
      const e2 = screen.getByTestId('display-element-e2');
      fireEvent.pointerDown(e2, { clientX: 450, clientY: 320, pointerId: 2, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 450, clientY: 320, pointerId: 2, button: 0 });
    });
    expect(screen.getByTestId('display-resize-handle-tl')).toBeInTheDocument();
  });

  it('clicar no fundo desseleciona', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();

    act(() => {
      fireEvent.pointerDown(getBackground(), { clientX: 700, clientY: 500, pointerId: 3, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 700, clientY: 500, pointerId: 3, button: 0 });
    });
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();
  });
});

describe('DisplayEditor - bounding box e handles', () => {
  it('elemento nao selecionado nao tem bounding box nem handles', () => {
    render(<Harness initial={makeDocWithElement()} />);
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();
    expect(screen.queryByTestId('display-resize-handle-tl')).toBeNull();
  });

  it('elemento selecionado mostra os 8 handles', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    const handles = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'];
    for (const h of handles) {
      expect(screen.getByTestId(`display-resize-handle-${h}`)).toBeInTheDocument();
    }
  });
});

describe('DisplayEditor - drag', () => {
  it('arrastar atualiza x e y do elemento', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 250, clientY: 180, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: 250, clientY: 180, pointerId: 1, button: 0 });
    });

    const el = getElement();
    expect(el.getAttribute('x')).toBe('150');
    expect(el.getAttribute('y')).toBe('140');
  });

  it('arrastar preserva width e height', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 300, clientY: 200, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: 300, clientY: 200, pointerId: 1, button: 0 });
    });

    const el = getElement();
    expect(el.getAttribute('width')).toBe('200');
    expect(el.getAttribute('height')).toBe('80');
  });

  it('arrastar preserva type, id e properties do elemento movido', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 210, clientY: 150, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: 210, clientY: 150, pointerId: 1, button: 0 });
    });

    const el = getElement();
    expect(el.getAttribute('data-element-id')).toBe('e1');
    expect(el.getAttribute('data-testid')).toBe('display-element-e1');
  });

  it('arrastar nao altera outros elementos', () => {
    render(<Harness initial={makeDocWithTwoElements()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 250, clientY: 180, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: 250, clientY: 180, pointerId: 1, button: 0 });
    });

    const e2 = screen.getByTestId('display-element-e2');
    expect(e2.getAttribute('x')).toBe('400');
    expect(e2.getAttribute('y')).toBe('300');
    expect(e2.getAttribute('width')).toBe('100');
    expect(e2.getAttribute('height')).toBe('40');
  });
});

describe('DisplayEditor - resize', () => {
  it('handle right aumenta apenas width', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    const handle = screen.getByTestId('display-resize-handle-mr');
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 300, clientY: 140, pointerId: 2, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 350, clientY: 140, pointerId: 2 });
      fireEvent.pointerUp(getSurface(), { clientX: 350, clientY: 140, pointerId: 2, button: 0 });
    });

    const el = getElement();
    expect(el.getAttribute('x')).toBe('100');
    expect(el.getAttribute('y')).toBe('100');
    expect(el.getAttribute('width')).toBe('250');
    expect(el.getAttribute('height')).toBe('80');
  });

  it('handle bottom aumenta apenas height', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    const handle = screen.getByTestId('display-resize-handle-bc');
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 200, clientY: 180, pointerId: 2, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 200, clientY: 230, pointerId: 2 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 230, pointerId: 2, button: 0 });
    });

    const el = getElement();
    expect(el.getAttribute('x')).toBe('100');
    expect(el.getAttribute('y')).toBe('100');
    expect(el.getAttribute('width')).toBe('200');
    expect(el.getAttribute('height')).toBe('130');
  });

  it('handle bottom-right aumenta width e height', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    const handle = screen.getByTestId('display-resize-handle-br');
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 300, clientY: 180, pointerId: 2, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 340, clientY: 210, pointerId: 2 });
      fireEvent.pointerUp(getSurface(), { clientX: 340, clientY: 210, pointerId: 2, button: 0 });
    });

    const el = getElement();
    expect(el.getAttribute('x')).toBe('100');
    expect(el.getAttribute('y')).toBe('100');
    expect(el.getAttribute('width')).toBe('240');
    expect(el.getAttribute('height')).toBe('110');
  });

  it('handle top-left move x, y e reduz width e height', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    const handle = screen.getByTestId('display-resize-handle-tl');
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 2, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 130, clientY: 120, pointerId: 2 });
      fireEvent.pointerUp(getSurface(), { clientX: 130, clientY: 120, pointerId: 2, button: 0 });
    });

    const el = getElement();
    expect(el.getAttribute('x')).toBe('130');
    expect(el.getAttribute('y')).toBe('120');
    expect(el.getAttribute('width')).toBe('170');
    expect(el.getAttribute('height')).toBe('60');
  });

  it('impede width/height invalidos (zero ou negativo)', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    const handle = screen.getByTestId('display-resize-handle-mr');
    act(() => {
      fireEvent.pointerDown(handle, { clientX: 300, clientY: 140, pointerId: 2, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: -9999, clientY: 140, pointerId: 2 });
      fireEvent.pointerUp(getSurface(), { clientX: -9999, clientY: 140, pointerId: 2, button: 0 });
    });

    const el = getElement();
    const width = Number(el.getAttribute('width'));
    expect(width).toBeGreaterThan(0);
    expect(Number.isFinite(width)).toBe(true);
  });
});

describe('DisplayEditor - cleanup de pointer', () => {
  it('pointerup encerra a interacao de drag', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 250, clientY: 180, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: 250, clientY: 180, pointerId: 1, button: 0 });
    });

    act(() => {
      fireEvent.pointerMove(getSurface(), { clientX: 500, clientY: 500, pointerId: 1 });
    });

    const el = getElement();
    expect(el.getAttribute('x')).toBe('150');
    expect(el.getAttribute('y')).toBe('140');
  });

  it('pointercancel encerra a interacao de drag', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 250, clientY: 180, pointerId: 1 });
      fireEvent.pointerCancel(getSurface(), { clientX: 250, clientY: 180, pointerId: 1 });
    });

    act(() => {
      fireEvent.pointerMove(getSurface(), { clientX: 999, clientY: 999, pointerId: 1 });
    });

    const el = getElement();
    expect(el.getAttribute('x')).toBe('150');
    expect(el.getAttribute('y')).toBe('140');
  });
});

describe('DisplayEditor - bounding box acompanha geometria', () => {
  it('apos drag, bounding box do elemento selecionado reflete nova posicao', () => {
    render(<Harness initial={makeDocWithElement()} />);

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerUp(getSurface(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
    });

    act(() => {
      fireEvent.pointerDown(getElement(), { clientX: 200, clientY: 140, pointerId: 1, button: 0 });
      fireEvent.pointerMove(getSurface(), { clientX: 230, clientY: 170, pointerId: 1 });
      fireEvent.pointerUp(getSurface(), { clientX: 230, clientY: 170, pointerId: 1, button: 0 });
    });

    const box = screen.getByTestId('display-selection-bounding-box');
    expect(box.getAttribute('x')).toBe('129');
    expect(box.getAttribute('y')).toBe('129');
    expect(box.getAttribute('width')).toBe('202');
    expect(box.getAttribute('height')).toBe('82');
  });
});
