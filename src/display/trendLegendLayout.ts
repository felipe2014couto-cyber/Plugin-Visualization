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
