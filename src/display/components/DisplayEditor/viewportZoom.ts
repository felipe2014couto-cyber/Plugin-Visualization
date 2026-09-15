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

/**
 * Margin kept between the fitted content and the workspace edges.
 */
export const FIT_VIEWPORT_MARGIN_PX = 48;

export interface FitViewportResult extends SurfaceViewport {}

/**
 * Calculates the zoom and view center that frame a content bounding box inside
 * a viewport of the given physical dimensions, with a margin on each side.
 */
export function calculateFitViewport(
  bounds: { left: number; top: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
  minZoom: number,
  maxZoom: number,
  margin: number = FIT_VIEWPORT_MARGIN_PX,
): FitViewportResult {
  const availableWidth = Math.max(1, viewportWidth - margin * 2);
  const availableHeight = Math.max(1, viewportHeight - margin * 2);
  const contentWidth = Math.max(1, bounds.width);
  const contentHeight = Math.max(1, bounds.height);
  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;
  const fitScale = Math.min(scaleX, scaleY);
  const lower = Number.isFinite(minZoom) ? minZoom : 0.1;
  const upper = Math.max(lower, Number.isFinite(maxZoom) ? maxZoom : 5);
  const zoom = Number.isFinite(fitScale) ? Math.max(lower, Math.min(upper, fitScale)) : lower;
  return {
    zoom,
    viewCenter: {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
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
