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
  const padding = 12;
  const plotX = element.x + padding;
  const plotY = element.y + 34;
  const plotWidth = Math.max(1, element.width - padding * 2);
  // Reserve extra space below the bar so the value label does not touch the fill.
  const plotHeight = Math.max(1, element.height - 78);
  const fillWidth = horizontal && ratio !== undefined ? plotWidth * ratio : horizontal ? 0 : plotWidth;
  const fillHeight = !horizontal && ratio !== undefined ? plotHeight * ratio : !horizontal ? 0 : plotHeight;
  const valueText = getValueText(binding, runtimeState, value, options.decimals);
  const activeColor = getMultistateColor(value, options.multistate, getBarOptions(element.properties).color);

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
        stroke="var(--element-border, rgba(255, 255, 255, 0.35))"
        strokeWidth={1}
        data-testid={`bar-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {binding && isPiPointBinding(binding) && options.showTagName && (
        <text x={element.x + element.width / 2} y={element.y + 18} textAnchor="middle" fill="var(--text-primary, rgba(255, 255, 255, 0.86))" fontSize={12} pointerEvents="none">
          {binding.pointName}
        </text>
      )}
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} rx={3} fill="var(--border-color, rgba(255, 255, 255, 0.12))" data-testid={`bar-track-${element.id}`} pointerEvents="none" />
      {ratio !== undefined && (
        <rect
          x={horizontal ? plotX : plotX}
          y={horizontal ? plotY : plotY + plotHeight - fillHeight}
          width={fillWidth}
          height={fillHeight}
          rx={3}
          fill={activeColor}
          data-testid={`bar-fill-${element.id}`}
          pointerEvents="none"
        />
      )}
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
