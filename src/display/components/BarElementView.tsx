import React from 'react';
import { formatValue } from './ValueElementView';
import { isPiPointBinding } from '../../pi/piPointBinding';
import { getBarOptions, type BarElement } from '../createBar';
import { formatScaleValue, getScaleRatio } from '../scaleOptions';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import { evaluateMultistate, getMultistateColor } from '../multistate';
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
  // Displays criados antes da opção de cor do preenchimento não possuem essa
  // propriedade. Nesse caso o trilho deve acompanhar o tema ativo; uma cor
  // escolhida explicitamente pelo usuário continua sendo preservada.
  const trackColor = typeof element.properties.backgroundColor === 'string'
    ? barOptions.backgroundColor
    : 'var(--surface-secondary, #2d3b4f)';
  const value = getNumericValue(runtimeState);
  const minimum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero : options.minimum;
  const maximum = options.scaleMode === 'database' && databaseScale ? databaseScale.zero + databaseScale.span : options.maximum;
  const ratio = value === undefined ? undefined : getScaleRatio(value, minimum, maximum);
  const horizontal = options.orientation === 'horizontal';
  const isPiVisionCompactGauge = options._piVisionCompactGauge === true;
  const borderClearance = Math.max(0, barOptions.borderWidth);
  // Os vertical gauges do PI Vision podem ter somente ~70 px de largura. O
  // layout generico reserva 78 px para a escala e deixava o trilho sem area.
  const leftPadding = isPiVisionCompactGauge ? 16 + borderClearance : 78 + borderClearance * 2;
  const rightPadding = isPiVisionCompactGauge ? 4 + borderClearance : 12;
  const plotX = element.x + leftPadding;
  // Horizontal bars reserve the header for the tag/value and the footer for X scale labels.
  const plotY = element.y + (isPiVisionCompactGauge ? 30 : horizontal ? 48 : 44) + borderClearance * 2;
  const plotWidth = Math.max(1, element.width - leftPadding - rightPadding);
  // Keep title, scale and value clear of thick borders.
  // Horizontal scale labels live below the track, so leave enough room for the
  // border stroke plus the tick labels instead of letting the stroke cover them.
  const plotHeight = Math.max(1, element.height - (isPiVisionCompactGauge ? 48 : horizontal ? 104 : 90) - borderClearance * 4);
  const startRatio = options.barStartMode === 'custom' && typeof options.barStartValue === 'number'
    ? getScaleRatio(options.barStartValue, minimum, maximum) ?? 0
    : 0;
  
  const activeRatio = ratio ?? 0;
  const minRatio = Math.min(startRatio, activeRatio);
  const maxRatio = Math.max(startRatio, activeRatio);

  const fillWidth = horizontal && ratio !== undefined ? plotWidth * (maxRatio - minRatio) : horizontal ? 0 : plotWidth;
  const fillHeight = !horizontal && ratio !== undefined ? plotHeight * (maxRatio - minRatio) : !horizontal ? 0 : plotHeight;
  const fillX = horizontal ? plotX + plotWidth * minRatio : plotX;
  const fillY = !horizontal ? plotY + plotHeight - plotHeight * maxRatio : plotY;
  const valueText = getValueText(binding, label, runtimeState, value, options.decimals);
  const detailLines = getDetailLines(valueText, runtimeState, barOptions.showValue, barOptions.showUnit, false);
  const scaleTickCount = getScaleTickCount(horizontal ? plotWidth : plotHeight, horizontal ? 44 : 34);
  const rawValue = runtimeState?.status === 'success' ? runtimeState.result.value : undefined;
  const activeColor = getMultistateColor(rawValue, options.multistate, barOptions.fillColor);
  const blink = evaluateMultistate(rawValue, options.multistate)?.rule.blink === true;
  const borderColor = resolveThemeForeground(barOptions.borderColor);
  const tagLabel = barOptions.tagNameMode === 'custom' && barOptions.customTagName.trim()
    ? barOptions.customTagName
    : label ?? (binding && isPiPointBinding(binding) ? binding.pointName : '');
  const barCenterX = plotX + plotWidth / 2;
  // Reserve a dedicated header area: the label stays at the top and the value
  // occupies the gap immediately above the track, without touching either.
  const horizontalTitleY = element.y + 16;
  const horizontalValueY = plotY - 8;
  const horizontalDetailLineHeight = Math.max(12, Math.min(16, element.height * 0.1));

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
        data-testid={`bar-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {tagLabel && options.showTagName && (
        <text x={barCenterX} y={isPiVisionCompactGauge ? element.y + 12 : horizontal ? horizontalTitleY : element.y + 22} textAnchor="middle" fill={borderColor} style={{ fill: borderColor }} fontSize={isPiVisionCompactGauge ? Math.max(8, Math.min(12, element.width * 0.16)) : horizontal ? Math.max(16, Math.min(22, element.height * 0.16)) : 18} fontWeight={500} pointerEvents="none">
          {tagLabel}
        </text>
      )}
      {horizontal && (
        <g pointerEvents="none">
          {detailLines.map((line, index) => (
            <text
              key={`${line}-${index}`}
              x={barCenterX}
              y={horizontalValueY - ((detailLines.length - index - 1) * horizontalDetailLineHeight)}
              textAnchor="middle"
              fill={borderColor}
              style={{ fill: borderColor }}
              fontSize={Math.max(12, Math.min(16, element.height * 0.11))}
              fontWeight={500}
              data-testid={`bar-horizontal-detail-${element.id}-${index}`}
            >
              {line}
            </text>
          ))}
        </g>
      )}
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} rx={0} fill={trackColor} data-testid={`bar-track-${element.id}`} pointerEvents="none" />
      {options.showScale !== false && !horizontal && isValidScale(minimum, maximum) && Array.from({ length: scaleTickCount }, (_, index) => {
        const denominator = scaleTickCount - 1;
        const valueAtTick = minimum + ((maximum - minimum) * index) / denominator;
        const y = plotY + plotHeight - (plotHeight * index) / denominator;
        return <g key={`bar-scale-${index}`} pointerEvents="none"><line x1={plotX - 4 - borderClearance / 2} y1={y} x2={plotX - borderClearance / 2} y2={y} stroke={borderColor} style={{ stroke: borderColor }} /><text x={plotX - (isPiVisionCompactGauge ? 5 : 14) - borderClearance} y={y + (isPiVisionCompactGauge ? 3 : 6)} textAnchor="end" fill={borderColor} style={{ fill: borderColor }} fontSize={isPiVisionCompactGauge ? Math.max(6, Math.min(9, element.width * 0.12)) : 18} fontWeight={500}>{formatScaleValue(valueAtTick, (options.decimals !== null && options.decimals > 0) ? 0 : options.decimals, minimum, maximum)}</text></g>;
      })}
      {options.showScale !== false && horizontal && isValidScale(minimum, maximum) && Array.from({ length: scaleTickCount }, (_, index) => {
        const denominator = scaleTickCount - 1;
        const valueAtTick = minimum + ((maximum - minimum) * index) / denominator;
        const x = plotX + (plotWidth * index) / denominator;
        const scaleY = plotY + plotHeight + borderClearance / 2 + 4;
        return <g key={`bar-scale-horizontal-${index}`} pointerEvents="none"><line x1={x} y1={scaleY} x2={x} y2={scaleY + 4} stroke={borderColor} style={{ stroke: borderColor }} /><text x={x} y={scaleY + 18} textAnchor="middle" fill={borderColor} style={{ fill: borderColor }} fontSize={16} fontWeight={500}>{formatScaleValue(valueAtTick, (options.decimals !== null && options.decimals > 0) ? 0 : options.decimals, minimum, maximum)}</text></g>;
      })}
      {ratio !== undefined && (
        <rect
          x={fillX}
          y={fillY}
          width={fillWidth}
          height={fillHeight}
          rx={3}
          fill={activeColor || barOptions.fillColor}
          data-testid={`bar-fill-${element.id}`}
          pointerEvents="none"
        />
      )}
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} rx={0} fill="none" stroke={resolveThemeForeground(barOptions.borderColor)} strokeWidth={barOptions.borderWidth} vectorEffect="non-scaling-stroke" data-testid={`bar-border-${element.id}`} pointerEvents="none" />
      <text x={barCenterX} y={element.y + element.height - (isPiVisionCompactGauge ? 3 : 12)} textAnchor="middle" fill={borderColor} style={{ fill: borderColor }} fontSize={isPiVisionCompactGauge ? Math.max(7, Math.min(11, element.width * 0.15)) : Math.max(12, Math.min(24, element.height * 0.12))} data-testid={`bar-value-${element.id}`} pointerEvents="none">
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
  // Valor textual (Calc Failed, Shutdown, estado digital, etc.)
  const rawValue = state?.result?.value;
  if (rawValue !== undefined && rawValue !== null) {
    return formatValue(rawValue);
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

/** Keep scale labels readable by reducing the number of ticks on small bars. */
function getScaleTickCount(axisLength: number, minimumLabelSpacing: number): number {
  if (!Number.isFinite(axisLength) || axisLength <= 0) {
    return 2;
  }
  return Math.max(2, Math.min(9, Math.floor(axisLength / minimumLabelSpacing) + 1));
}
