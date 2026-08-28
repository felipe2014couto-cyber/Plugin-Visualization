import React, { useMemo } from 'react';
import type { XYPlotElement } from '../createXYPlot';
import type { TrendRuntimeState } from '../runtime/trendRuntime';

export interface XYPlotElementViewProps { element: XYPlotElement; xState?: TrendRuntimeState; yState?: TrendRuntimeState; }
export function XYPlotElementView({ element, xState, yState }: XYPlotElementViewProps) {
  const { x, y, width, height, properties } = element;
  const points = useMemo(() => xState?.status === 'success' && yState?.status === 'success' ? synchronizePoints(xState.data.points, yState.data.points) : [], [xState, yState]);
  const pad = { left: 50, right: 16, top: 26, bottom: 42 };
  const plotWidth = Math.max(1, width - pad.left - pad.right); const plotHeight = Math.max(1, height - pad.top - pad.bottom);
  const xValues = points.map((point) => point.x); const yValues = points.map((point) => point.y);
  const xMin = xValues.length ? Math.min(...xValues) : 0; const xMax = xValues.length ? Math.max(...xValues) : 1;
  const yMin = yValues.length ? Math.min(...yValues) : 0; const yMax = yValues.length ? Math.max(...yValues) : 1;
  const scaleX = (value: number) => x + pad.left + ((value - xMin) / (xMax - xMin || 1)) * plotWidth;
  const scaleY = (value: number) => y + pad.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${scaleX(point.x)},${scaleY(point.y)}`).join(' ');
  const loading = xState?.status === 'loading' || yState?.status === 'loading';
  const error = xState?.status === 'error' || yState?.status === 'error';
  return <g data-element-id={element.id} data-element-type="xy-plot">
    <rect x={x} y={y} width={width} height={height} rx={8} fill="var(--surface-elevated, #111b28)" stroke="var(--border-color, #334155)" />
    <text x={x + width / 2} y={y + 17} textAnchor="middle" fill="var(--text-primary, #e5e7eb)" fontSize={12} fontWeight={600}>XY Plot</text>
    <line x1={x + pad.left} y1={y + pad.top + plotHeight} x2={x + pad.left + plotWidth} y2={y + pad.top + plotHeight} stroke="var(--text-secondary, #94a3b8)" />
    <line x1={x + pad.left} y1={y + pad.top} x2={x + pad.left} y2={y + pad.top + plotHeight} stroke="var(--text-secondary, #94a3b8)" />
    {points.length > 0 && properties.connectPoints && <path d={path} fill="none" stroke="#6e9fff" strokeWidth={1.25} opacity={0.8} />}
    {points.map((point, index) => <circle key={`${point.time}-${index}`} cx={scaleX(point.x)} cy={scaleY(point.y)} r={3} fill="#6e9fff" />)}
    <text x={x + pad.left + plotWidth / 2} y={y + height - 9} textAnchor="middle" fill="var(--text-secondary, #94a3b8)" fontSize={10}>{properties.xBinding.pointName}</text>
    <text x={x + 12} y={y + pad.top + plotHeight / 2} textAnchor="middle" fill="var(--text-secondary, #94a3b8)" fontSize={10} transform={`rotate(-90 ${x + 12} ${y + pad.top + plotHeight / 2})`}>{properties.yBinding?.pointName ?? 'Arraste uma PI Tag para o eixo Y'}</text>
    {points.length > 0 && <><text x={x + pad.left} y={y + height - 23} fill="var(--text-secondary, #94a3b8)" fontSize={9}>{format(xMin)}</text><text x={x + pad.left + plotWidth} y={y + height - 23} textAnchor="end" fill="var(--text-secondary, #94a3b8)" fontSize={9}>{format(xMax)}</text><text x={x + pad.left - 5} y={y + pad.top + 4} textAnchor="end" fill="var(--text-secondary, #94a3b8)" fontSize={9}>{format(yMax)}</text><text x={x + pad.left - 5} y={y + pad.top + plotHeight} textAnchor="end" fill="var(--text-secondary, #94a3b8)" fontSize={9}>{format(yMin)}</text></>}
    {(!properties.yBinding || loading || error) && <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="var(--text-secondary, #94a3b8)" fontSize={12}>{error ? 'Não foi possível carregar os dados' : properties.yBinding ? 'Carregando dados…' : 'Arraste uma segunda PI Tag para o eixo Y'}</text>}
  </g>;
}
function synchronizePoints(xs: readonly { time: number; value: number }[], ys: readonly { time: number; value: number }[]) {
  if (!xs.length || !ys.length) return [] as Array<{ time: number; x: number; y: number }>;
  let yIndex = 0;
  return xs.map((x) => {
    while (yIndex < ys.length - 1 && ys[yIndex + 1].time <= x.time) yIndex += 1;
    const before = ys[yIndex]; const after = ys[Math.min(yIndex + 1, ys.length - 1)];
    const ratio = after.time === before.time ? 0 : Math.max(0, Math.min(1, (x.time - before.time) / (after.time - before.time)));
    return { time: x.time, x: x.value, y: before.value + (after.value - before.value) * ratio };
  });
}
function format(value: number) { return Number.isFinite(value) ? Number(value.toPrecision(5)).toString() : '—'; }
