import React from 'react';
import { isPiPointBinding } from '../../pi/piPointBinding';
import { getBarOptions, type BarElement } from '../createBar';
import { formatScaleValue, getScaleRatio } from '../scaleOptions';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { getMultistateColor } from '../multistate';
import type { PiPointDatabaseLimits } from '../../pi/piPointBinding';
import { resolveThemeForeground } from '../themeColor';

export interface BarElementViewProps {
  element: BarElement;
  runtimeState?: ValueRuntimeState;
  databaseScale?: PiPointDatabaseLimits;
  label?: string;
}

export const BarElementView = React.memo(function BarElementView({ element, runtimeState, databaseScale, label }: BarElementViewProps) {
  const options = element.properties;
  const binding = options.binding;
  const barOptions = getBarOptions(element.properties);
  const value = getNumericValue(runtimeState);
  const minimum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero : options.minimum;
  const maximum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero + databaseScale.span : options.maximum;
  const ratio = value === undefined ? undefined : getScaleRatio(value, minimum, maximum);
  const horizontal = options.orientation === 'horizontal';
  const borderClearance = Math.max(0, barOptions.borderWidth);
  const leftPadding = 78 + borderClearance * 2;
  const rightPadding = 12;
  const plotX = element.x + leftPadding;
  // Horizontal bars reserve the header for the tag/value and the footer for X scale labels.
  const plotY = element.y + (horizontal ? 48 : 44) + borderClearance * 2;
  const plotWidth = Math.max(1, element.width - leftPadding - rightPadding);
  // Keep title, scale and value clear of thick borders.
  // Horizontal scale labels live below the track, so leave enough room for the
  // border stroke plus the tick labels instead of letting the stroke cover them.
  const plotHeight = Math.max(1, element.height - (horizontal ? 104 : 90) - borderClearance * 4);
  const fillWidth = horizontal && ratio !== undefined ? plotWidth * ratio : horizontal ? 0 : plotWidth;
  const fillHeight = !horizontal && ratio !== undefined ? plotHeight * ratio : !horizontal ? 0 : plotHeight;
  const valueText = getValueText(binding, label, runtimeState, value, options.decimals);
  const detailLines = getDetailLines(valueText, runtimeState, barOptions.showValue, barOptions.showUnit, false);
  const rawValue = runtimeState?.status === 'success' ? runtimeState.result.value : undefined;
  const activeColor = getMultistateColor(rawValue, options.multistate, barOptions.fillColor);
  const tagLabel = barOptions.tagNameMode === 'custom' && barOptions.customTagName.trim()
    ? barOptions.customTagName
    : label ?? (binding && isPiPointBinding(binding) ? binding.pointName : '');
  const barCenterX = plotX + plotWidth / 2;

  return (
    <g
      data-testid={`display-element-${element.id}`}
      data-element-id={element.id}
      data-element-type={element.type}
      style={{ cursor: 'move' }}
    >
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={14}
        fill="transparent"
        stroke="none"
        strokeWidth={0}
        data-testid={`bar-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {tagLabel && options.showTagName && (
        <text x={barCenterX} y={element.y + (horizontal ? 16 : 22)} textAnchor="middle" fill="var(--text-primary, rgba(255, 255, 255, 0.86))" fontSize={horizontal ? Math.max(16, Math.min(22, element.height * 0.16)) : 18} fontWeight={500} pointerEvents="none">
          {tagLabel}
        </text>
      )}
      {horizontal && (
        <text x={barCenterX} y={element.y + 42} textAnchor="middle" fill="var(--text-primary, rgba(255, 255, 255, 0.86))" fontSize={Math.max(14, Math.min(20, element.height * 0.13))} fontWeight={500} pointerEvents="none">
          {detailLines.map((line, index) => <tspan key={`${line}-${index}`} x={barCenterX} dy={index === 0 ? 0 : 16}>{line}</tspan>)}
        </text>
      )}
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} rx={0} fill={barOptions.backgroundColor} data-testid={`bar-track-${element.id}`} pointerEvents="none" />
      {options.showScale !== false && !horizontal && isValidScale(minimum, maximum) && Array.from({ length: 9 }, (_, index) => {
        const valueAtTick = minimum + ((maximum - minimum) * index) / 8;
        const y = plotY + plotHeight - (plotHeight * index) / 8;
        return <g key={`bar-scale-${index}`} pointerEvents="none"><line x1={plotX - 4 - borderClearance / 2} y1={y} x2={plotX - borderClearance / 2} y2={y} stroke="var(--text-primary)" /><text x={plotX - 14 - borderClearance} y={y + 6} textAnchor="end" fill="var(--text-primary)" fontSize={18} fontWeight={500}>{formatScaleValue(valueAtTick, options.decimals)}</text></g>;
      })}
      {options.showScale !== false && horizontal && isValidScale(minimum, maximum) && Array.from({ length: 9 }, (_, index) => {
        const valueAtTick = minimum + ((maximum - minimum) * index) / 8;
        const x = plotX + (plotWidth * index) / 8;
        const scaleY = plotY + plotHeight + borderClearance / 2 + 4;
        return <g key={`bar-scale-horizontal-${index}`} pointerEvents="none"><line x1={x} y1={scaleY} x2={x} y2={scaleY + 4} stroke="var(--text-primary)" /><text x={x} y={scaleY + 18} textAnchor="middle" fill="var(--text-primary)" fontSize={16} fontWeight={500}>{formatScaleValue(valueAtTick, options.decimals)}</text></g>;
      })}
      {ratio !== undefined && (
        <rect
          x={horizontal ? plotX : plotX}
          y={horizontal ? plotY : plotY + plotHeight - fillHeight}
          width={fillWidth}
          height={fillHeight}
          rx={3}
          fill={activeColor || barOptions.fillColor}
          data-testid={`bar-fill-${element.id}`}
          pointerEvents="none"
        />
      )}
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} rx={0} fill="none" stroke={resolveThemeForeground(barOptions.borderColor)} strokeWidth={barOptions.borderWidth} vectorEffect="non-scaling-stroke" data-testid={`bar-border-${element.id}`} pointerEvents="none" />
      <text x={barCenterX} y={element.y + element.height - 12} textAnchor="middle" fill="var(--text-primary, rgba(255, 255, 255, 0.86))" fontSize={Math.max(12, Math.min(24, element.height * 0.12))} data-testid={`bar-value-${element.id}`} pointerEvents="none">
        {!horizontal && detailLines.map((line, index) => <tspan key={`${line}-${index}`} x={barCenterX} dy={index === 0 ? 0 : -16}>{line}</tspan>)}
      </text>
      {!isValidScale(minimum, maximum) && (
        <text x={barCenterX} y={element.y + element.height / 2} textAnchor="middle" fill="#f2cc0c" fontSize={10} data-testid={`bar-invalid-scale-${element.id}`} pointerEvents="none">
          Escala inválida
        </text>
      )}
    </g>
  );
});

function getNumericValue(state: ValueRuntimeState | undefined): number | undefined {
  const value = state?.result?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getValueText(
  binding: BarElement['properties']['binding'],
  label: string | undefined,
  state: ValueRuntimeState | undefined,
  value: number | undefined,
  decimals: number | null,
): string {
  if (!binding && !label) {
    return 'Sem tag';
  }
  if (state?.status === 'loading') {
    return '...';
  }
  if (value !== undefined) {
    return formatScaleValue(value, decimals);
  }
  return state?.status === 'error' ? 'BAD' : '--';
}

function getDetailLines(valueText: string, state: ValueRuntimeState | undefined, showValue: boolean, showUnit: boolean, showTimestamp: boolean): string[] {
  const lines = showValue ? [valueText] : [];
  const result = state?.result;
  if (showUnit && result?.unit) {
    lines.push(result.unit);
  }
  if (showTimestamp && result?.timestamp) {
    lines.push(formatTimestamp(result.timestamp));
  }
  return lines;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('pt-BR');
}

function isValidScale(minimum: number, maximum: number): boolean {
  return Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum;
}
