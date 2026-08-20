export interface AreaZoomPoint {
  x: number;
  y: number;
}

export interface AreaZoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AreaZoomViewport {
  zoom: number;
  center: AreaZoomPoint;
}

export const AREA_ZOOM_PADDING = 1.04;
export const MIN_AREA_ZOOM_DRAG_PX = 8;

/** Produces a positive display-space rectangle regardless of drag direction. */
export function normalizeAreaZoomRect(start: AreaZoomPoint, end: AreaZoomPoint): AreaZoomRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** Calculates the existing viewBox zoom state required to fit an explicit display area. */
export function calculateAreaZoomViewport(
  selection: AreaZoomRect,
  surfaceWidth: number,
  surfaceHeight: number,
  minZoom: number,
  maxZoom: number,
  padding = AREA_ZOOM_PADDING,
): AreaZoomViewport | null {
  if (
    !Number.isFinite(selection.width) || !Number.isFinite(selection.height) ||
    !Number.isFinite(surfaceWidth) || !Number.isFinite(surfaceHeight) ||
    selection.width <= 0 || selection.height <= 0 || surfaceWidth <= 0 || surfaceHeight <= 0
  ) {
    return null;
  }
  const safePadding = Math.max(1, padding);
  const zoom = Math.max(minZoom, Math.min(
    maxZoom,
    surfaceWidth / (selection.width * safePadding),
    surfaceHeight / (selection.height * safePadding),
  ));
  if (!Number.isFinite(zoom)) {
    return null;
  }
  return {
    zoom,
    center: { x: selection.x + selection.width / 2, y: selection.y + selection.height / 2 },
  };
}
