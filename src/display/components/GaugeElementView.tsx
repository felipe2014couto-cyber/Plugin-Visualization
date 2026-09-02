import React from 'react';
import { isPiPointBinding } from '../../pi/piPointBinding';
import { getGaugeOptions, type GaugeElement, type GaugeStyle } from '../createGauge';
import { formatScaleValue, getScaleRatio } from '../scaleOptions';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { evaluateMultistate, getMultistateColor } from '../multistate';
import type { PiPointDatabaseLimits } from '../../pi/piPointBinding';
import { resolveThemeForeground } from '../themeColor';
import { formatValue } from './ValueElementView';

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
  const isLabelBelow = options.labelPosition === 'below';
  const isPointerOrLine = options.gaugeStyle === 'pointer' || options.gaugeStyle === 'line';
  const title = options.title.trim() || label || (binding && isPiPointBinding(binding) ? binding.pointName : '');
  const hasTitle = Boolean(title && options.showTagName);
  const cx = element.x + element.width / 2;

  // Position dial center, radius, value and title with compact, balanced spacing
  let cy: number;
  let maxRadiusByHeight: number;
  let titleY: number;
  let valueY: number;

  if (isPointerOrLine) {
    if (isLabelBelow) {
      // Dial is centered in upper portion, title sits right below arc opening, value right below title
      cy = element.y + element.height * 0.42;
      maxRadiusByHeight = element.height * 0.30;
      valueY = cy + maxRadiusByHeight + Math.max(20, element.height * 0.08);
      titleY = valueY + (hasTitle ? Math.max(20, element.height * 0.10) : 0);
    } else {
      // Title is above, dial is centered, value is directly below the dial opening
      cy = hasTitle ? element.y + element.height * 0.50 : element.y + element.height * 0.45;
      maxRadiusByHeight = hasTitle ? element.height * 0.28 : element.height * 0.32;
      titleY = element.y + Math.max(14, element.height * 0.08);
      valueY = cy + maxRadiusByHeight + Math.max(20, element.height * 0.08);
    }
  } else {
    // Arc and Triangle: value is centered inside the dial
    if (isLabelBelow) {
      cy = element.y + element.height * 0.46;
      maxRadiusByHeight = element.height * 0.34;
      titleY = element.y + element.height - Math.max(8, element.height * 0.05);
      valueY = cy + Math.max(4, Math.min(8, element.height * 0.035));
    } else {
      cy = hasTitle ? element.y + element.height * 0.56 : element.y + element.height * 0.50;
      maxRadiusByHeight = hasTitle ? element.height * 0.29 : element.height * 0.34;
      titleY = element.y + Math.max(14, element.height * 0.08);
      valueY = cy + Math.max(4, Math.min(8, element.height * 0.035));
    }
  }

  const maxRadiusByWidth = element.width * 0.36;
  const radius = Math.max(1, Math.min(maxRadiusByWidth, maxRadiusByHeight));

  const sweepAngle = options.gaugeAngle;
  const startAngle = 90 + (360 - sweepAngle) / 2;
  const track = arcPath(cx, cy, radius, startAngle, sweepAngle);
  const valueText = getValueText(binding, label, runtimeState, numericValue, options.decimals);
  const detailLines = getDetailLines(valueText, runtimeState, options.showValue, options.showUnit, false);
  const rawValue = runtimeState?.status === 'success' ? runtimeState.result.value : undefined;
  const activeColor = getMultistateColor(rawValue, element.properties.multistate, options.color);
  const blink = evaluateMultistate(rawValue, element.properties.multistate)?.rule.blink === true;
  const showGaugeScale = options.showScale && element.width >= 180 && element.height >= 160;
  const scaleColor = resolveThemeForeground(options.gaugeScaleColor);
  const borderColor = resolveThemeForeground(options.gaugeBorderColor);

  return (
    <g
      data-testid={`display-element-${element.id}`}
      data-element-id={element.id}
      data-element-type={element.type}
      style={{ cursor: 'move' }}
    >
      {blink && <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite" />}
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={14}
        fill="transparent"
        stroke="none"
        strokeWidth={0}
        data-testid={`gauge-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {hasTitle && (
        <text
          x={cx}
          y={titleY}
          textAnchor="middle"
          fill={scaleColor || DEFAULT_TEXT_COLOR}
          fontSize={Math.max(13, Math.min(20, element.height * 0.08))}
          fontWeight={500}
          pointerEvents="none"
        >
          {title}
        </text>
      )}
      <path d={track} fill="none" stroke={borderColor} strokeWidth={options.gaugeStyle === 'arc' ? 12 : 3} strokeLinecap="round" data-testid={`gauge-track-${element.id}`} pointerEvents="none" />
      {ratio !== undefined && options.gaugeStyle === 'arc' && (
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
      {renderIndicator(options.gaugeStyle, ratio, cx, cy, radius, activeColor, element.id, startAngle, sweepAngle)}
      {showGaugeScale && isValidScale(minimum, maximum) && Array.from({ length: 9 }, (_, index) => {
        if (options.scaleDisplay === 'endpoints' && index !== 0 && index !== 8) return null;
        const angle = startAngle + (sweepAngle * index) / 8;
        const outer = polar(cx, cy, radius + 5, angle);
        const inner = polar(cx, cy, radius - 3, angle);
        const labelPos = polar(cx, cy, radius + 18, angle);
        const tickValue = minimum + ((maximum - minimum) * index) / 8;
        return (
          <g key={`gauge-tick-${index}`} pointerEvents="none">
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={scaleColor} strokeWidth={1} />
            <text
              x={labelPos.x}
              y={labelPos.y + 4}
              textAnchor="middle"
              fill={scaleColor}
              fontSize={Math.max(11, Math.min(16, element.height * 0.065))}
            >
              {formatScaleValue(tickValue, (options.decimals !== null && options.decimals > 0) ? 0 : options.decimals, minimum, maximum)}
            </text>
          </g>
        );
      })}
      <text
        x={cx}
        y={valueY}
        textAnchor="middle"
        dominantBaseline={isPointerOrLine ? 'middle' : 'central'}
        fill={scaleColor || DEFAULT_TEXT_COLOR}
        fontSize={isPointerOrLine ? Math.max(13, Math.min(26, element.height * 0.13)) : Math.max(14, Math.min(32, element.height * 0.16))}
        fontWeight={600}
        data-testid={`gauge-value-${element.id}`}
        pointerEvents="none"
      >
        {detailLines.map((line, index) => (
          <tspan
            key={`${line}-${index}`}
            x={cx}
            dy={index === 0 ? 0 : Math.max(12, element.height * 0.07)}
            fontSize={index === 0 ? undefined : Math.max(10, Math.min(13, element.height * 0.06))}
            fontWeight={index === 0 ? 600 : 400}
          >
            {line}
          </tspan>
        ))}
      </text>
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
  // Valor textual (Calc Failed, Shutdown, estado digital, etc.)
  const rawValue = state?.result?.value;
  if (rawValue !== undefined && rawValue !== null) {
    return formatValue(rawValue);
  }
  return state?.status === 'error' ? 'BAD' : '--';
}

function isValidScale(minimum: number, maximum: number): boolean {
  return Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum;
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
