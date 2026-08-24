export const MIN_TREND_LEGEND_WIDTH = 100;
export const MIN_TREND_PLOT_WIDTH = 120;
export const DEFAULT_TREND_LEGEND_WIDTH = 180;
export const DEFAULT_POPUP_LEGEND_WIDTH = 320;

/**
 * Calculates the effective clamped legend width given available container width,
 * preferred width, margins, and constraints.
 */
export function getEffectiveTrendLegendWidth(
  containerWidth: number,
  preferredLegendWidth?: number,
  plotLeftMargin = 86,
  minPlotWidth = MIN_TREND_PLOT_WIDTH,
  minLegendWidth = MIN_TREND_LEGEND_WIDTH,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return minLegendWidth;
  }
  const defaultWidth = Math.max(minLegendWidth, containerWidth * 0.3);
  const preferred = typeof preferredLegendWidth === 'number' && Number.isFinite(preferredLegendWidth) && preferredLegendWidth > 0
    ? preferredLegendWidth
    : defaultWidth;

  const maxLegendWidth = Math.max(minLegendWidth, containerWidth - plotLeftMargin - minPlotWidth);
  const clamped = Math.max(minLegendWidth, Math.min(preferred, maxLegendWidth));

  return Number.isFinite(clamped) ? clamped : minLegendWidth;
}

/**
 * Truncates series legend label if available space is too narrow,
 * adding ellipsis. If enough space is available, returns full label.
 */
export function truncateLegendLabel(
  label: string,
  availableWidth: number,
  fontSize = 14,
): string {
  if (!label) {
    return '';
  }
  const padding = 24;
  const usableWidth = Math.max(10, availableWidth - padding);
  const charWidth = Math.max(5, fontSize * 0.58);
  const maxChars = Math.max(3, Math.floor(usableWidth / charWidth));

  if (label.length <= maxChars) {
    return label;
  }
  return `${label.slice(0, Math.max(1, maxChars - 2))}...`;
}

export const TREND_DIMMED_SERIES_OPACITY = 0.2;

/**
 * Pure helper to compute next selected series keys Set given a click event.
 */
export function updateTrendSeriesSelection(
  current: ReadonlySet<string>,
  clickedKey: string,
  ctrlPressed: boolean,
): Set<string> {
  const next = new Set(current);
  if (ctrlPressed) {
    if (next.has(clickedKey)) {
      next.delete(clickedKey);
    } else {
      next.add(clickedKey);
    }
  } else {
    if (next.has(clickedKey)) {
      next.clear();
    } else {
      next.clear();
      next.add(clickedKey);
    }
  }
  return next;
}

/**
 * Pure helper to compute opacity for a series key.
 * When no series is selected, all series return 1.
 * When one or more series are selected, selected series return 1 and others return dimmed opacity (0.2).
 */
export function getTrendSeriesOpacity(
  seriesKey: string,
  selectedSeriesKeys: ReadonlySet<string>,
  dimmedOpacity = TREND_DIMMED_SERIES_OPACITY,
): number {
  if (selectedSeriesKeys.size === 0 || selectedSeriesKeys.has(seriesKey)) {
    return 1;
  }
  return dimmedOpacity;
}

/**
 * Prunes keys that no longer exist in available series.
 */
export function pruneTrendSeriesSelection(
  current: ReadonlySet<string>,
  availableKeys: ReadonlyArray<string> | ReadonlySet<string>,
): Set<string> {
  const available = availableKeys instanceof Set ? availableKeys : new Set(availableKeys);
  const next = new Set<string>();
  for (const key of current) {
    if (available.has(key)) {
      next.add(key);
    }
  }
  return next;
}

