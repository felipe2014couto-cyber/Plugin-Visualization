import type { Point } from './editorGeometry';

export interface SurfaceViewport {
  zoom: number;
  viewCenter: Point;
}

/**
 * Zooms the SVG viewBox around a display coordinate, preserving that point at
 * the same relative screen position instead of recentering the viewport.
 */
export function zoomViewportAtPoint(
  viewport: SurfaceViewport,
  anchor: Point,
  direction: 'in' | 'out',
  minZoom: number,
  maxZoom: number,
  factor: number,
): SurfaceViewport {
  const safeZoom = finiteClamp(viewport.zoom, minZoom, maxZoom);
  const requestedZoom = direction === 'in' ? safeZoom * factor : safeZoom / factor;
  const zoom = finiteClamp(requestedZoom, minZoom, maxZoom);
  const ratio = safeZoom / zoom;
  return {
    zoom,
    viewCenter: {
      x: anchor.x + (viewport.viewCenter.x - anchor.x) * ratio,
      y: anchor.y + (viewport.viewCenter.y - anchor.y) * ratio,
    },
  };
}

function finiteClamp(value: number, min: number, max: number): number {
  const lower = Number.isFinite(min) ? min : 0.1;
  const upper = Number.isFinite(max) ? Math.max(lower, max) : Math.max(lower, 5);
  return Number.isFinite(value) ? Math.max(lower, Math.min(upper, value)) : lower;
}

export interface FocalZoomIntent {
  anchor: Point;
  localX: number;
  localY: number;
  zoom: number;
}

/**
 * Calculates the exact wrapper scroll offsets required to preserve an SVG logical
 * point (anchor) precisely under its physical cursor coordinates (localX, localY).
 */
export function calculateAnchoredZoomScroll(
  intent: FocalZoomIntent,
  canvasBounds: { left: number; top: number },
  scrollWidth: number,
  scrollHeight: number,
  clientWidth: number,
  clientHeight: number,
): { scrollLeft: number; scrollTop: number } {
  const targetLeft = (intent.anchor.x - canvasBounds.left) * intent.zoom - intent.localX;
  const targetTop = (intent.anchor.y - canvasBounds.top) * intent.zoom - intent.localY;
  
  const maxLeft = Math.max(0, scrollWidth - clientWidth);
  const maxTop = Math.max(0, scrollHeight - clientHeight);
  
  return {
    scrollLeft: Math.max(0, Math.min(targetLeft, maxLeft)),
    scrollTop: Math.max(0, Math.min(targetTop, maxTop)),
  };
}

/**
 * Calculates the exact mathematical viewCenter based on the physical wrapper scroll.
 */
export function calculateViewCenterFromScroll(
  scrollLeft: number,
  scrollTop: number,
  clientWidth: number,
  clientHeight: number,
  zoom: number,
  canvasBounds: { left: number; top: number },
): Point {
  return {
    x: canvasBounds.left + (scrollLeft + clientWidth / 2) / zoom,
    y: canvasBounds.top + (scrollTop + clientHeight / 2) / zoom,
  };
}
