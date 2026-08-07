import React from 'react';
import type { TrendElement } from '../createTrend';
import type { TrendPoint } from '../../pi/piDataSource';
import type { TrendRuntimeState } from '../runtime/trendRuntime';
import { resolveTrendCursorValue, type TrendCursor } from '../runtime/trendCursor';
import type { DisplayTimeRange } from '../../time/timeRange';

export interface TrendElementViewProps {
  element: TrendElement;
  runtimeState?: TrendRuntimeState;
  cursors?: readonly TrendCursor[];
  cursorEnabled?: boolean;
  selectedCursorId?: string | null;
  onPlotPointerDown?: (
    event: React.PointerEvent<SVGRectElement>,
    elementId: string,
    chart: TrendChartModel,
  ) => void;
  onCursorPointerDown?: (
    event: React.PointerEvent<SVGLineElement>,
    elementId: string,
    cursor: TrendCursor,
    chart: TrendChartModel,
  ) => void;
  timeRange?: DisplayTimeRange;
  onDoubleClick?: (event: React.MouseEvent<SVGGElement>, elementId: string) => void;
}

const PLOT_MARGIN = { left: 48, right: 12, top: 30, bottom: 32 };
const GRID_COLOR = 'rgba(255, 255, 255, 0.14)';
const AXIS_COLOR = 'rgba(255, 255, 255, 0.45)';
const TEXT_COLOR = 'rgba(255, 255, 255, 0.82)';
const LINE_COLOR = '#6e9fff';

export function TrendElementView({
  element,
  runtimeState,
  cursors = [],
  cursorEnabled = true,
  selectedCursorId = null,
  onPlotPointerDown,
  onCursorPointerDown,
  timeRange,
  onDoubleClick,
}: TrendElementViewProps) {
  const state = runtimeState ?? { status: 'loading' as const };
  const data = state.status === 'success' || state.status === 'error' ? state.data : undefined;
  const cursorPointerDown = cursorEnabled ? onCursorPointerDown : undefined;
  const content = getTrendContent(
    element,
    state,
    data,
    cursorEnabled ? cursors : [],
    cursorEnabled ? selectedCursorId : null,
    cursorEnabled ? onPlotPointerDown : undefined,
    cursorPointerDown,
    timeRange,
  );

  return (
    <g
      data-testid={`display-element-${element.id}`}
      data-element-id={element.id}
      data-element-type={element.type}
      style={{ cursor: 'move' }}
      onDoubleClick={(event) => onDoubleClick?.(event, element.id)}
    >
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill="rgba(255, 255, 255, 0.06)"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth={1}
        data-testid={`trend-background-${element.id}`}
        data-element-id={element.id}
        pointerEvents="all"
      />
      {content}
    </g>
  );
}

function getTrendContent(
  element: TrendElement,
  state: TrendRuntimeState,
  data: { pointName: string; points: TrendPoint[] } | undefined,
  cursors: readonly TrendCursor[],
  selectedCursorId: string | null,
  onPlotPointerDown: TrendElementViewProps['onPlotPointerDown'],
  onCursorPointerDown: TrendElementViewProps['onCursorPointerDown'],
  timeRange: DisplayTimeRange | undefined,
): React.ReactNode {
  const title = (
    <text
      x={element.x + 10}
      y={element.y + 18}
      fill={TEXT_COLOR}
      fontSize={12}
      data-testid={`trend-title-${element.id}`}
      pointerEvents="none"
    >
      {element.properties.binding.pointName}
    </text>
  );

  if (state.status === 'loading') {
    return <>{title}<TrendMessage element={element} message="Carregando..." testId="trend-loading" /></>;
  }

  if (!data) {
    return <>{title}<TrendMessage element={element} message="BAD" testId="trend-error" /></>;
  }

  if (data.points.length === 0) {
    return <>{title}<TrendMessage element={element} message="Sem dados" testId="trend-empty" /></>;
  }

  const chart = buildTrendChart(element, data.points, timeRange);
  return (
    <>
      {title}
      <rect
        x={chart.plotX}
        y={chart.plotY}
        width={chart.plotWidth}
        height={chart.plotHeight}
        fill="rgba(0, 0, 0, 0.12)"
        data-testid={`trend-plot-${element.id}`}
        pointerEvents="all"
        onPointerDown={onPlotPointerDown ? (event) => onPlotPointerDown(event, element.id, chart) : undefined}
      />
      {chart.yTicks.map((tick) => (
        <g key={`y-${tick.value}`} pointerEvents="none">
          <line
            x1={chart.plotX}
            y1={tick.y}
            x2={chart.plotX + chart.plotWidth}
            y2={tick.y}
            stroke={GRID_COLOR}
            strokeWidth={1}
          />
          <text x={chart.plotX - 6} y={tick.y + 4} textAnchor="end" fill={TEXT_COLOR} fontSize={10}>
            {formatNumber(tick.value)}
          </text>
        </g>
      ))}
      <line
        x1={chart.plotX}
        y1={chart.plotY}
        x2={chart.plotX}
        y2={chart.plotY + chart.plotHeight}
        stroke={AXIS_COLOR}
        strokeWidth={1}
        data-testid={`trend-y-axis-${element.id}`}
        pointerEvents="none"
      />
      <line
        x1={chart.plotX}
        y1={chart.plotY + chart.plotHeight}
        x2={chart.plotX + chart.plotWidth}
        y2={chart.plotY + chart.plotHeight}
        stroke={AXIS_COLOR}
        strokeWidth={1}
        data-testid={`trend-x-axis-${element.id}`}
        pointerEvents="none"
      />
      {chart.xTicks.map((tick) => (
        <text
          key={`x-${tick.time}`}
          x={tick.x}
          y={chart.plotY + chart.plotHeight + 18}
          textAnchor="middle"
          fill={TEXT_COLOR}
          fontSize={10}
          pointerEvents="none"
        >
          {formatAxisTime(tick.time, chart.domainEnd - chart.domainStart)}
        </text>
      ))}
      <path
        d={chart.path}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        data-testid={`trend-line-${element.id}`}
        pointerEvents="none"
      />
      {chart.singlePoint && (
        <circle
          cx={chart.singlePoint.x}
          cy={chart.singlePoint.y}
          r={3}
          fill={LINE_COLOR}
          data-testid={`trend-point-${element.id}`}
          pointerEvents="none"
        />
      )}
      {cursors.map((cursor) => {
        const value = resolveTrendCursorValue(data.points, cursor.time);
        if (value === undefined) {
          return null;
        }
        const x = trendXForTime(chart, cursor.time);
        const selected = cursor.id === selectedCursorId;
        const labelAnchor = x > chart.plotX + chart.plotWidth / 2 ? 'end' : 'start';
        const labelX = labelAnchor === 'end' ? x - 4 : x + 4;
        return (
          <g key={cursor.id} data-testid={`trend-cursor-${element.id}-${cursor.id}`} aria-label={`Cursor ${formatCursorTime(cursor.time)}`}>
            <line
              x1={x}
              y1={chart.plotY}
              x2={x}
              y2={chart.plotY + chart.plotHeight}
              stroke={selected ? '#f2cc0c' : '#ff9830'}
              strokeWidth={selected ? 2 : 1}
              pointerEvents="none"
              data-testid={`trend-cursor-line-${element.id}-${cursor.id}`}
            />
            <line
              x1={x}
              y1={chart.plotY}
              x2={x}
              y2={chart.plotY + chart.plotHeight}
              stroke="transparent"
              strokeWidth={12}
              style={onCursorPointerDown ? { cursor: 'ew-resize' } : undefined}
              data-testid={`trend-cursor-hit-${element.id}-${cursor.id}`}
              aria-label={`Selecionar cursor ${formatCursorTime(cursor.time)}`}
              onPointerDown={onCursorPointerDown ? (event) => onCursorPointerDown(event, element.id, cursor, chart) : undefined}
            />
            <text
              x={labelX}
              y={chart.plotY + 12}
              textAnchor={labelAnchor}
              fill={selected ? '#f2cc0c' : '#ff9830'}
              fontSize={10}
              pointerEvents="none"
              data-testid={`trend-cursor-label-${element.id}-${cursor.id}`}
            >
              {formatCursorTime(cursor.time)} {formatNumber(value)}
            </text>
          </g>
        );
      })}
      {state.status === 'error' && (
        <text
          x={element.x + element.width - 10}
          y={element.y + 18}
          textAnchor="end"
          fill="#f2cc0c"
          fontSize={10}
          data-testid={`trend-refresh-error-${element.id}`}
          pointerEvents="none"
        >
          erro de atualização
        </text>
      )}
    </>
  );
}

function TrendMessage({
  element,
  message,
  testId,
}: {
  element: TrendElement;
  message: string;
  testId: string;
}) {
  return (
    <text
      x={element.x + element.width / 2}
      y={element.y + element.height / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={TEXT_COLOR}
      fontSize={12}
      data-testid={`${testId}-${element.id}`}
      pointerEvents="none"
    >
      {message}
    </text>
  );
}

export interface TrendChartModel {
  plotX: number;
  plotY: number;
  plotWidth: number;
  plotHeight: number;
  domainStart: number;
  domainEnd: number;
  path: string;
  yTicks: Array<{ value: number; y: number }>;
  xTicks: Array<{ time: number; x: number }>;
  singlePoint?: { x: number; y: number };
}

export function buildTrendChart(
  element: TrendElement,
  points: TrendPoint[],
  timeRange?: DisplayTimeRange,
): TrendChartModel {
  const plotX = element.x + PLOT_MARGIN.left;
  const plotY = element.y + PLOT_MARGIN.top;
  const plotWidth = Math.max(1, element.width - PLOT_MARGIN.left - PLOT_MARGIN.right);
  const plotHeight = Math.max(1, element.height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const values = points.map((point) => point.value);
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const valuePadding = valueMin === valueMax
    ? Math.max(Math.abs(valueMin) * 0.05, 1)
    : (valueMax - valueMin) * 0.05;
  const domainMin = valueMin - valuePadding;
  const domainMax = valueMax + valuePadding;
  const hasRequestedRange = timeRange
    && Number.isFinite(timeRange.from)
    && Number.isFinite(timeRange.to)
    && timeRange.from < timeRange.to;
  const firstTime = points[0].time;
  const lastTime = points[points.length - 1].time;
  const timePadding = firstTime === lastTime ? 30 * 60 * 1000 : (lastTime - firstTime) * 0.02;
  const domainStart = hasRequestedRange ? timeRange.from : firstTime - timePadding;
  const domainEnd = hasRequestedRange ? timeRange.to : lastTime + timePadding;
  const timeSpan = Math.max(1, domainEnd - domainStart);
  const xFor = (time: number) => {
    const boundedTime = Math.max(domainStart, Math.min(domainEnd, time));
    return plotX + ((boundedTime - domainStart) / timeSpan) * plotWidth;
  };
  const yFor = (value: number) => plotY + ((domainMax - value) / Math.max(1e-12, domainMax - domainMin)) * plotHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.time)} ${yFor(point.value)}`).join(' ');

  return {
    plotX,
    plotY,
    plotWidth,
    plotHeight,
    domainStart,
    domainEnd,
    path,
    yTicks: [0, 1, 2].map((index) => {
      const value = domainMax - ((domainMax - domainMin) * index) / 2;
      return { value, y: yFor(value) };
    }),
    xTicks: [0, 1, 2].map((index) => {
      const time = domainStart + ((domainEnd - domainStart) * index) / 2;
      return { time, x: xFor(time) };
    }),
    singlePoint: points.length === 1 ? { x: xFor(points[0].time), y: yFor(points[0].value) } : undefined,
  };
}

export function trendTimeForX(chart: TrendChartModel, x: number): number {
  const boundedX = Math.max(chart.plotX, Math.min(chart.plotX + chart.plotWidth, x));
  const ratio = (boundedX - chart.plotX) / chart.plotWidth;
  return chart.domainStart + (chart.domainEnd - chart.domainStart) * ratio;
}

export function trendXForTime(chart: TrendChartModel, time: number): number {
  const boundedTime = Math.max(chart.domainStart, Math.min(chart.domainEnd, time));
  return chart.plotX + ((boundedTime - chart.domainStart) / (chart.domainEnd - chart.domainStart)) * chart.plotWidth;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatAxisTime(time: number, span: number): string {
  const date = new Date(time);
  if (span >= 24 * 60 * 60 * 1000) {
    return date.toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCursorTime(time: number): string {
  return new Date(time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
