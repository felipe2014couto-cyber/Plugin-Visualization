import React from 'react';
import { isPiPointBinding } from '../../pi/piPointBinding';
import { getGaugeOptions, type GaugeElement, type GaugeStyle } from '../createGauge';
import { formatScaleValue, getScaleRatio } from '../scaleOptions';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { getMultistateColor } from '../multistate';
import type { PiPointDatabaseLimits } from '../../pi/piPointBinding';

export interface GaugeElementViewProps {
  element: GaugeElement;
  runtimeState?: ValueRuntimeState;
  databaseScale?: PiPointDatabaseLimits;
  label?: string;
}

const DEFAULT_TEXT_COLOR = 'var(--text-primary, rgba(255, 255, 255, 0.86))';

export const GaugeElementView = React.memo(function GaugeElementView({ element, runtimeState, databaseScale, label }: GaugeElementViewProps) {
  const options = getGaugeOptions(element.properties);
  const binding = element.properties.binding;
  const numericValue = getNumericValue(runtimeState);
  const minimum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero : options.minimum;
  const maximum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero + databaseScale.span : options.maximum;
  const ratio = numericValue === undefined
    ? undefined
    : getScaleRatio(numericValue, minimum, maximum);
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height * 0.53;
  const radius = Math.max(1, Math.min(element.width * 0.37, element.height * 0.39));
  const sweepAngle = options.gaugeAngle;
  const startAngle = 90 + (360 - sweepAngle) / 2;
  const track = arcPath(cx, cy, radius, startAngle, sweepAngle);
  const valueText = getValueText(binding, label, runtimeState, numericValue, options.decimals);
  const detailLines = getDetailLines(valueText, runtimeState, options.showValue, options.showUnit, false);
  const activeColor = getMultistateColor(numericValue, element.properties.multistate, options.color);
  const valueY = options.labelPosition === 'below'
    ? element.y + element.height - 12
    : options.gaugeStyle === 'pointer' || options.gaugeStyle === 'line'
    ? element.y + element.height - 42
    : cy + 28;
  const showGaugeScale = element.width >= 180 && element.height >= 160;
  const scaleColor = options.gaugeScaleColor || '#ffffff';
  const borderColor = options.gaugeBorderColor || '#ffffff';
  const title = options.title.trim() || label || (binding && isPiPointBinding(binding) ? binding.pointName : '');
  const titleY = options.labelPosition === 'below' ? element.y + element.height - 52 : element.y + 20;

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
        stroke={borderColor}
        strokeWidth={1}
        data-testid={`gauge-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {title && options.showTagName && (
        <text x={cx} y={titleY} textAnchor="middle" fill={scaleColor || DEFAULT_TEXT_COLOR} fontSize={Math.max(15, Math.min(22, element.height * 0.085))} fontWeight={500} pointerEvents="none">
          {title}
        </text>
      )}
      <path d={track} fill="none" stroke={borderColor} strokeWidth={options.gaugeStyle === 'arc' ? 12 : 3} strokeLinecap="round" data-testid={`gauge-track-${element.id}`} pointerEvents="none" />
      {ratio !== undefined && (
        <path
          d={track}
          fill="none"
          stroke={activeColor}
          strokeWidth={options.gaugeStyle === 'arc' ? 12 : 3}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${ratio * 100} 100`}
          data-testid={`gauge-fill-${element.id}`}
          pointerEvents="none"
        />
      )}
      {renderIndicator(options.gaugeStyle, ratio, cx, cy, radius, activeColor, element.id, startAngle, sweepAngle)}
      {showGaugeScale && isValidScale(minimum, maximum) && Array.from({ length: 9 }, (_, index) => {
        if (options.scaleDisplay === 'endpoints' && index !== 0 && index !== 8) return null;
        const angle = startAngle + (sweepAngle * index) / 8;
        const outer = polar(cx, cy, radius + 5, angle);
        const inner = polar(cx, cy, radius - 3, angle);
        const label = polar(cx, cy, radius + 19, angle);
        const tickValue = minimum + ((maximum - minimum) * index) / 8;
        return <g key={`gauge-tick-${index}`} pointerEvents="none"><line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={scaleColor} strokeWidth={1} /><text x={label.x} y={label.y + 5} textAnchor="middle" fill={scaleColor} fontSize={Math.max(13, Math.min(18, element.height * 0.07))}>{formatScaleValue(tickValue, options.decimals)}</text></g>;
      })}
      <text x={cx} y={valueY} textAnchor="middle" fill={scaleColor || DEFAULT_TEXT_COLOR} fontSize={Math.max(12, Math.min(28, element.height * 0.14))} data-testid={`gauge-value-${element.id}`} pointerEvents="none">
        {detailLines.map((line, index) => <tspan key={`${line}-${index}`} x={cx} dy={index === 0 ? 0 : 16}>{line}</tspan>)}
      </text>
      {showGaugeScale && options.labelPosition !== 'below' && <text x={element.x + 10} y={element.y + element.height - 10} fill={scaleColor} fontSize={Math.max(13, Math.min(18, element.height * 0.07))} data-testid={`gauge-min-${element.id}`} pointerEvents="none">
        {formatScale(minimum)}
      </text>}
      {showGaugeScale && options.labelPosition !== 'below' && <text x={element.x + element.width - 10} y={element.y + element.height - 10} textAnchor="end" fill={scaleColor} fontSize={Math.max(13, Math.min(18, element.height * 0.07))} data-testid={`gauge-max-${element.id}`} pointerEvents="none">
        {formatScale(maximum)}
      </text>}
      {!isValidScale(minimum, maximum) && (
        <text x={cx} y={element.y + element.height - 28} textAnchor="middle" fill="#f2cc0c" fontSize={10} data-testid={`gauge-invalid-scale-${element.id}`} pointerEvents="none">
          Escala inválida
        </text>
      )}
    </g>
  );
});

function arcPath(cx: number, cy: number, radius: number, startAngle: number, sweepAngle: number): string {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, startAngle + sweepAngle);
  if (sweepAngle >= 359) {
    const opposite = polar(cx, cy, radius, startAngle + 180);
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${opposite.x} ${opposite.y} A ${radius} ${radius} 0 1 1 ${start.x} ${start.y}`;
  }
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + Math.cos(radians) * radius, y: cy + Math.sin(radians) * radius };
}

function renderIndicator(style: GaugeStyle, ratio: number | undefined, cx: number, cy: number, radius: number, color: string, id: string, startAngle: number, sweepAngle: number): React.ReactNode {
  if (ratio === undefined || style === 'arc') {
    return null;
  }
  const angle = startAngle + sweepAngle * ratio;
  const point = polar(cx, cy, radius * 0.82, angle);
  if (style === 'triangle') {
    const tip = polar(cx, cy, radius * 0.96, angle);
    const left = polar(cx, cy, radius * 0.72, angle - 7);
    const right = polar(cx, cy, radius * 0.72, angle + 7);
    return <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`} fill={color} data-testid={`gauge-needle-${id}`} pointerEvents="none" />;
  }
  return <g data-testid={`gauge-needle-${id}`} pointerEvents="none"><line x1={cx} y1={cy} x2={point.x} y2={point.y} stroke={color} strokeWidth={style === 'pointer' ? 7 : 3} strokeLinecap="round" /><circle cx={cx} cy={cy} r={style === 'pointer' ? 8 : 3} fill={color} /></g>;
}

function getNumericValue(state: ValueRuntimeState | undefined): number | undefined {
  const value = state?.result?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getValueText(
  binding: GaugeElement['properties']['binding'],
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

function isValidScale(minimum: number, maximum: number): boolean {
  return Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum;
}

function formatScale(value: number): string {
  return Number.isFinite(value) ? String(value) : '--';
}

function getDetailLines(valueText: string, state: ValueRuntimeState | undefined, showValue: boolean, showUnit: boolean, showTimestamp: boolean): string[] {
  const lines = showValue ? [valueText] : [];
  const result = state?.result;
  if (showUnit && result?.unit) lines.push(result.unit);
  if (showTimestamp && result?.timestamp) lines.push(formatTimestamp(result.timestamp));
  return lines;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('pt-BR');
}
