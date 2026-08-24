import React from 'react';
import type { PiPointDatabaseLimits } from '../../pi/piPointBinding';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { resolveThemeForeground } from '../themeColor';
import {
  getBarChartItems,
  getBarChartVisualOptions,
  getBarChartItemConsumerId,
  type BarChartElement,
  type BarChartItem,
  type BarChartVisualOptions,
} from '../createBarChart';

export interface BarChartElementViewProps {
  element: BarChartElement;
  runtimeStates?: Map<string, ValueRuntimeState>;
  databaseScales?: Record<string, PiPointDatabaseLimits>;
}

export const BarChartElementView = React.memo(function BarChartElementView({
  element,
  runtimeStates,
  databaseScales = {},
}: BarChartElementViewProps) {
  const items = getBarChartItems(element);
  const visual = getBarChartVisualOptions(element);

  const fgColor = resolveThemeForeground(visual.foregroundColor);
  const valColor = resolveThemeForeground(visual.valueColor);

  // Compute scale limits
  let min = visual.minimum;
  let max = visual.maximum;

  if (visual.scaleMode === 'database') {
    const limitsList: PiPointDatabaseLimits[] = [];
    for (const item of items) {
      const consumerId = getBarChartItemConsumerId(element.id, item.binding);
      const limits = databaseScales[consumerId] ?? databaseScales[item.binding.pointName];
      if (limits && Number.isFinite(limits.zero) && Number.isFinite(limits.span) && limits.span > 0) {
        limitsList.push(limits);
      }
    }
    if (limitsList.length > 0) {
      min = Math.min(...limitsList.map((l) => l.zero));
      max = Math.max(...limitsList.map((l) => l.zero + l.span));
    }
  }

  const validScale = Number.isFinite(min) && Number.isFinite(max) && min < max;
  const scaleMin = validScale ? min : 0;
  const scaleMax = validScale ? max : 100;
  const scaleSpan = Math.max(1e-9, scaleMax - scaleMin);

  // Common unit calculation
  const units = items
    .map((item) => {
      const consumerId = getBarChartItemConsumerId(element.id, item.binding);
      const state = runtimeStates?.get(consumerId);
      return state?.result?.unit ?? item.engineeringUnit;
    })
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

  const commonUnit = units.length > 0 && units.every((u) => u === units[0]) ? units[0] : undefined;

  const horizontal = visual.orientation === 'horizontal';
  const showScale = visual.showScale !== false;

  // Layout sizing with larger breathing room for readability
  const titleHeight = visual.showTitle && visual.title.trim() ? 32 : 10;
  const bottomMargin = horizontal
    ? (showScale && validScale ? 40 : 16)
    : ((visual.showLabel || visual.showValue) ? (visual.showLabel && visual.showValue ? 68 : 38) : 16);
  const leftMargin = horizontal
    ? ((visual.showLabel || visual.showValue) ? 160 : 45)
    : (showScale && validScale ? 64 : 20);
  const topMargin = titleHeight;
  const rightMargin = 16;

  const plotX = element.x + leftMargin;
  const plotY = element.y + topMargin;
  const plotWidth = Math.max(20, element.width - leftMargin - rightMargin);
  const plotHeight = Math.max(20, element.height - topMargin - bottomMargin);

  // Grid tick values (5 intervals -> 6 ticks)
  const tickCount = 5;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => {
    const ratio = index / tickCount;
    return scaleMin + ratio * scaleSpan;
  });

  // Base bar start value
  const rawBaseValue = visual.barStartMode === 'custom' ? visual.barStartValue : scaleMin;
  const baseValue = Math.max(scaleMin, Math.min(scaleMax, rawBaseValue));
  const baseRatio = (baseValue - scaleMin) / scaleSpan;

  const itemCount = Math.max(1, items.length);

  return (
    <g
      data-testid={`display-element-${element.id}`}
      data-element-id={element.id}
      data-element-type={element.type}
      style={{ cursor: 'move' }}
    >
      {/* Background */}
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={6}
        fill={visual.backgroundColor}
        stroke="none"
        data-testid={`bar-chart-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />

      {/* Title */}
      {visual.showTitle && visual.title.trim() && (
        <text
          x={element.x + element.width / 2}
          y={element.y + 22}
          textAnchor="middle"
          fill={fgColor}
          fontSize={18}
          fontWeight={600}
          pointerEvents="none"
        >
          {visual.title}
          {visual.showUnits && commonUnit ? ` (${commonUnit})` : ''}
        </text>
      )}

      {/* Grid Bands / Lines */}
      {validScale && (
        <g data-testid={`bar-chart-grid-${visual.gridMode}-${element.id}`} pointerEvents="none">
          {visual.gridMode === 'bands' &&
            Array.from({ length: tickCount }, (_, index) => {
              if (index % 2 === 0) return null;
              if (horizontal) {
                const startX = plotX + (index / tickCount) * plotWidth;
                const bandW = plotWidth / tickCount;
                return (
                  <rect
                    key={`band-${index}`}
                    x={startX}
                    y={plotY}
                    width={bandW}
                    height={plotHeight}
                    fill="var(--chart-band, rgba(128, 128, 128, 0.08))"
                  />
                );
              }
              const startY = plotY + (index / tickCount) * plotHeight;
              const bandH = plotHeight / tickCount;
              return (
                <rect
                  key={`band-${index}`}
                  x={plotX}
                  y={startY}
                  width={plotWidth}
                  height={bandH}
                  fill="var(--chart-band, rgba(128, 128, 128, 0.08))"
                />
              );
            })}

          {visual.gridMode === 'lines' &&
            tickValues.map((val, index) => {
              const ratio = (val - scaleMin) / scaleSpan;
              if (horizontal) {
                const effectiveRatio = visual.invertScale ? 1 - ratio : ratio;
                const x = plotX + effectiveRatio * plotWidth;
                return (
                  <line
                    key={`grid-${index}`}
                    x1={x}
                    y1={plotY}
                    x2={x}
                    y2={plotY + plotHeight}
                    stroke="var(--border-color, rgba(128, 128, 128, 0.35))"
                    strokeDasharray="2 2"
                  />
                );
              }
              const effectiveRatio = visual.invertScale ? ratio : 1 - ratio;
              const y = plotY + effectiveRatio * plotHeight;
              return (
                <line
                  key={`grid-${index}`}
                  x1={plotX}
                  y1={y}
                  x2={plotX + plotWidth}
                  y2={y}
                  stroke="var(--border-color, rgba(128, 128, 128, 0.35))"
                  strokeDasharray="2 2"
                />
              );
            })}
        </g>
      )}

      {/* Axis Lines and Ticks */}
      {validScale && (
        <g pointerEvents="none">
          {horizontal ? (
            <>
              {/* Bottom horizontal axis */}
              <line x1={plotX} y1={plotY + plotHeight} x2={plotX + plotWidth} y2={plotY + plotHeight} stroke={fgColor} strokeWidth={2} />
              {/* Left vertical axis */}
              <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotHeight} stroke={fgColor} strokeWidth={2} />
              {/* Ticks and scale labels */}
              {showScale && tickValues.map((val, index) => {
                const ratio = (val - scaleMin) / scaleSpan;
                const effectiveRatio = visual.invertScale ? 1 - ratio : ratio;
                const x = plotX + effectiveRatio * plotWidth;
                return (
                  <g key={`tick-${index}`}>
                    <line x1={x} y1={plotY + plotHeight} x2={x} y2={plotY + plotHeight + 6} stroke={fgColor} strokeWidth={1.5} />
                    <text
                      x={x}
                      y={plotY + plotHeight + 22}
                      textAnchor="middle"
                      fontSize={15}
                      fontWeight={500}
                      fill={fgColor}
                      stroke="none"
                    >
                      {formatBarChartValue(val, visual)}
                    </text>
                  </g>
                );
              })}
            </>
          ) : (
            <>
              {/* Left vertical axis */}
              <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotHeight} stroke={fgColor} strokeWidth={2} />
              {/* Bottom horizontal axis */}
              <line x1={plotX} y1={plotY + plotHeight} x2={plotX + plotWidth} y2={plotY + plotHeight} stroke={fgColor} strokeWidth={2} />
              {/* Ticks and scale labels */}
              {showScale && tickValues.map((val, index) => {
                const ratio = (val - scaleMin) / scaleSpan;
                const effectiveRatio = visual.invertScale ? ratio : 1 - ratio;
                const y = plotY + effectiveRatio * plotHeight;
                return (
                  <g key={`tick-${index}`}>
                    <line x1={plotX - 6} y1={y} x2={plotX} y2={y} stroke={fgColor} strokeWidth={1.5} />
                    <text
                      x={plotX - 10}
                      y={y + 5}
                      textAnchor="end"
                      fontSize={15}
                      fontWeight={500}
                      fill={fgColor}
                      stroke="none"
                    >
                      {formatBarChartValue(val, visual)}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </g>
      )}

      {/* Bars and Item Labels */}
      {items.map((item, index) => {
        const consumerId = getBarChartItemConsumerId(element.id, item.binding);
        const runtimeState = runtimeStates?.get(consumerId);
        const rawValue = runtimeState?.result?.value;
        const numValue = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : undefined;
        const unit = runtimeState?.result?.unit ?? item.engineeringUnit ?? '';
        const timestamp = runtimeState?.result?.timestamp;
        const displayName = resolveBarChartItemLabel(item, visual.labelMode);
        const formattedVal = numValue !== undefined ? formatBarChartValue(numValue, visual) : runtimeState?.status === 'loading' ? '...' : '--';

        const tooltipText = `${displayName}\n${formattedVal}${unit ? ` ${unit}` : ''}${timestamp ? `\n${formatTimestamp(timestamp)}` : ''}`;

        if (horizontal) {
          const slotHeight = plotHeight / itemCount;
          const barH = Math.max(14, Math.min(58, slotHeight * 0.72));
          const slotCenterY = plotY + (index + 0.5) * slotHeight;
          const barY = slotCenterY - barH / 2;

          let barX = plotX;
          let barW = 0;

          if (numValue !== undefined && validScale) {
            const clamped = Math.max(scaleMin, Math.min(scaleMax, numValue));
            const valRatio = (clamped - scaleMin) / scaleSpan;

            const effectiveBaseRatio = visual.invertScale ? 1 - baseRatio : baseRatio;
            const effectiveValRatio = visual.invertScale ? 1 - valRatio : valRatio;

            const startX = plotX + Math.min(effectiveBaseRatio, effectiveValRatio) * plotWidth;
            const endX = plotX + Math.max(effectiveBaseRatio, effectiveValRatio) * plotWidth;
            barX = startX;
            barW = Math.max(2, endX - startX);
          }

          return (
            <g key={`bar-group-${index}`} data-testid={`bar-chart-bar-group-${element.id}-${index}`}>
              <title>{tooltipText}</title>

              {/* Label and Value on the left */}
              {visual.showLabel && (
                <text
                  x={plotX - 12}
                  y={visual.showValue ? slotCenterY - 6 : slotCenterY + 6}
                  textAnchor="end"
                  fill={fgColor}
                  fontSize={16}
                  fontWeight={500}
                  data-testid={`bar-chart-label-${element.id}-${index}`}
                  pointerEvents="none"
                >
                  {displayName}
                </text>
              )}
              {visual.showValue && (
                <text
                  x={plotX - 12}
                  y={visual.showLabel ? slotCenterY + 17 : slotCenterY + 6}
                  textAnchor="end"
                  fill={valColor}
                  fontSize={16}
                  fontWeight={600}
                  data-testid={`bar-chart-value-${element.id}-${index}`}
                  pointerEvents="none"
                >
                  {formattedVal}
                  {visual.showUnits && unit && !commonUnit ? ` ${unit}` : ''}
                </text>
              )}

              {/* Bar Rect */}
              {numValue !== undefined && validScale && barW > 0 && (
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx={3}
                  fill={visual.barColor}
                  data-testid={`bar-chart-bar-${element.id}-${index}`}
                  pointerEvents="all"
                />
              )}
            </g>
          );
        }

        // Vertical Orientation
        const slotWidth = plotWidth / itemCount;
        const barW = Math.max(16, Math.min(88, slotWidth * 0.74));
        const slotCenterX = plotX + (index + 0.5) * slotWidth;
        const barX = slotCenterX - barW / 2;

        let barY = plotY + plotHeight;
        let barH = 0;

        if (numValue !== undefined && validScale) {
          const clamped = Math.max(scaleMin, Math.min(scaleMax, numValue));
          const valRatio = (clamped - scaleMin) / scaleSpan;

          const effectiveBaseRatio = visual.invertScale ? baseRatio : 1 - baseRatio;
          const effectiveValRatio = visual.invertScale ? valRatio : 1 - valRatio;

          const startY = plotY + Math.min(effectiveBaseRatio, effectiveValRatio) * plotHeight;
          const endY = plotY + Math.max(effectiveBaseRatio, effectiveValRatio) * plotHeight;
          barY = startY;
          barH = Math.max(2, endY - startY);
        }

        return (
          <g key={`bar-group-${index}`} data-testid={`bar-chart-bar-group-${element.id}-${index}`}>
            <title>{tooltipText}</title>

            {/* Bar Rect */}
            {numValue !== undefined && validScale && barH > 0 && (
              <rect
                x={barX}
                y={barY}
                width={barW}
                height={barH}
                rx={3}
                fill={visual.barColor}
                data-testid={`bar-chart-bar-${element.id}-${index}`}
                pointerEvents="all"
              />
            )}

            {/* Label and Value at the bottom */}
            {visual.showLabel && (
              <text
                x={slotCenterX}
                y={plotY + plotHeight + 22}
                textAnchor="middle"
                fill={fgColor}
                fontSize={16}
                fontWeight={500}
                data-testid={`bar-chart-label-${element.id}-${index}`}
                pointerEvents="none"
              >
                {displayName}
              </text>
            )}
            {visual.showValue && (
              <text
                x={slotCenterX}
                y={plotY + plotHeight + (visual.showLabel ? 44 : 22)}
                textAnchor="middle"
                fill={valColor}
                fontSize={16}
                fontWeight={600}
                data-testid={`bar-chart-value-${element.id}-${index}`}
                pointerEvents="none"
              >
                {formattedVal}
                {visual.showUnits && unit && !commonUnit ? ` ${unit}` : ''}
              </text>
            )}
          </g>
        );
      })}

      {!validScale && (
        <text
          x={plotX + plotWidth / 2}
          y={plotY + plotHeight / 2}
          textAnchor="middle"
          fill="#f2cc0c"
          fontSize={12}
          data-testid={`bar-chart-invalid-scale-${element.id}`}
          pointerEvents="none"
        >
          Escala inválida
        </text>
      )}
    </g>
  );
});

export function resolveBarChartItemLabel(item: BarChartItem, mode: BarChartVisualOptions['labelMode']): string {
  if (item.nameMode === 'custom' && item.customName?.trim()) {
    return item.customName.trim();
  }
  if (mode === 'tag' || mode === 'name') {
    return item.binding.pointName;
  }
  if (mode === 'description' && item.description?.trim()) {
    return item.description.trim();
  }
  if (mode === 'custom' && item.customName?.trim()) {
    return item.customName.trim();
  }
  return item.label?.trim() || item.description?.trim() || item.binding.pointName;
}

export function formatBarChartValue(value: number, visual: BarChartVisualOptions): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  if (visual.numberFormat === 'scientific') {
    const decimals = typeof visual.decimals === 'number' && Number.isFinite(visual.decimals) ? visual.decimals : 2;
    return value.toExponential(decimals).toUpperCase();
  }
  const decimals = typeof visual.decimals === 'number' && Number.isFinite(visual.decimals) ? visual.decimals : null;
  const fixed = decimals === null ? String(Number(value.toFixed(4))) : value.toFixed(decimals);
  if (visual.useThousandsSeparator) {
    const [intPart, decPart] = fixed.split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  }
  return fixed;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('pt-BR');
}
