import {
  computeAlignmentSnap,
  computeDragGeometry,
  computeResizeGeometry,
  clampSize,
  getElementById,
  getHandleCursor,
  getResizeHandlePositions,
  getResizeHandleRect,
  MIN_ELEMENT_SIZE,
  updateElementGeometry,
  type ElementGeometry,
  type Point,
  type ResizeHandle,
} from '../editorGeometry';
import { createDisplayDocument, type DisplayDocument, type DisplayElement } from '../../../index';

describe('clampSize', () => {
  it('garante valor minimo positivo', () => {
    expect(clampSize(0)).toBe(MIN_ELEMENT_SIZE);
    expect(clampSize(-5)).toBe(MIN_ELEMENT_SIZE);
    expect(clampSize(NaN)).toBe(MIN_ELEMENT_SIZE);
    expect(clampSize(Infinity)).toBe(MIN_ELEMENT_SIZE);
    expect(clampSize(-Infinity)).toBe(MIN_ELEMENT_SIZE);
  });

  it('preserva valores validos', () => {
    expect(clampSize(1)).toBe(1);
    expect(clampSize(100)).toBe(100);
    expect(clampSize(1920)).toBe(1920);
  });
});

describe('getElementById', () => {
  it('retorna o elemento correspondente', () => {
    const doc = makeDoc();
    const el: DisplayElement = { id: 'e1', type: 'value', x: 0, y: 0, width: 10, height: 10, properties: {} };
    doc.elements = [el];
    expect(getElementById(doc, 'e1')).toBe(el);
  });

  it('retorna undefined quando o id nao existe', () => {
    const doc = makeDoc();
    expect(getElementById(doc, 'nope')).toBeUndefined();
  });
});

describe('updateElementGeometry', () => {
  it('atualiza apenas o elemento alvo de forma imutavel', () => {
    const doc = makeDoc();
    const a: DisplayElement = { id: 'a', type: 'value', x: 10, y: 20, width: 30, height: 40, properties: { v: 1 } };
    const b: DisplayElement = { id: 'b', type: 'text', x: 100, y: 200, width: 50, height: 60, properties: { t: 'x' } };
    doc.elements = [a, b];

    const next = updateElementGeometry(doc, 'a', { x: 999, y: 888 });

    expect(next).not.toBe(doc);
    expect(next.elements[0]).not.toBe(a);
    expect(next.elements[0]).toEqual({ ...a, x: 999, y: 888 });
    expect(next.elements[1]).toBe(b);
    expect(next.elements[1].properties).toEqual({ t: 'x' });
  });

  it('preserva o resto do documento', () => {
    const doc = makeDoc();
    doc.name = 'meu display';
    doc.id = 'doc-id';
    const el: DisplayElement = { id: 'a', type: 'value', x: 0, y: 0, width: 1, height: 1, properties: {} };
    doc.elements = [el];

    const next = updateElementGeometry(doc, 'a', { x: 5 });

    expect(next.id).toBe('doc-id');
    expect(next.name).toBe('meu display');
    expect(next.surface).toBe(doc.surface);
  });

  it('nao altera nada se o id nao existe', () => {
    const doc = makeDoc();
    const el: DisplayElement = { id: 'a', type: 'value', x: 0, y: 0, width: 1, height: 1, properties: {} };
    doc.elements = [el];
    const before = doc.elements[0];
    const next = updateElementGeometry(doc, 'missing', { x: 5 });
    expect(next.elements[0]).toBe(before);
  });
});

describe('computeDragGeometry', () => {
  const startGeometry: ElementGeometry = { x: 100, y: 100, width: 200, height: 50 };
  const startPointer: Point = { x: 200, y: 125 };

  it('move o elemento pelo delta do ponteiro', () => {
    const result = computeDragGeometry(startGeometry, startPointer, { x: 230, y: 140 });
    expect(result.x).toBe(130);
    expect(result.y).toBe(115);
    expect(result.width).toBe(200);
    expect(result.height).toBe(50);
  });

  it('preserva width e height', () => {
    const result = computeDragGeometry(startGeometry, startPointer, { x: 999, y: 999 });
    expect(result.width).toBe(200);
    expect(result.height).toBe(50);
  });

  it('delta zero significa nenhuma alteracao', () => {
    const result = computeDragGeometry(startGeometry, startPointer, startPointer);
    expect(result).toEqual(startGeometry);
  });
});

describe('computeAlignmentSnap', () => {
  const moving: ElementGeometry = { x: 20, y: 20, width: 100, height: 60 };
  const target: ElementGeometry = { x: 180, y: 100, width: 120, height: 90 };

  it('encaixa e mostra uma guia quando os topos ficam próximos', () => {
    const result = computeAlignmentSnap([moving], [target], 30, 77, 6);

    expect(result.dy).toBe(80);
    expect(result.guides).toContainEqual({ axis: 'horizontal', position: 100, start: 50, end: 300 });
  });

  it('encaixa os centros verticalmente e horizontalmente', () => {
    const result = computeAlignmentSnap([moving], [target], 167, 92, 6);

    expect(result.dx).toBe(170);
    expect(result.dy).toBe(95);
    expect(result.guides.map((guide) => guide.axis).sort()).toEqual(['horizontal', 'vertical']);
  });

  it('não altera o movimento quando nenhum alinhamento está próximo', () => {
    expect(computeAlignmentSnap([moving], [target], 10, 10, 6)).toEqual({ dx: 10, dy: 10, guides: [] });
  });
});

describe('computeResizeGeometry', () => {
  const startGeometry: ElementGeometry = { x: 100, y: 100, width: 200, height: 80 };
  const startPointer: Point = { x: 200, y: 140 };
  const delta: Point = { x: 50, y: -20 };

  function resizeWith(handle: ResizeHandle) {
    return computeResizeGeometry(handle, startGeometry, startPointer, {
      x: startPointer.x + delta.x,
      y: startPointer.y + delta.y,
    });
  }

  it('handle right (mr) aumenta apenas a largura', () => {
    const r = resizeWith('mr');
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
    expect(r.width).toBe(250);
    expect(r.height).toBe(80);
  });

  it('handle bottom (bc) aumenta apenas a altura', () => {
    const r = resizeWith('bc');
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
    expect(r.width).toBe(200);
    expect(r.height).toBe(60);
  });

  it('handle bottom-right (br) aumenta largura e altura, origem intacta', () => {
    const r = resizeWith('br');
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
    expect(r.width).toBe(250);
    expect(r.height).toBe(60);
  });

  it('handle left (ml) move x e reduz largura', () => {
    const r = resizeWith('ml');
    expect(r.x).toBe(150);
    expect(r.y).toBe(100);
    expect(r.width).toBe(150);
    expect(r.height).toBe(80);
  });

  it('handle top (tc) move y e reduz altura', () => {
    const r = resizeWith('tc');
    expect(r.x).toBe(100);
    expect(r.y).toBe(80);
    expect(r.width).toBe(200);
    expect(r.height).toBe(100);
  });

  it('handle top-left (tl) move x, y e reduz ambas as dimensoes', () => {
    const r = resizeWith('tl');
    expect(r.x).toBe(150);
    expect(r.y).toBe(80);
    expect(r.width).toBe(150);
    expect(r.height).toBe(100);
  });

  it('handle top-right (tr) move y e aumenta largura', () => {
    const r = resizeWith('tr');
    expect(r.x).toBe(100);
    expect(r.y).toBe(80);
    expect(r.width).toBe(250);
    expect(r.height).toBe(100);
  });

  it('handle bottom-left (bl) move x e aumenta altura', () => {
    const r = resizeWith('bl');
    expect(r.x).toBe(150);
    expect(r.y).toBe(100);
    expect(r.width).toBe(150);
    expect(r.height).toBe(60);
  });

  it('impede largura/altura zero ou negativa', () => {
    const r = computeResizeGeometry('mr', startGeometry, startPointer, { x: -10000, y: 0 });
    expect(r.width).toBe(MIN_ELEMENT_SIZE);
    expect(r.x).toBe(100);
  });

  it('mantem a borda direita fixa ao limitar o handle esquerdo', () => {
    const r = computeResizeGeometry('ml', startGeometry, startPointer, { x: 1000, y: 140 });
    expect(r.x).toBe(299);
    expect(r.width).toBe(MIN_ELEMENT_SIZE);
    expect(r.x + r.width).toBe(300);
  });

  it('mantem a borda inferior fixa ao limitar o handle superior', () => {
    const r = computeResizeGeometry('tc', startGeometry, startPointer, { x: 200, y: 1000 });
    expect(r.y).toBe(179);
    expect(r.height).toBe(MIN_ELEMENT_SIZE);
    expect(r.y + r.height).toBe(180);
  });

  it('impede valores NaN/Infinity', () => {
    const r = computeResizeGeometry('mr', startGeometry, startPointer, { x: NaN, y: 0 });
    expect(r.width).toBe(MIN_ELEMENT_SIZE);
    expect(Number.isFinite(r.width)).toBe(true);
  });

  it('mantem resultado finito para delta nao finito em handles de origem', () => {
    const r = computeResizeGeometry('tl', startGeometry, startPointer, { x: NaN, y: Infinity });
    expect(r).toEqual({ x: 299, y: 179, width: MIN_ELEMENT_SIZE, height: MIN_ELEMENT_SIZE });
    expect(Object.values(r).every(Number.isFinite)).toBe(true);
  });
});

describe('getHandleCursor', () => {
  it('retorna cursor nwse-resize para tl e br', () => {
    expect(getHandleCursor('tl')).toBe('nwse-resize');
    expect(getHandleCursor('br')).toBe('nwse-resize');
  });
  it('retorna cursor nesw-resize para tr e bl', () => {
    expect(getHandleCursor('tr')).toBe('nesw-resize');
    expect(getHandleCursor('bl')).toBe('nesw-resize');
  });
  it('retorna cursor ns-resize para tc e bc', () => {
    expect(getHandleCursor('tc')).toBe('ns-resize');
    expect(getHandleCursor('bc')).toBe('ns-resize');
  });
  it('retorna cursor ew-resize para ml e mr', () => {
    expect(getHandleCursor('ml')).toBe('ew-resize');
    expect(getHandleCursor('mr')).toBe('ew-resize');
  });
});

describe('getResizeHandlePositions', () => {
  it('retorna 8 posicoes para uma geometria', () => {
    const positions = getResizeHandlePositions({ x: 0, y: 0, width: 100, height: 50 });
    expect(positions).toHaveLength(8);
    const handles = positions.map((p) => p.handle);
    expect(handles).toEqual(['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br']);
  });

  it('posiciona corretamente nos cantos e meios', () => {
    const positions = getResizeHandlePositions({ x: 10, y: 20, width: 100, height: 50 });
    const byHandle = Object.fromEntries(positions.map((p) => [p.handle, p]));
    expect(byHandle.tl).toEqual({ handle: 'tl', cx: 10, cy: 20 });
    expect(byHandle.tc).toEqual({ handle: 'tc', cx: 60, cy: 20 });
    expect(byHandle.tr).toEqual({ handle: 'tr', cx: 110, cy: 20 });
    expect(byHandle.ml).toEqual({ handle: 'ml', cx: 10, cy: 45 });
    expect(byHandle.mr).toEqual({ handle: 'mr', cx: 110, cy: 45 });
    expect(byHandle.bl).toEqual({ handle: 'bl', cx: 10, cy: 70 });
    expect(byHandle.bc).toEqual({ handle: 'bc', cx: 60, cy: 70 });
    expect(byHandle.br).toEqual({ handle: 'br', cx: 110, cy: 70 });
  });
});

describe('getResizeHandleRect', () => {
  it('centraliza o retangulo no cx,cy', () => {
    const rect = getResizeHandleRect({ handle: 'tl', cx: 100, cy: 50 }, 8);
    expect(rect).toEqual({ x: 96, y: 46, width: 8, height: 8 });
  });
});

function makeDoc(): DisplayDocument {
  return createDisplayDocument({ name: 'Test' });
}
