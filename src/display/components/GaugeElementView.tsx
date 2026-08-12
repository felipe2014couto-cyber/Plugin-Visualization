import React from 'react';
import { isPiPointBinding } from '../../pi/piPointBinding';
import { getGaugeOptions, type GaugeElement } from '../createGauge';
import { formatScaleValue, getScaleRatio } from '../scaleOptions';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { getMultistateColor } from '../multistate';

export interface GaugeElementViewProps {
  element: GaugeElement;
  runtimeState?: ValueRuntimeState;
}

const TRACK_COLOR = 'var(--border-color, rgba(255, 255, 255, 0.18))';
const TEXT_COLOR = 'var(--text-primary, rgba(255, 255, 255, 0.86))';

export const GaugeElementView = React.memo(function GaugeElementView({ element, runtimeState }: GaugeElementViewProps) {
  const options = element.properties;
  const binding = options.binding;
  const numericValue = getNumericValue(runtimeState);
  const ratio = numericValue === undefined
    ? undefined
    : getScaleRatio(numericValue, options.minimum, options.maximum);
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height * 0.68;
  const radius = Math.max(1, Math.min(element.width * 0.38, element.height * 0.42));
  const track = arcPath(cx, cy, radius);
  const valueText = getValueText(binding, runtimeState, numericValue, options.decimals);
  const activeColor = getMultistateColor(numericValue, options.multistate, getGaugeOptions(element.properties).color);

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
        data-testid={`gauge-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {binding && isPiPointBinding(binding) && options.showTagName && (
        <text x={cx} y={element.y + 18} textAnchor="middle" fill={TEXT_COLOR} fontSize={12} pointerEvents="none">
          {binding.pointName}
        </text>
      )}
      <path d={track} fill="none" stroke={TRACK_COLOR} strokeWidth={12} strokeLinecap="round" data-testid={`gauge-track-${element.id}`} pointerEvents="none" />
      {ratio !== undefined && (
        <path
          d={track}
          fill="none"
          stroke={activeColor}
          strokeWidth={12}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${ratio * 100} 100`}
          data-testid={`gauge-fill-${element.id}`}
          pointerEvents="none"
        />
      )}
      {ratio !== undefined && (
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(Math.PI - ratio * Math.PI) * radius * 0.78}
          y2={cy - Math.sin(Math.PI - ratio * Math.PI) * radius * 0.78}
          stroke={activeColor}
          strokeWidth={3}
          strokeLinecap="round"
          data-testid={`gauge-needle-${element.id}`}
          pointerEvents="none"
        />
      )}
      <text x={cx} y={cy + 28} textAnchor="middle" fill={TEXT_COLOR} fontSize={Math.max(12, Math.min(28, element.height * 0.14))} data-testid={`gauge-value-${element.id}`} pointerEvents="none">
        {options.showValue ? valueText : ''}
      </text>
      <text x={element.x + 10} y={element.y + element.height - 10} fill={TEXT_COLOR} fontSize={10} data-testid={`gauge-min-${element.id}`} pointerEvents="none">
        {formatScale(options.minimum)}
      </text>
      <text x={element.x + element.width - 10} y={element.y + element.height - 10} textAnchor="end" fill={TEXT_COLOR} fontSize={10} data-testid={`gauge-max-${element.id}`} pointerEvents="none">
        {formatScale(options.maximum)}
      </text>
      {!isValidScale(options.minimum, options.maximum) && (
        <text x={cx} y={element.y + element.height - 28} textAnchor="middle" fill="#f2cc0c" fontSize={10} data-testid={`gauge-invalid-scale-${element.id}`} pointerEvents="none">
          Escala inválida
        </text>
      )}
    </g>
  );
});

function arcPath(cx: number, cy: number, radius: number): string {
  return `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;
}

function getNumericValue(state: ValueRuntimeState | undefined): number | undefined {
  const value = state?.result?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getValueText(
  binding: GaugeElement['properties']['binding'],
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

function formatScale(value: number): string {
  return Number.isFinite(value) ? String(value) : '--';
}
