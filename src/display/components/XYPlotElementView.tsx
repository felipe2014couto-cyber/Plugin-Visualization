import React, { useMemo } from 'react';
import type { PiPointDatabaseLimits } from '../../pi/piPointBinding';
import {
  getXYPlotYSeries,
  type XYMarkerStyle,
  type XYPlotElement,
  type XYPlotYSeries,
} from '../createXYPlot';
import { linearRegression, pairXYByPosition, pairXYByTimestamp, pearsonCorrelation } from '../xyPlotMath';
import type { TrendRuntimeState } from '../runtime/trendRuntime';

export interface XYPlotElementViewProps {
  element: XYPlotElement;
  xState?: TrendRuntimeState;
  yStates?: readonly (TrendRuntimeState | undefined)[];
  xDatabaseScale?: PiPointDatabaseLimits;
  yDatabaseScales?: readonly (PiPointDatabaseLimits | undefined)[];
}

interface ScaleRange { min: number; max: number; }
const colors = ['#6e9fff', '#f59e0b', '#22c55e', '#e879f9', '#22d3ee'];

export function XYPlotElementView({ element, xState, yStates = [], xDatabaseScale, yDatabaseScales = [] }: XYPlotElementViewProps) {
  const { x, y, width, height, properties } = element;
  const series = getXYPlotYSeries(properties);
  const data = useMemo(() => series.map((item, index) => {
    const state = yStates[index];
    const points = xState?.status === 'success' && state?.status === 'success'
      ? item.pairing === 'position'
        ? pairXYByPosition(xState.data.points, state.data.points)
        : pairXYByTimestamp(xState.data.points, state.data.points, item.timestampMatch)
      : [];
    return { item, points, color: item.color ?? colors[index % colors.length] };
  }), [series, xState, yStates]);

  const all = data.flatMap((entry) => entry.points);
  const padding = { left: 48, right: properties.showLegend === false ? 16 : 112, top: properties.showTitle === false ? 12 : 26, bottom: 30 };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const xRange = resolveScale(all.map((point) => point.x), properties.xScaleMode, properties.xMin, properties.xMax, xDatabaseScale);
  const individualYRanges = data.map((entry, index) => resolveScale(entry.points.map((point) => point.y), entry.item.scaleMode, entry.item.min, entry.item.max, yDatabaseScales[index]));
  const sharedYRange = combineRanges(individualYRanges);
  const scaleX = (value: number) => x + padding.left + ((value - xRange.min) / (xRange.max - xRange.min || 1)) * plotWidth;
  const scaleY = (value: number, range: ScaleRange) => y + padding.top + plotHeight - ((value - range.min) / (range.max - range.min || 1)) * plotHeight;
  const hasError = xState?.status === 'error' || yStates.some((state) => state?.status === 'error');

  return <g data-element-id={element.id} data-element-type="xy-plot">
    <rect x={x} y={y} width={width} height={height} rx={8} fill={properties.backgroundColor ?? 'var(--surface-elevated,#111b28)'} stroke="var(--border-color,#334155)" />
    {properties.showTitle !== false && <text x={x + width / 2} y={y + 17} textAnchor="middle" fill="var(--text-primary,#e5e7eb)" fontSize="12" fontWeight="600">{properties.title || 'XY Plot'}</text>}
    <line x1={x + padding.left} y1={y + padding.top + plotHeight} x2={x + padding.left + plotWidth} y2={y + padding.top + plotHeight} stroke="var(--text-secondary,#94a3b8)" />
    <line x1={x + padding.left} y1={y + padding.top} x2={x + padding.left} y2={y + padding.top + plotHeight} stroke="var(--text-secondary,#94a3b8)" />
    {properties.showGrid !== false && [.25, .5, .75].map((position) => <line key={position} x1={x + padding.left} y1={y + padding.top + plotHeight * position} x2={x + padding.left + plotWidth} y2={y + padding.top + plotHeight * position} stroke="var(--border-color,#334155)" opacity=".55" />)}
    {data.map(({ item, points, color }, index) => {
      const range = properties.multipleYScales ? individualYRanges[index] : sharedYRange;
      const path = points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'}${scaleX(point.x)},${scaleY(point.y, range)}`).join(' ');
      const regression = item.regression ? linearRegression(points) : undefined;
      const correlation = item.correlation ? pearsonCorrelation(points) : undefined;
      return <g key={`${item.binding.dataSourceUid}-${item.binding.serverPath}-${item.binding.pointName}`}>
        {item.connectLine && <path d={path} fill="none" stroke={color} strokeWidth="1.25" />}
        {points.map((point, pointIndex) => <Marker
          key={`${point.time}-${pointIndex}`}
          marker={item.marker ?? 'circle'}
          x={scaleX(point.x)}
          y={scaleY(point.y, range)}
          color={pointIndex >= points.length - (item.recentCount ?? 0) && item.recentColor ? item.recentColor : color}
        />)}
        {regression && <line x1={scaleX(xRange.min)} y1={scaleY(regression.slope * xRange.min + regression.intercept, range)} x2={scaleX(xRange.max)} y2={scaleY(regression.slope * xRange.max + regression.intercept, range)} stroke={color} strokeDasharray="4 3" />}
        {properties.showLegend !== false && <text x={x + padding.left + plotWidth + 8} y={y + padding.top + 15 + index * 18} fill={color} fontSize="10">{item.label ?? item.binding.pointName}{correlation === undefined ? '' : ` r = ${correlation.toFixed(3)}`}</text>}
      </g>;
    })}
    {all.length > 0 ? <>
      <text x={x + padding.left} y={y + height - 10} fill="var(--text-secondary,#94a3b8)" fontSize="9">{formatNumber(xRange.min, properties.format)}</text>
      <text x={x + padding.left + plotWidth} y={y + height - 10} textAnchor="end" fill="var(--text-secondary,#94a3b8)" fontSize="9">{formatNumber(xRange.max, properties.format)}</text>
      <text x={x + padding.left - 5} y={y + padding.top + 4} textAnchor="end" fill="var(--text-secondary,#94a3b8)" fontSize="9">{formatNumber(sharedYRange.max, properties.format)}</text>
      <text x={x + padding.left - 5} y={y + padding.top + plotHeight} textAnchor="end" fill="var(--text-secondary,#94a3b8)" fontSize="9">{formatNumber(sharedYRange.min, properties.format)}</text>
    </> : <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="var(--text-secondary,#94a3b8)" fontSize="12">{hasError ? 'Não foi possível carregar os dados' : series.length ? 'Carregando dados…' : 'Arraste uma PI Tag para o eixo Y'}</text>}
  </g>;
}

function resolveScale(values: readonly number[], mode: XYPlotYSeries['scaleMode'], customMin?: number, customMax?: number, database?: PiPointDatabaseLimits): ScaleRange {
  if (mode === 'custom' && typeof customMin === 'number' && typeof customMax === 'number' && Number.isFinite(customMin) && Number.isFinite(customMax) && customMin < customMax) return { min: customMin, max: customMax };
  if (mode === 'database' && database && typeof database.zero === 'number' && typeof database.span === 'number' && Number.isFinite(database.zero) && Number.isFinite(database.span) && database.span > 0) return { min: database.zero, max: database.zero + database.span };
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: 0, max: 1 };
  const min = Math.min(...finite); const max = Math.max(...finite);
  if (min === max) return { min: min - .5, max: max + .5 };
  return { min, max };
}
function combineRanges(ranges: readonly ScaleRange[]): ScaleRange { return ranges.length ? { min: Math.min(...ranges.map((range) => range.min)), max: Math.max(...ranges.map((range) => range.max)) } : { min: 0, max: 1 }; }
function formatNumber(value: number, format: unknown) { return format === 'scientific' ? value.toExponential(2) : Number(value.toPrecision(5)).toString(); }

function Marker({ marker, x, y, color }: { marker: XYMarkerStyle; x: number; y: number; color: string }) {
  if (marker === 'square') return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill={color} />;
  if (marker === 'diamond') return <path d={`M ${x} ${y - 4.5} L ${x + 4.5} ${y} L ${x} ${y + 4.5} L ${x - 4.5} ${y} Z`} fill={color} />;
  if (marker === 'triangle') return <path d={`M ${x} ${y - 4.5} L ${x + 4.5} ${y + 3.5} L ${x - 4.5} ${y + 3.5} Z`} fill={color} />;
  if (marker === 'cross') return <path d={`M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${y + 4}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />;
  return <circle cx={x} cy={y} r="3.5" fill={color} />;
}
