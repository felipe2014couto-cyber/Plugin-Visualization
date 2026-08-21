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
