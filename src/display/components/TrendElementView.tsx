import React from 'react';
import { getTrendSeries, getTrendVisualOptions, trendBindingKey, type TrendElement, type TrendSeries } from '../createTrend';
import type { PiTrendSeries, TrendPoint, TrendStatePoint } from '../../pi/piDataSource';
import type { TrendRuntimeState } from '../runtime/trendRuntime';
import { resolveTrendCursorValue, type TrendCursor } from '../runtime/trendCursor';
import type { DisplayTimeRange } from '../../time/timeRange';

export interface TrendElementViewProps {
  element: TrendElement;
  runtimeState?: TrendRuntimeState;
  seriesStates?: readonly TrendSeriesViewState[];
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
  onCursorDoubleClick?: (
    event: React.MouseEvent<SVGLineElement>,
    elementId: string,
    cursor: TrendCursor,
  ) => void;
  timeRange?: DisplayTimeRange;
  onDoubleClick?: (event: React.MouseEvent<SVGGElement>, elementId: string) => void;
  onContextMenu?: (event: React.MouseEvent<SVGGElement>, elementId: string) => void;
  showBackground?: boolean;
}

export interface TrendSeriesViewState {
  series: TrendSeries;
  runtimeState: TrendRuntimeState;
}

const PLOT_MARGIN = { left: 86, right: 150, top: 30, bottom: 32 };
const GRID_COLOR = 'var(--border-subtle, rgba(255, 255, 255, 0.14))';
const AXIS_COLOR = 'var(--text-muted, rgba(255, 255, 255, 0.45))';
const TEXT_COLOR = 'var(--text-primary, rgba(255, 255, 255, 0.82))';
const LINE_COLOR = '#6e9fff';
const AXIS_FONT_SIZE = 16;

export function TrendElementView({
  element,
  runtimeState,
  seriesStates,
  cursors = [],
  cursorEnabled = true,
  selectedCursorId = null,
  onPlotPointerDown,
  onCursorPointerDown,
  onCursorDoubleClick,
  timeRange,
  onDoubleClick,
  onContextMenu,
  showBackground = true,
}: TrendElementViewProps) {
  const state = runtimeState ?? { status: 'loading' as const };
  const configuredSeries = getTrendSeries(element);
  const visual = getTrendVisualOptions(element);
  const resolvedSeriesStates = seriesStates ?? configuredSeries.slice(0, 1).map((series) => ({ series, runtimeState: state }));
  const cursorPointerDown = cursorEnabled ? onCursorPointerDown : undefined;
  const content = getTrendContent(
    element,
    resolvedSeriesStates,
    cursorEnabled ? cursors : [],
    cursorEnabled ? selectedCursorId : null,
    cursorEnabled ? onPlotPointerDown : undefined,
    cursorPointerDown,
    cursorEnabled ? onCursorDoubleClick : undefined,
    timeRange,
    visual,
  );
  const clipPathId = trendContentClipPathId(element.id);

  return (
    <g
      data-testid={`display-element-${element.id}`}
      data-element-id={element.id}
      data-element-type={element.type}
      style={{ cursor: cursorEnabled ? 'default' : 'move' }}
      onDoubleClick={(event) => onDoubleClick?.(event, element.id)}
      onContextMenu={(event) => onContextMenu?.(event, element.id)}
    >
      <defs>
        <clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
          <rect x={element.x} y={element.y} width={element.width} height={element.height} rx={14} />
        </clipPath>
      </defs>
      {showBackground && (
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rx={14}
          fill="var(--element-bg, rgba(255, 255, 255, 0.06))"
          stroke="var(--element-border, rgba(255, 255, 255, 0.35))"
          strokeWidth={1}
          data-testid={`trend-background-${element.id}`}
          data-element-id={element.id}
          pointerEvents="all"
        />
      )}
      <g clipPath={`url(#${clipPathId})`} data-testid={`trend-content-${element.id}`}>
        {content}
      </g>
    </g>
  );
}

function trendContentClipPathId(elementId: string): string {
  return `trend-content-clip-${elementId.split('').map((character) => character.charCodeAt(0).toString(36)).join('-')}`;
}

function getTrendContent(
  element: TrendElement,
  seriesStates: readonly TrendSeriesViewState[],
  cursors: readonly TrendCursor[],
  selectedCursorId: string | null,
  onPlotPointerDown: TrendElementViewProps['onPlotPointerDown'],
  onCursorPointerDown: TrendElementViewProps['onCursorPointerDown'],
  onCursorDoubleClick: TrendElementViewProps['onCursorDoubleClick'],
  timeRange: DisplayTimeRange | undefined,
  visual: ReturnType<typeof getTrendVisualOptions>,
): React.ReactNode {
  const formatValue = (value: number) => formatNumber(value, visual.numberFormat);
  const orderedSeriesStates = [...seriesStates].sort((a, b) => Number(b.series.primaryScale === true) - Number(a.series.primaryScale === true));
  const legendX = element.x + element.width - trendPlotRightMargin(element.width) + 12;
  const dataSeries = orderedSeriesStates.flatMap(({ series, runtimeState }) => {
    const data = runtimeState.status === 'success' || runtimeState.status === 'error'
      ? runtimeState.data
      : undefined;
    return data && data.points.length > 0 ? [{ series, data }] : [];
  });
  const stateSeries = orderedSeriesStates.flatMap(({ series, runtimeState }) => {
    const data = runtimeState.status === 'success' || runtimeState.status === 'error'
      ? runtimeState.data
      : undefined;
    return data?.states && data.states.length > 0 ? [{ series, states: data.states }] : [];
  });
  const title = (
    <text
      x={legendX}
      y={element.y + 18}
      fill={TEXT_COLOR}
      fontSize={visual.fontSize}
      fontFamily={visual.fontFamily}
      data-testid={`trend-title-${element.id}`}
      pointerEvents="none"
    >
      {orderedSeriesStates.map(({ series, runtimeState }, index) => {
        const data = runtimeState.status === 'success' || runtimeState.status === 'error'
          ? runtimeState.data
          : undefined;
        const currentValue = data?.points.at(-1)?.value;
        const currentState = data?.states?.at(-1)?.value;
        const value = currentValue !== undefined
          ? formatValue(currentValue)
          : currentState !== undefined ? currentState : '--';
        const legendY = element.y + 26 + index * 54;
        return (
          <React.Fragment key={`${series.binding.dataSourceUid}:${series.binding.serverPath}:${series.binding.pointName}`}>
            <tspan x={legendX} y={legendY} fill={series.color} data-testid={`trend-legend-${element.id}-${index}`}>
              {series.legendLabel || series.binding.pointName}
            </tspan>
            <tspan x={legendX} y={legendY + 23} fill={series.color} data-testid={`trend-legend-value-${element.id}-${index}`}>
              {value}
            </tspan>
          </React.Fragment>
        );
      })}
    </text>
  );

  if (dataSeries.length > 0 && stateSeries.length > 0) {
    return <>{visual.title && <TrendTitle element={element} visual={visual} />}{title}<MixedTrend element={element} numericSeries={dataSeries} stateSeries={stateSeries} timeRange={timeRange} individualScale={visual.scaleMode !== 'single'} /></>;
  }

  if (dataSeries.length === 0 && stateSeries.length > 0) {
    return <>{visual.title && <TrendTitle element={element} visual={visual} />}{title}<DigitalTrend
      element={element}
      series={stateSeries}
      cursors={cursors}
      selectedCursorId={selectedCursorId}
      onPlotPointerDown={onPlotPointerDown}
      onCursorPointerDown={onCursorPointerDown}
      onCursorDoubleClick={onCursorDoubleClick}
      timeRange={timeRange}
    /></>;
  }

  if (dataSeries.length === 0 && seriesStates.some(({ runtimeState }) => runtimeState.status === 'loading')) {
    return <>{title}<TrendMessage element={element} message="Carregando..." testId="trend-loading" /></>;
  }

  if (dataSeries.length === 0 && seriesStates.some(({ runtimeState }) => runtimeState.status === 'error')) {
    return <>{title}<TrendMessage element={element} message="BAD" testId="trend-error" /></>;
  }

  if (dataSeries.every(({ data }) => data.points.length === 0)) {
    return <>{title}<TrendMessage element={element} message="Sem dados" testId="trend-empty" /></>;
  }

  const drawableSeries = dataSeries.filter(({ data }) => data.points.length > 0);
  const primary = drawableSeries.find(({ series }) => series.primaryScale === true) ?? drawableSeries[0];
  const timeChart = buildTrendChartForSeries(element, drawableSeries.map(({ data }) => data.points), timeRange);
  const individualScale = visual.scaleMode === 'individual' || visual.scaleMode === 'configurable' || visual.scaleMode === 'multiple';
  const scaleChart = !individualScale
    ? timeChart
    : primary ? buildTrendChartForSeries(element, [primary.data.points], timeRange) : timeChart;
  const configuredMin = visual.scaleMode === 'configurable' ? primary?.series.scaleMin : undefined;
  const configuredMax = visual.scaleMode === 'configurable' ? primary?.series.scaleMax : undefined;
  const domainMin = Number.isFinite(configuredMin) ? configuredMin as number : scaleChart.domainMin;
  const domainMax = Number.isFinite(configuredMax) ? configuredMax as number : scaleChart.domainMax;
  const safeDomain = domainMax > domainMin ? { domainMin, domainMax } : { domainMin: scaleChart.domainMin, domainMax: scaleChart.domainMax };
  const chart = {
    ...timeChart,
    ...safeDomain,
    yTicks: scaleChart.yTicks.map((_, index) => {
      const value = safeDomain.domainMax - ((safeDomain.domainMax - safeDomain.domainMin) * index) / Math.max(1, scaleChart.yTicks.length - 1);
      return { value, y: scaleChart.plotY + ((safeDomain.domainMax - value) / (safeDomain.domainMax - safeDomain.domainMin)) * scaleChart.plotHeight };
    }),
  };
  const seriesCharts = new Map(drawableSeries.map(({ series, data }) => [
    trendBindingKey(series.binding),
    individualScale ? buildTrendChartForSeries(element, [data.points], timeRange) : chart,
  ]));
  return (
    <>
      {visual.title && <TrendTitle element={element} visual={visual} />}{title}
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
          <text x={chart.plotX - 6} y={tick.y + 4} textAnchor="end" fill={TEXT_COLOR} fontSize={AXIS_FONT_SIZE}>
            {formatValue(tick.value)}
          </text>
        </g>
      ))}
      {visual.scaleMode === 'configurable' && drawableSeries
        .filter(({ series }) => series !== primary?.series && (Number.isFinite(series.scaleMin) || Number.isFinite(series.scaleMax)))
        .map(({ series }, index) => {
          const labelX = chart.plotX + 8 + index * 48;
          return (
            <g key={`configured-scale-${trendBindingKey(series.binding)}`} fill={series.color} fontSize={AXIS_FONT_SIZE} pointerEvents="none">
              {Number.isFinite(series.scaleMax) && <text x={labelX} y={chart.plotY + 14} textAnchor="start">{formatValue(series.scaleMax as number)}</text>}
              {Number.isFinite(series.scaleMin) && <text x={labelX} y={chart.plotY + chart.plotHeight - 6} textAnchor="start">{formatValue(series.scaleMin as number)}</text>}
            </g>
          );
        })}
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
          fontSize={AXIS_FONT_SIZE}
          pointerEvents="none"
        >
          {formatAxisTime(tick.time, chart.domainEnd - chart.domainStart)}
        </text>
      ))}
      {drawableSeries.map(({ series, data }, index) => {
        const seriesChart = seriesCharts.get(trendBindingKey(series.binding)) ?? chart;
        const path = trendPathForPoints(seriesChart, data.points);
        const singlePoint = data.points.length === 1 ? trendPointForValue(seriesChart, data.points[0]) : undefined;
        return (
          <React.Fragment key={`${series.binding.dataSourceUid}:${series.binding.serverPath}:${series.binding.pointName}`}>
            <path
              d={path}
              fill="none"
              stroke={series.color || LINE_COLOR}
              strokeWidth={series.lineWidth ?? 2}
              strokeDasharray={series.lineStyle === 'dashed' ? '8 5' : series.lineStyle === 'dotted' ? '2 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              data-testid={index === 0 ? `trend-line-${element.id}` : `trend-line-${element.id}-${index}`}
              pointerEvents="none"
            />
            {visual.showRegression && data.points.length > 1 && <path d={trendRegressionPath(seriesChart, data.points)} fill="none" stroke={series.color || LINE_COLOR} strokeWidth={1} strokeDasharray="5 4" opacity={0.7} pointerEvents="none" />}
            {series.marker === 'circle' && data.points.map((point) => { const position = trendPointForValue(seriesChart, point); return <circle key={point.time} cx={position.x} cy={position.y} r={3} fill={series.color || LINE_COLOR} pointerEvents="none" />; })}
            {series.marker === 'square' && data.points.map((point) => { const position = trendPointForValue(seriesChart, point); return <rect key={point.time} x={position.x - 3} y={position.y - 3} width={6} height={6} fill={series.color || LINE_COLOR} pointerEvents="none" />; })}
            {singlePoint && (
              <circle
                cx={singlePoint.x}
                cy={singlePoint.y}
                r={3}
                fill={series.color || LINE_COLOR}
                data-testid={index === 0 ? `trend-point-${element.id}` : `trend-point-${element.id}-${index}`}
                pointerEvents="none"
              />
            )}
          </React.Fragment>
        );
      })}
      {cursors.map((cursor) => {
        const values = drawableSeries.flatMap(({ series, data }) => {
          const value = resolveTrendCursorValue(data.points, cursor.time);
          return value === undefined ? [] : [{ pointName: series.binding.pointName, value, color: series.color || LINE_COLOR }];
        });
        if (values.length === 0) {
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
              stroke="var(--trend-cursor, #ffffff)"
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
              strokeWidth={18}
              style={onCursorPointerDown ? { cursor: 'ew-resize' } : undefined}
              data-testid={`trend-cursor-hit-${element.id}-${cursor.id}`}
              aria-label={`Selecionar cursor ${formatCursorTime(cursor.time)}`}
              onPointerDown={onCursorPointerDown ? (event) => onCursorPointerDown(event, element.id, cursor, chart) : undefined}
              onDoubleClick={onCursorDoubleClick ? (event) => onCursorDoubleClick(event, element.id, cursor) : undefined}
            />
            <text
              x={labelX}
              y={chart.plotY + 12}
              textAnchor={labelAnchor}
              fill="var(--trend-cursor, #ffffff)"
              fontSize={AXIS_FONT_SIZE}
              pointerEvents="none"
              data-testid={`trend-cursor-label-${element.id}-${cursor.id}`}
            >
              <tspan x={labelX} y={chart.plotY + 12}>{formatCursorTime(cursor.time)}</tspan>
              {values.map(({ pointName, value, color }, index) => (
                <tspan key={pointName} x={labelX} y={chart.plotY + 12 + (index + 1) * 18} fill={color}>
                  {pointName} {formatValue(value)}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </>
  );
}

function TrendTitle({ element, visual }: { element: TrendElement; visual: ReturnType<typeof getTrendVisualOptions> }) {
  const plotWidth = Math.max(1, element.width - PLOT_MARGIN.left - trendPlotRightMargin(element.width));
  return <text x={element.x + PLOT_MARGIN.left + plotWidth / 2} y={element.y + 20} textAnchor="middle" fill={TEXT_COLOR} fontSize={visual.fontSize} fontFamily={visual.fontFamily} pointerEvents="none">{visual.title}</text>;
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

function MixedTrend({
  element,
  numericSeries,
  stateSeries,
  timeRange,
  individualScale,
}: {
  element: TrendElement;
  numericSeries: Array<{ series: TrendSeries; data: PiTrendSeries }>;
  stateSeries: Array<{ series: TrendSeries; states: TrendStatePoint[] }>;
  timeRange: DisplayTimeRange | undefined;
  individualScale: boolean;
}) {
  const allNumericPoints = numericSeries.flatMap(({ data }) => data.points);
  const primaryNumeric = numericSeries.find(({ series }) => series.primaryScale === true) ?? numericSeries[0];
  const numericPoints = primaryNumeric?.data.points ?? [];
  const states = stateSeries.flatMap(({ states: points }) => points);
  const stateLabels = [...new Set(states.map((state) => state.value))];
  const plotX = element.x + PLOT_MARGIN.left;
  const plotY = element.y + PLOT_MARGIN.top;
  const plotWidth = Math.max(1, element.width - PLOT_MARGIN.left - trendPlotRightMargin(element.width));
  const plotHeight = Math.max(1, element.height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const allTimes = [...allNumericPoints.map((point) => point.time), ...states.map((state) => state.time)];
  const firstTime = Math.min(...allTimes);
  const lastTime = Math.max(...allTimes);
  const hasRequestedRange = timeRange
    && Number.isFinite(timeRange.from)
    && Number.isFinite(timeRange.to)
    && timeRange.from < timeRange.to;
  const timePadding = firstTime === lastTime ? 30 * 60 * 1000 : (lastTime - firstTime) * 0.02;
  const domainStart = hasRequestedRange ? timeRange.from : firstTime - timePadding;
  const domainEnd = hasRequestedRange ? timeRange.to : lastTime + timePadding;
  const numericValues = numericPoints.map((point) => point.value);
  const numericMin = Math.min(...numericValues);
  const numericMax = Math.max(...numericValues);
  const numericPadding = numericMin === numericMax
    ? Math.max(Math.abs(numericMin) * 0.05, 1)
    : (numericMax - numericMin) * 0.05;
  const domainMin = numericMin - numericPadding;
  const domainMax = numericMax + numericPadding;
  const xFor = (time: number) => plotX + ((Math.max(domainStart, Math.min(domainEnd, time)) - domainStart)
    / Math.max(1, domainEnd - domainStart)) * plotWidth;
  const numericScaleFor = (series: { data: PiTrendSeries }) => {
    if (!individualScale) return { min: domainMin, max: domainMax };
    const values = series.data.points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = min === max ? Math.max(Math.abs(min) * 0.05, 1) : (max - min) * 0.05;
    return { min: min - padding, max: max + padding };
  };
  const numericY = (value: number, scale = { min: domainMin, max: domainMax }) => plotY + ((scale.max - value) / Math.max(1e-12, scale.max - scale.min)) * plotHeight;
  const stateY = (value: string) => {
    const index = Math.max(0, stateLabels.indexOf(value));
    return plotY + (1 - index / Math.max(1, stateLabels.length - 1)) * plotHeight;
  };
  const stateAxisX = plotX - 48;
  const numericTicks = [0, 1, 2].map((index) => domainMax - ((domainMax - domainMin) * index) / 2);
  const xTicks = [0, 1, 2].map((index) => domainStart + ((domainEnd - domainStart) * index) / 2);

  return (
    <>
      <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} fill="rgba(0, 0, 0, 0.12)" data-testid={`trend-mixed-plot-${element.id}`} pointerEvents="all" />
      {stateLabels.map((label, index) => {
        const y = stateY(label);
        return (
          <g key={label} pointerEvents="none">
            <line x1={plotX} y1={y} x2={plotX + plotWidth} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
            <text x={stateAxisX - 6} y={y + 4} textAnchor="end" fill={stateSeries[0]?.series.color || LINE_COLOR} fontSize={AXIS_FONT_SIZE}>{index}</text>
          </g>
        );
      })}
      <line x1={stateAxisX} y1={plotY} x2={stateAxisX} y2={plotY + plotHeight} stroke={stateSeries[0]?.series.color || AXIS_COLOR} strokeWidth={1} pointerEvents="none" />
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotHeight} stroke={primaryNumeric?.series.color || AXIS_COLOR} strokeWidth={1} pointerEvents="none" />
      {numericTicks.map((value) => (
        <text key={value} x={plotX - 6} y={numericY(value) + 4} textAnchor="end" fill={primaryNumeric?.series.color || TEXT_COLOR} fontSize={AXIS_FONT_SIZE} pointerEvents="none">
          {formatNumber(value)}
        </text>
      ))}
      <line x1={plotX} y1={plotY + plotHeight} x2={plotX + plotWidth} y2={plotY + plotHeight} stroke={AXIS_COLOR} strokeWidth={1} pointerEvents="none" />
      {xTicks.map((time) => (
        <text key={time} x={xFor(time)} y={plotY + plotHeight + 18} textAnchor="middle" fill={TEXT_COLOR} fontSize={AXIS_FONT_SIZE} pointerEvents="none">
          {formatAxisTime(time, domainEnd - domainStart)}
        </text>
      ))}
      {stateSeries.map(({ series, states: points }, index) => (
        <React.Fragment key={`${series.binding.dataSourceUid}:${series.binding.serverPath}:${series.binding.pointName}`}>
          <path
            d={digitalTrendPath(points, domainEnd, xFor, stateY)}
            fill="none"
            stroke={series.color || LINE_COLOR}
            strokeWidth={series.lineWidth ?? 2}
            strokeDasharray={series.lineStyle === 'dashed' ? '8 5' : series.lineStyle === 'dotted' ? '2 4' : undefined}
            strokeLinejoin="round"
            data-testid={index === 0 ? `trend-state-line-${element.id}` : `trend-state-line-${element.id}-${index}`}
            pointerEvents="none"
          />
          {series.marker === 'circle' && points.map((state, markerIndex) => <circle key={`${state.time}-${markerIndex}`} cx={xFor(state.time)} cy={stateY(state.value)} r={3} fill={series.color || LINE_COLOR} pointerEvents="none" />)}
          {series.marker === 'square' && points.map((state, markerIndex) => <rect key={`${state.time}-${markerIndex}`} x={xFor(state.time) - 3} y={stateY(state.value) - 3} width={6} height={6} fill={series.color || LINE_COLOR} pointerEvents="none" />)}
        </React.Fragment>
      ))}
      {numericSeries.map(({ series, data }, index) => {
        const seriesScale = numericScaleFor({ data });
        return (
        <path
          key={`${series.binding.dataSourceUid}:${series.binding.serverPath}:${series.binding.pointName}`}
          d={data.points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${xFor(point.time)} ${numericY(point.value, seriesScale)}`).join(' ')}
          fill="none"
          stroke={series.color || LINE_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          data-testid={index === 0 ? `trend-line-${element.id}` : `trend-line-${element.id}-${index}`}
          pointerEvents="none"
        />
        );
      })}
    </>
  );
}

function DigitalTrend({
  element,
  series,
  cursors,
  selectedCursorId,
  onPlotPointerDown,
  onCursorPointerDown,
  onCursorDoubleClick,
  timeRange,
}: {
  element: TrendElement;
  series: Array<{ series: TrendSeries; states: TrendStatePoint[] }>;
  cursors: readonly TrendCursor[];
  selectedCursorId: string | null;
  onPlotPointerDown: TrendElementViewProps['onPlotPointerDown'];
  onCursorPointerDown: TrendElementViewProps['onCursorPointerDown'];
  onCursorDoubleClick: TrendElementViewProps['onCursorDoubleClick'];
  timeRange: DisplayTimeRange | undefined;
}) {
  const allStates = series.flatMap((item) => item.states);
  const labels = [...new Set(allStates.map((state) => state.value))];
  const plotX = element.x + PLOT_MARGIN.left;
  const plotY = element.y + PLOT_MARGIN.top;
  const plotWidth = Math.max(1, element.width - PLOT_MARGIN.left - trendPlotRightMargin(element.width));
  const plotHeight = Math.max(1, element.height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const firstTime = Math.min(...allStates.map((state) => state.time));
  const lastTime = Math.max(...allStates.map((state) => state.time));
  const hasRequestedRange = timeRange
    && Number.isFinite(timeRange.from)
    && Number.isFinite(timeRange.to)
    && timeRange.from < timeRange.to;
  const timePadding = firstTime === lastTime ? 30 * 60 * 1000 : (lastTime - firstTime) * 0.02;
  const domainStart = hasRequestedRange ? timeRange.from : firstTime - timePadding;
  const domainEnd = hasRequestedRange ? timeRange.to : lastTime + timePadding;
  const yFor = (value: string) => {
    const index = labels.indexOf(value);
    const ratio = Math.max(0, index) / Math.max(1, labels.length - 1);
    return plotY + (1 - ratio) * plotHeight;
  };
  const xFor = (time: number) => plotX + ((Math.max(domainStart, Math.min(domainEnd, time)) - domainStart)
    / Math.max(1, domainEnd - domainStart)) * plotWidth;
  const xTicks = [0, 1, 2].map((index) => domainStart + ((domainEnd - domainStart) * index) / 2);
  const chart: TrendChartModel = {
    plotX,
    plotY,
    plotWidth,
    plotHeight,
    domainStart,
    domainEnd,
    domainMin: 0,
    domainMax: 1,
    path: '',
    yTicks: [],
    xTicks: [],
  };

  return (
    <>
      <rect
        x={plotX}
        y={plotY}
        width={plotWidth}
        height={plotHeight}
        fill="rgba(0, 0, 0, 0.12)"
        data-testid={`trend-state-plot-${element.id}`}
        pointerEvents="all"
        onPointerDown={onPlotPointerDown ? (event) => onPlotPointerDown(event, element.id, chart) : undefined}
      />
      {labels.map((_label, index) => {
        const y = yFor(labels[index]);
        return (
          <g key={labels[index]} pointerEvents="none">
            <line x1={plotX} y1={y} x2={plotX + plotWidth} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
            <text x={plotX - 6} y={y + 4} textAnchor="end" fill={TEXT_COLOR} fontSize={AXIS_FONT_SIZE}>{index}</text>
          </g>
        );
      })}
      <line x1={plotX} y1={plotY} x2={plotX} y2={plotY + plotHeight} stroke={AXIS_COLOR} strokeWidth={1} pointerEvents="none" />
      <line x1={plotX} y1={plotY + plotHeight} x2={plotX + plotWidth} y2={plotY + plotHeight} stroke={AXIS_COLOR} strokeWidth={1} pointerEvents="none" />
      {xTicks.map((time) => (
        <text key={time} x={xFor(time)} y={plotY + plotHeight + 18} textAnchor="middle" fill={TEXT_COLOR} fontSize={AXIS_FONT_SIZE} pointerEvents="none">
          {formatAxisTime(time, domainEnd - domainStart)}
        </text>
      ))}
      {series.map(({ series: trendSeries, states }, index) => (
        <React.Fragment key={`${trendSeries.binding.dataSourceUid}:${trendSeries.binding.serverPath}:${trendSeries.binding.pointName}`}>
          <path
            d={digitalTrendPath(states, domainEnd, xFor, yFor)}
            fill="none"
            stroke={trendSeries.color || LINE_COLOR}
            strokeWidth={trendSeries.lineWidth ?? 2}
            strokeDasharray={trendSeries.lineStyle === 'dashed' ? '8 5' : trendSeries.lineStyle === 'dotted' ? '2 4' : undefined}
            strokeLinejoin="round"
            data-testid={index === 0 ? `trend-state-line-${element.id}` : `trend-state-line-${element.id}-${index}`}
            pointerEvents="none"
          />
          {trendSeries.marker === 'circle' && states.map((state, markerIndex) => <circle key={`${state.time}-${markerIndex}`} cx={xFor(state.time)} cy={yFor(state.value)} r={3} fill={trendSeries.color || LINE_COLOR} pointerEvents="none" />)}
          {trendSeries.marker === 'square' && states.map((state, markerIndex) => <rect key={`${state.time}-${markerIndex}`} x={xFor(state.time) - 3} y={yFor(state.value) - 3} width={6} height={6} fill={trendSeries.color || LINE_COLOR} pointerEvents="none" />)}
        </React.Fragment>
      ))}
      {cursors.map((cursor) => {
        const x = xFor(cursor.time);
        const selected = cursor.id === selectedCursorId;
        const labelAnchor = x > plotX + plotWidth / 2 ? 'end' : 'start';
        const labelX = labelAnchor === 'end' ? x - 4 : x + 4;
        const values = series.flatMap(({ series: trendSeries, states }) => {
          const state = resolveTrendCursorState(states, cursor.time);
          return state === undefined ? [] : [{ name: trendSeries.legendLabel || trendSeries.binding.pointName, value: state, color: trendSeries.color || LINE_COLOR }];
        });
        if (values.length === 0) return null;
        return <g key={cursor.id} data-testid={`trend-cursor-${element.id}-${cursor.id}`}>
          <line x1={x} y1={plotY} x2={x} y2={plotY + plotHeight} stroke="var(--trend-cursor, #ffffff)" strokeWidth={selected ? 2 : 1} pointerEvents="none" />
          <line
            x1={x} y1={plotY} x2={x} y2={plotY + plotHeight} stroke="transparent" strokeWidth={18}
            style={onCursorPointerDown ? { cursor: 'ew-resize' } : undefined}
            data-testid={`trend-cursor-hit-${element.id}-${cursor.id}`}
            onPointerDown={onCursorPointerDown ? (event) => onCursorPointerDown(event, element.id, cursor, chart) : undefined}
            onDoubleClick={onCursorDoubleClick ? (event) => onCursorDoubleClick(event, element.id, cursor) : undefined}
          />
          <text x={labelX} y={plotY + 12} textAnchor={labelAnchor} fill="var(--trend-cursor, #ffffff)" fontSize={AXIS_FONT_SIZE} pointerEvents="none">
            <tspan x={labelX} y={plotY + 12}>{formatCursorTime(cursor.time)}</tspan>
            {values.map(({ name, value, color }, index) => <tspan key={name} x={labelX} y={plotY + 12 + (index + 1) * 18} fill={color}>{name} {value}</tspan>)}
          </text>
        </g>;
      })}
    </>
  );
}

function resolveTrendCursorState(states: readonly TrendStatePoint[], time: number): string | undefined {
  const ordered = [...states].filter((state) => Number.isFinite(state.time)).sort((left, right) => left.time - right.time);
  if (ordered.length === 0 || time < ordered[0].time || time > ordered[ordered.length - 1].time) return undefined;
  return [...ordered].reverse().find((state) => state.time <= time)?.value;
}

function digitalTrendPath(
  states: readonly TrendStatePoint[],
  domainEnd: number,
  xFor: (time: number) => number,
  yFor: (value: string) => number,
): string {
  return states.map((state, index) => {
    const previous = states[index - 1];
    if (!previous) {
      return `M ${xFor(state.time)} ${yFor(state.value)}`;
    }
    return `H ${xFor(state.time)} V ${yFor(state.value)}`;
  }).join(' ') + (states.length > 0 ? ` H ${xFor(domainEnd)}` : '');
}

export interface TrendChartModel {
  plotX: number;
  plotY: number;
  plotWidth: number;
  plotHeight: number;
  domainStart: number;
  domainEnd: number;
  domainMin: number;
  domainMax: number;
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
  return buildTrendChartForSeries(element, [points], timeRange);
}

export function buildTrendChartForSeries(
  element: TrendElement,
  seriesPoints: readonly TrendPoint[][],
  timeRange?: DisplayTimeRange,
): TrendChartModel {
  const plotX = element.x + PLOT_MARGIN.left;
  const plotY = element.y + PLOT_MARGIN.top;
  const plotWidth = Math.max(1, element.width - PLOT_MARGIN.left - trendPlotRightMargin(element.width));
  const plotHeight = Math.max(1, element.height - PLOT_MARGIN.top - PLOT_MARGIN.bottom);
  const points = seriesPoints.flat();
  const values = points.map((point) => point.value);
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const valuePadding = valueMin === valueMax
    ? Math.max(Math.abs(valueMin) * 0.05, 1)
    : (valueMax - valueMin) * 0.05;
  const useUnitScale = valueMin >= 0 && valueMax <= 1;
  const domainMin = useUnitScale ? 0 : valueMin - valuePadding;
  const domainMax = useUnitScale ? 1 : valueMax + valuePadding;
  const hasRequestedRange = timeRange
    && Number.isFinite(timeRange.from)
    && Number.isFinite(timeRange.to)
    && timeRange.from < timeRange.to;
  const pointTimes = points.map((point) => point.time);
  const firstTime = Math.min(...pointTimes);
  const lastTime = Math.max(...pointTimes);
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

  const intervals = getTrendVisualOptions(element).scaleIntervals;
  return {
    plotX,
    plotY,
    plotWidth,
    plotHeight,
    domainStart,
    domainEnd,
    domainMin,
    domainMax,
    path,
    yTicks: Array.from({ length: intervals + 1 }, (_, index) => index).map((index) => {
      const value = domainMax - ((domainMax - domainMin) * index) / intervals;
      return { value, y: yFor(value) };
    }),
    xTicks: [0, 1, 2].map((index) => {
      const time = domainStart + ((domainEnd - domainStart) * index) / 2;
      return { time, x: xFor(time) };
    }),
    singlePoint: points.length === 1 ? { x: xFor(points[0].time), y: yFor(points[0].value) } : undefined,
  };
}

function trendPlotRightMargin(width: number): number {
  return Math.max(PLOT_MARGIN.right, width * 0.3);
}

function trendPathForPoints(chart: TrendChartModel, points: readonly TrendPoint[]): string {
  return points.map((point, index) => {
    const position = trendPointForValue(chart, point);
    return `${index === 0 ? 'M' : 'L'} ${position.x} ${position.y}`;
  }).join(' ');
}

function trendPointForValue(chart: TrendChartModel, point: TrendPoint): { x: number; y: number } {
  const x = trendXForTime(chart, point.time);
  const y = chart.plotY
    + ((chart.domainMax - point.value) / Math.max(1e-12, chart.domainMax - chart.domainMin)) * chart.plotHeight;
  return { x, y };
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

function trendRegressionPath(chart: TrendChartModel, points: readonly TrendPoint[]): string {
  const meanX = points.reduce((sum, point) => sum + point.time, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const variance = points.reduce((sum, point) => sum + (point.time - meanX) ** 2, 0);
  const slope = variance === 0 ? 0 : points.reduce((sum, point) => sum + (point.time - meanX) * (point.value - meanY), 0) / variance;
  const valueAt = (time: number) => meanY + slope * (time - meanX);
  const yFor = (value: number) => chart.plotY + ((chart.domainMax - value) / Math.max(1e-12, chart.domainMax - chart.domainMin)) * chart.plotHeight;
  return `M ${chart.plotX} ${yFor(valueAt(chart.domainStart))} L ${chart.plotX + chart.plotWidth} ${yFor(valueAt(chart.domainEnd))}`;
}

function formatNumber(value: number, format: 'automatic' | 'integer' | 'oneDecimal' | 'twoDecimals' = 'automatic'): string {
  if (format === 'integer') return String(Math.round(value));
  if (format === 'oneDecimal') return value.toFixed(1);
  if (format === 'twoDecimals') return value.toFixed(2);
  return Math.abs(value) < 1 ? value.toFixed(1) : String(Math.round(value));
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
