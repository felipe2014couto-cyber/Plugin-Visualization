import type { DisplayDocument } from '../../displayDocument';
import type { DisplayElement } from '../../displayElement';

import { GROUP_TYPE, updateElementInDocument } from '../../createGroup';

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

export interface AlignmentGuide {
  axis: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
}

export interface AlignmentSnapResult {
  dx: number;
  dy: number;
  guides: AlignmentGuide[];
}

export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Returns the full canvas required by the surface and all top-level elements. */
export function getCanvasBounds(
  surface: DisplayDocument['surface'],
  elements: readonly DisplayElement[],
): CanvasBounds {
  const left = Math.min(0, ...elements.map((element) => Number.isFinite(element.x) ? element.x : 0));
  const top = Math.min(0, ...elements.map((element) => Number.isFinite(element.y) ? element.y : 0));
  const right = Math.max(surface.width, ...elements.map((element) => {
    const value = element.x + element.width;
    return Number.isFinite(value) ? value : surface.width;
  }));
  const bottom = Math.max(surface.height, ...elements.map((element) => {
    const value = element.y + element.height;
    return Number.isFinite(value) ? value : surface.height;
  }));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Returns the tight bounding box around the actual elements on the canvas. */
export function getContentBounds(
  elements: readonly DisplayElement[],
  surface?: DisplayDocument['surface'],
): CanvasBounds {
  const valid = elements.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.width) && Number.isFinite(e.height) && e.width > 0 && e.height > 0);
  if (valid.length === 0) {
    return { left: 0, top: 0, width: surface?.width || 1920, height: surface?.height || 1080 };
  }
  const minX = Math.min(...valid.map((e) => e.x));
  const minY = Math.min(...valid.map((e) => e.y));
  const maxX = Math.max(...valid.map((e) => e.x + e.width));
  const maxY = Math.max(...valid.map((e) => e.y + e.height));
  
  const pad = 16;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = maxX + pad;
  const bottom = maxY + pad;
  return { left, top, width: Math.max(100, right - left), height: Math.max(100, bottom - top) };
}

export const MIN_ELEMENT_SIZE = 1;

export function getElementById(
  document: DisplayDocument,
  elementId: string,
): DisplayElement | undefined {
  return findElementInList(document.elements, elementId);
}

function findElementInList(elements: readonly DisplayElement[], elementId: string): DisplayElement | undefined {
  for (const el of elements) {
    if (el.id === elementId) {
      return el;
    }
    if (el.type === GROUP_TYPE && Array.isArray((el.properties as { elements?: DisplayElement[] }).elements)) {
      const found = findElementInList((el.properties as { elements: DisplayElement[] }).elements, elementId);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function updateElementGeometry(
  document: DisplayDocument,
  elementId: string,
  geometry: Partial<ElementGeometry>,
): DisplayDocument {
  return updateElementInDocument(document, elementId, (el) => ({ ...el, ...geometry }));
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

/**
 * Snaps the outside edges and centres of the moving selection to nearby
 * elements. One guide per axis is enough to describe the closest match and
 * keeps the canvas readable when many objects share the same coordinate.
 */
export function computeAlignmentSnap(
  movingGeometries: readonly ElementGeometry[],
  targetGeometries: readonly ElementGeometry[],
  rawDx: number,
  rawDy: number,
  threshold = 6,
): AlignmentSnapResult {
  if (movingGeometries.length === 0 || targetGeometries.length === 0) {
    return { dx: rawDx, dy: rawDy, guides: [] };
  }

  const movingBounds = geometryBounds(movingGeometries);
  const movedBounds = {
    ...movingBounds,
    x: movingBounds.x + rawDx,
    y: movingBounds.y + rawDy,
  };
  const movingXAnchors = [movedBounds.x, movedBounds.x + movedBounds.width / 2, movedBounds.x + movedBounds.width];
  const movingYAnchors = [movedBounds.y, movedBounds.y + movedBounds.height / 2, movedBounds.y + movedBounds.height];

  let closestX: { delta: number; target: ElementGeometry; position: number } | undefined;
  let closestY: { delta: number; target: ElementGeometry; position: number } | undefined;

  targetGeometries.forEach((target) => {
    const targetXAnchors = [target.x, target.x + target.width / 2, target.x + target.width];
    const targetYAnchors = [target.y, target.y + target.height / 2, target.y + target.height];
    movingXAnchors.forEach((movingAnchor) => targetXAnchors.forEach((targetAnchor) => {
      const delta = targetAnchor - movingAnchor;
      if (Math.abs(delta) <= threshold && (!closestX || Math.abs(delta) < Math.abs(closestX.delta))) {
        closestX = { delta, target, position: targetAnchor };
      }
    }));
    movingYAnchors.forEach((movingAnchor) => targetYAnchors.forEach((targetAnchor) => {
      const delta = targetAnchor - movingAnchor;
      if (Math.abs(delta) <= threshold && (!closestY || Math.abs(delta) < Math.abs(closestY.delta))) {
        closestY = { delta, target, position: targetAnchor };
      }
    }));
  });

  const dx = rawDx + (closestX?.delta ?? 0);
  const dy = rawDy + (closestY?.delta ?? 0);
  const snappedBounds = { ...movingBounds, x: movingBounds.x + dx, y: movingBounds.y + dy };
  const guides: AlignmentGuide[] = [];
  if (closestX) {
    guides.push({
      axis: 'vertical',
      position: closestX.position,
      start: Math.min(snappedBounds.y, closestX.target.y),
      end: Math.max(snappedBounds.y + snappedBounds.height, closestX.target.y + closestX.target.height),
    });
  }
  if (closestY) {
    guides.push({
      axis: 'horizontal',
      position: closestY.position,
      start: Math.min(snappedBounds.x, closestY.target.x),
      end: Math.max(snappedBounds.x + snappedBounds.width, closestY.target.x + closestY.target.width),
    });
  }
  return { dx, dy, guides };
}

function geometryBounds(geometries: readonly ElementGeometry[]): ElementGeometry {
  const x = Math.min(...geometries.map((geometry) => geometry.x));
  const y = Math.min(...geometries.map((geometry) => geometry.y));
  const right = Math.max(...geometries.map((geometry) => geometry.x + geometry.width));
  const bottom = Math.max(...geometries.map((geometry) => geometry.y + geometry.height));
  return { x, y, width: right - x, height: bottom - y };
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
    const bounds = svg.getBoundingClientRect?.();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const viewBox = svg.viewBox?.baseVal;
      if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        const scaleX = viewBox.width / bounds.width;
        const scaleY = viewBox.height / bounds.height;
        return {
          x: viewBox.x + (clientX - bounds.left) * scaleX,
          y: viewBox.y + (clientY - bounds.top) * scaleY,
        };
      }
      return {
        x: clientX - bounds.left,
        y: clientY - bounds.top,
      };
    }
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

export function getElementCenter(geometry: ElementGeometry): Point {
  return {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
}

export function rotateVector(vector: Point, angleDegrees: number): Point {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

export function rotatePointAroundCenter(point: Point, center: Point, angleDegrees: number): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const rotated = rotateVector({ x: dx, y: dy }, angleDegrees);
  return {
    x: center.x + rotated.x,
    y: center.y + rotated.y,
  };
}

const CURSOR_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

export function getRotatedHandleCursor(handle: ResizeHandle, rotation: number): string {
  if (!rotation) return getHandleCursor(handle);

  let baseAngle = 0;
  switch (handle) {
    case 'tc': baseAngle = 0; break;
    case 'tr': baseAngle = 45; break;
    case 'mr': baseAngle = 90; break;
    case 'br': baseAngle = 135; break;
    case 'bc': baseAngle = 180; break;
    case 'bl': baseAngle = 225; break;
    case 'ml': baseAngle = 270; break;
    case 'tl': baseAngle = 315; break;
  }

  let totalAngle = (baseAngle + rotation) % 360;
  if (totalAngle < 0) {
    totalAngle += 360;
  }

  const index = Math.round(totalAngle / 45) % 8;
  const direction = CURSOR_DIRECTIONS[index];

  switch (direction) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}

export function computeRotatedResizeGeometry(
  handle: ResizeHandle,
  startGeometry: ElementGeometry,
  startPointer: Point,
  currentPointer: Point,
  rotation: number,
): ElementGeometry {
  if (!rotation) {
    return computeResizeGeometry(handle, startGeometry, startPointer, currentPointer);
  }

  const originalCenter = getElementCenter(startGeometry);

  const localStartPointer = rotatePointAroundCenter(startPointer, originalCenter, -rotation);
  const localCurrentPointer = rotatePointAroundCenter(currentPointer, originalCenter, -rotation);

  const localGeometry = computeResizeGeometry(handle, startGeometry, localStartPointer, localCurrentPointer);

  const localNewCenter = getElementCenter(localGeometry);

  const localDelta = {
    x: localNewCenter.x - originalCenter.x,
    y: localNewCenter.y - originalCenter.y,
  };

  const worldDelta = rotateVector(localDelta, rotation);

  const newWorldCenter = {
    x: originalCenter.x + worldDelta.x,
    y: originalCenter.y + worldDelta.y,
  };

  return {
    x: newWorldCenter.x - localGeometry.width / 2,
    y: newWorldCenter.y - localGeometry.height / 2,
    width: localGeometry.width,
    height: localGeometry.height,
  };
}
