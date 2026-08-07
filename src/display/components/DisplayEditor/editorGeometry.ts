import type { DisplayDocument } from '../../displayDocument';
import type { DisplayElement } from '../../displayElement';

export interface Point {
  x: number;
  y: number;
}

export interface ElementGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ELEMENT_SIZE = 1;

export function getElementById(
  document: DisplayDocument,
  elementId: string,
): DisplayElement | undefined {
  return document.elements.find((el) => el.id === elementId);
}

export function updateElementGeometry(
  document: DisplayDocument,
  elementId: string,
  geometry: Partial<ElementGeometry>,
): DisplayDocument {
  return {
    ...document,
    elements: document.elements.map((el) =>
      el.id === elementId ? { ...el, ...geometry } : el,
    ),
  };
}

export function clampSize(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_ELEMENT_SIZE;
  }
  return Math.max(MIN_ELEMENT_SIZE, value);
}

export function computeDragGeometry(
  startGeometry: ElementGeometry,
  startPointer: Point,
  currentPointer: Point,
): ElementGeometry {
  const dx = finiteDelta(startPointer.x, currentPointer.x);
  const dy = finiteDelta(startPointer.y, currentPointer.y);
  return {
    x: startGeometry.x + dx,
    y: startGeometry.y + dy,
    width: startGeometry.width,
    height: startGeometry.height,
  };
}

export function computeResizeGeometry(
  handle: ResizeHandle,
  startGeometry: ElementGeometry,
  startPointer: Point,
  currentPointer: Point,
): ElementGeometry {
  const dx = resizeDelta(startPointer.x, currentPointer.x);
  const dy = resizeDelta(startPointer.y, currentPointer.y);

  let { x, y, width, height } = startGeometry;

  if (handle === 'tl' || handle === 'ml' || handle === 'bl') {
    width = clampSize(startGeometry.width - dx);
    x = startGeometry.x + startGeometry.width - width;
  }
  if (handle === 'tr' || handle === 'mr' || handle === 'br') {
    width = clampSize(startGeometry.width + dx);
  }
  if (handle === 'tl' || handle === 'tc' || handle === 'tr') {
    height = clampSize(startGeometry.height - dy);
    y = startGeometry.y + startGeometry.height - height;
  }
  if (handle === 'bl' || handle === 'bc' || handle === 'br') {
    height = clampSize(startGeometry.height + dy);
  }

  width = clampSize(width);
  height = clampSize(height);

  return { x, y, width, height };
}

function finiteDelta(start: number, current: number): number {
  const delta = current - start;
  return Number.isFinite(delta) ? delta : 0;
}

function resizeDelta(start: number, current: number): number {
  const delta = current - start;
  return Number.isFinite(delta) ? delta : NaN;
}

export type ResizeHandle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br';

export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  'tl',
  'tc',
  'tr',
  'ml',
  'mr',
  'bl',
  'bc',
  'br',
] as const;

export interface ResizeHandlePosition {
  handle: ResizeHandle;
  cx: number;
  cy: number;
}

export function getResizeHandlePositions(geometry: ElementGeometry): ResizeHandlePosition[] {
  const { x, y, width, height } = geometry;
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;
  const midX = x + width / 2;
  const midY = y + height / 2;

  const positions: ResizeHandlePosition[] = [
    { handle: 'tl', cx: left, cy: top },
    { handle: 'tc', cx: midX, cy: top },
    { handle: 'tr', cx: right, cy: top },
    { handle: 'ml', cx: left, cy: midY },
    { handle: 'mr', cx: right, cy: midY },
    { handle: 'bl', cx: left, cy: bottom },
    { handle: 'bc', cx: midX, cy: bottom },
    { handle: 'br', cx: right, cy: bottom },
  ];
  return positions;
}

export function getResizeHandleRect(
  position: ResizeHandlePosition,
  size: number,
): ElementGeometry {
  const half = size / 2;
  return {
    x: position.cx - half,
    y: position.cy - half,
    width: size,
    height: size,
  };
}

export function getHandleCursor(handle: ResizeHandle): string {
  switch (handle) {
    case 'tl':
    case 'br':
      return 'nwse-resize';
    case 'tr':
    case 'bl':
      return 'nesw-resize';
    case 'tc':
    case 'bc':
      return 'ns-resize';
    case 'ml':
    case 'mr':
      return 'ew-resize';
  }
}

export function svgPointFromEvent(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Point {
  const ctmFn = (svg as SVGSVGElement & {
    getScreenCTM?: () => DOMMatrix | null;
  }).getScreenCTM;
  if (typeof ctmFn !== 'function') {
    return { x: clientX, y: clientY };
  }
  const ctm = ctmFn.call(svg);
  if (!ctm) {
    return { x: clientX, y: clientY };
  }
  const point = (svg as SVGSVGElement & {
    createSVGPoint?: () => { x: number; y: number; matrixTransform: (m: DOMMatrix) => { x: number; y: number } };
  }).createSVGPoint;
  if (typeof point !== 'function') {
    return { x: clientX, y: clientY };
  }
  const pt = point.call(svg);
  pt.x = clientX;
  pt.y = clientY;
  const inverse = (ctm as DOMMatrix & {
    inverse?: () => DOMMatrix;
  }).inverse;
  if (typeof inverse !== 'function') {
    return { x: clientX, y: clientY };
  }
  const transformed = pt.matrixTransform(inverse.call(ctm));
  return { x: transformed.x, y: transformed.y };
}
