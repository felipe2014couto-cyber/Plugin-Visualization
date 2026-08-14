import React from 'react';
import { isPiPointBinding } from '../../pi/piPointBinding';
import { getBarOptions, type BarElement } from '../createBar';
import { formatScaleValue, getScaleRatio } from '../scaleOptions';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { getMultistateColor } from '../multistate';
import type { PiPointDatabaseLimits } from '../../pi/piPointBinding';

export interface BarElementViewProps {
  element: BarElement;
  runtimeState?: ValueRuntimeState;
  databaseScale?: PiPointDatabaseLimits;
}

export const BarElementView = React.memo(function BarElementView({ element, runtimeState, databaseScale }: BarElementViewProps) {
  const options = element.properties;
  const binding = options.binding;
  const value = getNumericValue(runtimeState);
  const minimum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero : options.minimum;
  const maximum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero + databaseScale.span : options.maximum;
  const ratio = value === undefined ? undefined : getScaleRatio(value, minimum, maximum);
  const horizontal = options.orientation === 'horizontal';
  const leftPadding = 78;
  const rightPadding = 12;
  const plotX = element.x + leftPadding;
  const plotY = element.y + 42;
  const plotWidth = Math.max(1, element.width - leftPadding - rightPadding);
  // Reserve extra space below the bar so the value label does not touch the fill.
  const plotHeight = Math.max(1, element.height - 78);
  const fillWidth = horizontal && ratio !== undefined ? plotWidth * ratio : horizontal ? 0 : plotWidth;
  const fillHeight = !horizontal && ratio !== undefined ? plotHeight * ratio : !horizontal ? 0 : plotHeight;
  const valueText = getValueText(binding, runtimeState, value, options.decimals);
  const barOptions = getBarOptions(element.properties);
  const activeColor = getMultistateColor(value, options.multistate, barOptions.fillColor);
  const tagLabel = barOptions.tagNameMode === 'custom' && barOptions.customTagName.trim()
    ? barOptions.customTagName
    : binding && isPiPointBinding(binding) ? binding.pointName : '';

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
        fill="var(--element-bg, rgba(255, 255, 255, 0.06))"
        stroke="none"
        strokeWidth={0}
        data-testid={`bar-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {binding && isPiPointBinding(binding) && options.showTagName && (
        <text x={element.x + element.width / 2} y={element.y + 22} textAnchor="middle" fill="var(--text-primary, rgba(255, 255, 255, 0.86))" fontSize={18} fontWeight={500} pointerEvents="none">
          {tagLabel}
        </text>
      )}
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} rx={0} fill="var(--border-color, rgba(255, 255, 255, 0.12))" data-testid={`bar-track-${element.id}`} pointerEvents="none" />
      {options.showScale !== false && !horizontal && isValidScale(minimum, maximum) && Array.from({ length: 9 }, (_, index) => {
        const valueAtTick = minimum + ((maximum - minimum) * index) / 8;
        const y = plotY + plotHeight - (plotHeight * index) / 8;
        return <g key={`bar-scale-${index}`} pointerEvents="none"><line x1={plotX - 4} y1={y} x2={plotX} y2={y} stroke="var(--text-primary)" /><text x={plotX - 8} y={y + 6} textAnchor="end" fill="var(--text-primary)" fontSize={18} fontWeight={500}>{formatScaleValue(valueAtTick, options.decimals)}</text></g>;
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
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} rx={0} fill="none" stroke={barOptions.borderColor} strokeWidth={barOptions.borderWidth} vectorEffect="non-scaling-stroke" data-testid={`bar-border-${element.id}`} pointerEvents="none" />
      <text x={element.x + element.width / 2} y={element.y + element.height - 12} textAnchor="middle" fill="var(--text-primary, rgba(255, 255, 255, 0.86))" fontSize={Math.max(12, Math.min(24, element.height * 0.12))} data-testid={`bar-value-${element.id}`} pointerEvents="none">
        {options.showValue ? valueText : ''}
      </text>
      {!isValidScale(options.minimum, options.maximum) && (
        <text x={element.x + element.width / 2} y={element.y + element.height / 2} textAnchor="middle" fill="#f2cc0c" fontSize={10} data-testid={`bar-invalid-scale-${element.id}`} pointerEvents="none">
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
  state: ValueRuntimeState | undefined,
  value: number | undefined,
  decimals: number | null,
): string {
  if (!binding || !isPiPointBinding(binding)) {
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

function isValidScale(minimum: number, maximum: number): boolean {
  return Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum;
}
