import React, { useRef, useCallback, useEffect, useState } from 'react';
import { css } from '@emotion/css';
import type { DisplayDocument } from '../../displayDocument';
import { DEFAULT_RECTANGLE_PROPERTIES, RECTANGLE_TYPE } from '../../createRectangle';
import { VALUE_TYPE, type ValueElement } from '../../createValue';
import { getTrendSeries, TREND_TYPE, type TrendElement } from '../../createTrend';
import { BAR_TYPE, type BarElement } from '../../createBar';
import { GAUGE_TYPE, type GaugeElement } from '../../createGauge';
import { ValueElementView } from '../ValueElementView';
import { GaugeElementView } from '../GaugeElementView';
import { BarElementView } from '../BarElementView';
import {
  TrendElementView,
  buildTrendChartForSeries,
  trendTimeForX,
  type TrendSeriesViewState,
} from '../TrendElementView';
import type { PiPointValue, PiPointValueResult, PiTrendSeriesResult } from '../../../pi/piDataSource';
import type { DisplayTimeRange } from '../../../time/timeRange';
import { isPiPointBinding, type PiPointBinding } from '../../../pi/piPointBinding';
import { useValueRuntime, type LoadCurrentValues, type ValueRuntimeConsumer } from '../../runtime/valueRuntime';
import {
  getTrendSeriesConsumerId,
  useTrendRuntime,
  type LoadTrendSeries,
  type TrendRuntimeConsumer,
  type TrendRuntimeState,
} from '../../runtime/trendRuntime';
import {
  clampTrendCursorTime,
  isTrendCursorWithinSeries,
  type TrendCursor,
} from '../../runtime/trendCursor';
import {
  getElementById,
  getResizeHandlePositions,
  getResizeHandleRect,
  getHandleCursor,
  svgPointFromEvent,
  type Point,
  type ResizeHandle,
} from './editorGeometry';

const HANDLE_SIZE = 8;
const ELEMENT_FILL = 'rgba(110, 159, 255, 0.15)';
const ELEMENT_STROKE = '#6e9fff';
const SELECTION_STROKE = '#6e9fff';
const HANDLE_FILL = '#ffffff';
const HANDLE_STROKE = '#6e9fff';
const DEFAULT_SURFACE_BACKGROUND = '#1f1f1f';
const themedDefaultSurface = css`
  fill: var(--canvas-bg);
`;

interface CursorSelection {
  trendElementId: string;
  cursorId: string;
}

interface CursorDrag extends CursorSelection {
  pointerId: number;
}

export interface DisplaySurfaceProps {
  document: DisplayDocument;
  editable: boolean;
  selectedElementId: string | null;
  onSelect: (elementId: string | null) => void;
  onStartDrag: (elementId: string, pointer: Point) => void;
  onStartResize: (elementId: string, handle: ResizeHandle, pointer: Point) => void;
  onPointerMove: (pointer: Point) => void;
  onPointerEnd: () => void;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  loadValues?: LoadCurrentValues;
  loadTrend?: LoadTrendSeries;
  trendRefreshKey?: string;
  trendTimeRange?: DisplayTimeRange;
  onTrendOpen?: (element: TrendElement, seriesStates: readonly TrendSeriesViewState[]) => void;
  onTrendContextMenu?: (element: TrendElement) => void;
  zoom?: number;
  viewCenter?: Point;
}

function trySetPointerCapture(target: Element, pointerId: number): void {
  const capture = (target as Element & {
    setPointerCapture?: (id: number) => void;
  }).setPointerCapture;
  if (typeof capture === 'function') {
    capture.call(target, pointerId);
  }
}

function tryReleasePointerCapture(target: Element, pointerId: number): void {
  const release = (target as Element & {
    releasePointerCapture?: (id: number) => void;
  }).releasePointerCapture;
  if (typeof release === 'function') {
    release.call(target, pointerId);
  }
}

function hasPointerCapture(target: Element, pointerId: number): boolean {
  const check = (target as Element & {
    hasPointerCapture?: (id: number) => boolean;
  }).hasPointerCapture;
  if (typeof check !== 'function') {
    return true;
  }
  return check.call(target, pointerId);
}

export function DisplaySurface({
  document: displayDocument,
  editable,
  selectedElementId,
  onSelect,
  onStartDrag,
  onStartResize,
  onPointerMove,
  onPointerEnd,
  loadValue,
  loadValues,
  loadTrend,
  trendRefreshKey,
  trendTimeRange,
  onTrendOpen,
  onTrendContextMenu,
  zoom = 1,
  viewCenter,
}: DisplaySurfaceProps) {
  const { surface, elements } = displayDocument;
  const cursorEnabled = !editable;
  const svgRef = useRef<SVGSVGElement>(null);
  const nextCursorId = useRef(1);
  const [cursorsByTrend, setCursorsByTrend] = useState<Record<string, TrendCursor[]>>({});
  const [selectedCursor, setSelectedCursor] = useState<CursorSelection | null>(null);
  const [cursorDrag, setCursorDrag] = useState<CursorDrag | null>(null);

  useEffect(() => {
    if (!editable) {
      return;
    }
    setCursorsByTrend({});
    setSelectedCursor(null);
    setCursorDrag(null);
  }, [editable]);

  const valueConsumers: ValueRuntimeConsumer[] = elements.flatMap((element) => (
    (element.type === VALUE_TYPE || element.type === GAUGE_TYPE || element.type === BAR_TYPE)
      && isPiPointBinding(element.properties.binding)
      ? [{ elementId: element.id, binding: element.properties.binding }]
      : []
  ));
  const fallbackLoader = useCallback<LoadCurrentValues>(async (bindings) => {
    if (!loadValue) {
      return Object.fromEntries(bindings.map((binding) => [
        `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
        { status: 'error', error: new Error('Consulta PI indisponível') } as PiPointValueResult,
      ]));
    }
    const entries = await Promise.all(bindings.map(async (binding) => {
      try {
        return [
          `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
          { status: 'success', value: await loadValue(binding) } as PiPointValueResult,
        ] as const;
      } catch (error) {
        return [
          `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
          { status: 'error', error: error instanceof Error ? error : new Error(String(error)) } as PiPointValueResult,
        ] as const;
      }
    }));
    return Object.fromEntries(entries);
  }, [loadValue]);
  const runtimeStates = useValueRuntime(valueConsumers, loadValues ?? fallbackLoader);
  const trendConsumers: TrendRuntimeConsumer[] = elements.flatMap((element) => {
    if (element.type !== TREND_TYPE) {
      return [];
    }
    return getTrendSeries(element as TrendElement).map(({ binding }) => ({
      elementId: element.id,
      consumerId: getTrendSeriesConsumerId(element.id, binding),
      binding,
      width: element.width,
    }));
  });
  const fallbackTrendLoader = useCallback<LoadTrendSeries>(async (bindings) => Object.fromEntries(
    bindings.map((binding) => [
      `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
      { status: 'error', error: new Error('Consulta histórica PI indisponível') } as PiTrendSeriesResult,
    ]),
  ), []);
  const trendRuntimeStates = useTrendRuntime(trendConsumers, loadTrend ?? fallbackTrendLoader, trendRefreshKey);

  const handleTrendDoubleClick = useCallback((
    event: React.MouseEvent<SVGGElement>,
    elementId: string,
  ) => {
    if (editable || !onTrendOpen) {
      return;
    }
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element || element.type !== TREND_TYPE) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onTrendOpen(element as TrendElement, getTrendSeriesStates(element as TrendElement, trendRuntimeStates));
  }, [editable, elements, onTrendOpen, trendRuntimeStates]);
  const handleTrendContextMenu = useCallback((event: React.MouseEvent<SVGGElement>, elementId: string) => {
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element || element.type !== TREND_TYPE) return;
    event.preventDefault();
    event.stopPropagation();
    onTrendContextMenu?.(element as TrendElement);
  }, [elements, onTrendContextMenu]);

  useEffect(() => {
    setCursorsByTrend((current) => {
      let changed = false;
      const next: Record<string, TrendCursor[]> = {};
      for (const [elementId, cursors] of Object.entries(current)) {
        if (!elements.some((element) => element.id === elementId && element.type === TREND_TYPE)) {
          changed = true;
          continue;
        }
        const element = elements.find((candidate) => candidate.id === elementId) as TrendElement | undefined;
        const points = element ? getTrendPoints(element, trendRuntimeStates) : undefined;
        const retained = points ? cursors.filter((cursor) => isTrendCursorWithinSeries(points, cursor.time)) : cursors;
        if (retained.length > 0) {
          next[elementId] = retained;
        }
        if (retained.length !== cursors.length) {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [elements, trendRuntimeStates]);

  useEffect(() => {
    if (selectedCursor && !(cursorsByTrend[selectedCursor.trendElementId] ?? [])
      .some((cursor) => cursor.id === selectedCursor.cursorId)) {
      setSelectedCursor(null);
    }
  }, [cursorsByTrend, selectedCursor]);

  const handleTrendPlotPointerDown = useCallback((
    event: React.PointerEvent<SVGRectElement>,
    elementId: string,
    chart: ReturnType<typeof buildTrendChartForSeries>,
  ) => {
    if (editable) {
      return;
    }
    const svg = svgRef.current;
    const element = elements.find((candidate) => candidate.id === elementId) as TrendElement | undefined;
    const points = element ? getTrendPoints(element, trendRuntimeStates) : undefined;
    if (!svg || !points || points.length === 0 || cursorDrag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const requestedTime = trendTimeForX(chart, svgPointFromEvent(svg, event.clientX, event.clientY).x);
    const time = clampTrendCursorTime(points, requestedTime);
    if (time === undefined) {
      return;
    }
    const cursor: TrendCursor = { id: `cursor-${nextCursorId.current}`, time };
    nextCursorId.current += 1;
    setCursorsByTrend((current) => {
      const next = { ...current };
      for (const trendElement of elements.filter((candidate) => candidate.type === TREND_TYPE)) {
        next[trendElement.id] = [...(next[trendElement.id] ?? []), cursor];
      }
      return next;
    });
    setSelectedCursor({ trendElementId: elementId, cursorId: cursor.id });
    svg.focus();
  }, [cursorDrag, editable, elements, trendRuntimeStates]);

  const handleTrendCursorPointerDown = useCallback((
    event: React.PointerEvent<SVGLineElement>,
    elementId: string,
    cursor: TrendCursor,
  ) => {
    if (editable) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    trySetPointerCapture(svg, event.pointerId);
    setSelectedCursor({ trendElementId: elementId, cursorId: cursor.id });
    setCursorDrag({ trendElementId: elementId, cursorId: cursor.id, pointerId: event.pointerId });
    svg.focus();
  }, [editable]);

  const removeTrendCursor = useCallback((cursorId: string) => {
    setCursorsByTrend((current) => Object.fromEntries(
      Object.entries(current).flatMap(([trendElementId, cursors]) => {
        const remaining = cursors.filter((cursor) => cursor.id !== cursorId);
        return remaining.length > 0 ? [[trendElementId, remaining]] : [];
      }),
    ));
    setSelectedCursor((current) => current?.cursorId === cursorId ? null : current);
    setCursorDrag((current) => current?.cursorId === cursorId ? null : current);
  }, []);

  const handleTrendCursorDoubleClick = useCallback((
    event: React.MouseEvent<SVGLineElement>,
    _elementId: string,
    cursor: TrendCursor,
  ) => {
    if (editable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    removeTrendCursor(cursor.id);
  }, [editable, removeTrendCursor]);

  const selectedElement = selectedElementId
    ? getElementById(displayDocument, selectedElementId) ?? null
    : null;

  const handleSvgPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      if (!editable) {
        return;
      }

      const target = e.target as Element;
      const elementId = target.getAttribute('data-element-id')
        ?? target.closest('[data-element-id]')?.getAttribute('data-element-id');
      const handleAttr = target.getAttribute('data-resize-handle');

      trySetPointerCapture(svg, e.pointerId);

      if (handleAttr && elementId) {
        onStartResize(
          elementId,
          handleAttr as ResizeHandle,
          svgPointFromEvent(svg, e.clientX, e.clientY),
        );
        return;
      }

      if (elementId) {
        onStartDrag(
          elementId,
          svgPointFromEvent(svg, e.clientX, e.clientY),
        );
        return;
      }

      onSelect(null);
    },
    [editable, onSelect, onStartDrag, onStartResize],
  );

  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      if (cursorDrag) {
        if (cursorDrag.pointerId !== e.pointerId) {
          return;
        }
        const element = elements.find((candidate) => candidate.id === cursorDrag.trendElementId);
        if (!element || element.type !== TREND_TYPE) {
          return;
        }
        const trendElement = element as TrendElement;
        const seriesPoints = getTrendSeriesStates(trendElement, trendRuntimeStates)
          .flatMap(({ runtimeState }) => runtimeState.data?.points ? [runtimeState.data.points] : []);
        const points = seriesPoints.flat().sort((left, right) => left.time - right.time);
        if (points.length === 0) {
          return;
        }
        const chart = buildTrendChartForSeries(trendElement, seriesPoints, trendTimeRange);
        const time = clampTrendCursorTime(points, trendTimeForX(chart, svgPointFromEvent(svg, e.clientX, e.clientY).x));
        if (time === undefined) {
          return;
        }
        setCursorsByTrend((current) => Object.fromEntries(
          Object.entries(current).map(([trendElementId, cursors]) => [
            trendElementId,
            cursors.map((cursor) => cursor.id === cursorDrag.cursorId ? { ...cursor, time } : cursor),
          ]),
        ));
        return;
      }
      if (!editable) {
        return;
      }
      if (!hasPointerCapture(svg, e.pointerId)) {
        return;
      }
      onPointerMove(svgPointFromEvent(svg, e.clientX, e.clientY));
    },
    [cursorDrag, editable, elements, onPointerMove, trendRuntimeStates, trendTimeRange],
  );

  const handleSvgPointerEnd = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      if (cursorDrag) {
        if (cursorDrag.pointerId === e.pointerId) {
          tryReleasePointerCapture(svg, e.pointerId);
          setCursorDrag(null);
        }
        return;
      }
      if (!editable) {
        return;
      }
      tryReleasePointerCapture(svg, e.pointerId);
      onPointerEnd();
    },
    [cursorDrag, editable, onPointerEnd],
  );

  const handleSurfaceKeyDown = useCallback((event: React.KeyboardEvent<SVGSVGElement>) => {
    if (editable || !selectedCursor || (event.key !== 'Delete' && event.key !== 'Backspace')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    removeTrendCursor(selectedCursor.cursorId);
  }, [editable, removeTrendCursor, selectedCursor]);

  const handlePositions = selectedElement
    ? getResizeHandlePositions({
        x: selectedElement.x,
        y: selectedElement.y,
        width: selectedElement.width,
        height: selectedElement.height,
      })
    : [];
  const viewportWidth = surface.width / zoom;
  const viewportHeight = surface.height / zoom;
  const viewportX = (viewCenter?.x ?? surface.width / 2) - viewportWidth / 2;
  const viewportY = (viewCenter?.y ?? surface.height / 2) - viewportHeight / 2;

  return (
    <svg
      ref={svgRef}
      width={surface.width}
      height={surface.height}
      viewBox={`${viewportX} ${viewportY} ${viewportWidth} ${viewportHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      className={css`
        display: block;
        touch-action: none;
        user-select: none;
      `}
      data-testid="display-surface"
      tabIndex={0}
      aria-label="Superfície do display"
      onPointerDown={handleSvgPointerDown}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerEnd}
      onPointerCancel={handleSvgPointerEnd}
      onKeyDown={handleSurfaceKeyDown}
    >
      <defs>
        <pattern id="visualization-editor-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--canvas-dot)" />
        </pattern>
      </defs>
      <rect
        x={viewportX}
        y={viewportY}
        width={viewportWidth}
        height={viewportHeight}
        fill={surface.backgroundColor}
        className={surface.backgroundColor.toLowerCase() === DEFAULT_SURFACE_BACKGROUND ? themedDefaultSurface : undefined}
        data-testid="display-surface-background"
      />
      {editable && (
        <rect
          x={viewportX}
          y={viewportY}
          width={viewportWidth}
          height={viewportHeight}
          fill="url(#visualization-editor-grid)"
          pointerEvents="none"
          data-testid="display-surface-grid"
        />
      )}

      {elements.map((element) => {
        if (element.type === VALUE_TYPE && isPiPointBinding(element.properties.binding)) {
          return (
            <ValueElementView
              key={element.id}
              element={element as unknown as ValueElement}
              runtimeState={runtimeStates.get(element.id) ?? { status: 'loading' }}
            />
          );
        }
        if (element.type === GAUGE_TYPE) {
          return (
            <GaugeElementView
              key={element.id}
              element={element as unknown as GaugeElement}
              runtimeState={runtimeStates.get(element.id)}
            />
          );
        }
        if (element.type === BAR_TYPE) {
          return (
            <BarElementView
              key={element.id}
              element={element as unknown as BarElement}
              runtimeState={runtimeStates.get(element.id)}
            />
          );
        }
        if (element.type === TREND_TYPE) {
          const trendElement = element as unknown as TrendElement;
          const seriesStates = getTrendSeriesStates(trendElement, trendRuntimeStates);
          if (seriesStates.length === 0) {
            return null;
          }
          return (
            <TrendElementView
              key={element.id}
              element={trendElement}
              seriesStates={seriesStates}
              cursors={cursorsByTrend[element.id] ?? []}
              cursorEnabled={cursorEnabled}
              selectedCursorId={cursorEnabled ? selectedCursor?.cursorId ?? null : null}
              onPlotPointerDown={cursorEnabled ? handleTrendPlotPointerDown : undefined}
              onCursorPointerDown={cursorEnabled ? handleTrendCursorPointerDown : undefined}
              onCursorDoubleClick={cursorEnabled ? handleTrendCursorDoubleClick : undefined}
              timeRange={trendTimeRange}
              onDoubleClick={handleTrendDoubleClick}
              onContextMenu={handleTrendContextMenu}
            />
          );
        }
        return (
          <rect
            key={element.id}
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            fill={getElementFill(element)}
            stroke={getElementStroke(element)}
            strokeWidth={1}
            data-testid={`display-element-${element.id}`}
            data-element-id={element.id}
            data-element-type={element.type}
            style={{ cursor: 'move' }}
          />
        );
      })}

      {selectedElement && (
        <g data-testid="display-selection-overlay">
          <rect
            x={selectedElement.x - 1}
            y={selectedElement.y - 1}
            width={selectedElement.width + 2}
            height={selectedElement.height + 2}
            fill="none"
            stroke={SELECTION_STROKE}
            strokeWidth={1}
            strokeDasharray="4 2"
            data-testid="display-selection-bounding-box"
            pointerEvents="none"
          />

          {handlePositions.map((pos) => {
            const rect = getResizeHandleRect(pos, HANDLE_SIZE);
            return (
              <rect
                key={pos.handle}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill={HANDLE_FILL}
                stroke={HANDLE_STROKE}
                strokeWidth={1}
                data-testid={`display-resize-handle-${pos.handle}`}
                data-element-id={selectedElement.id}
                data-resize-handle={pos.handle}
                style={{ cursor: getHandleCursor(pos.handle) }}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

function getTrendSeriesStates(
  element: TrendElement,
  runtimeStates: ReadonlyMap<string, TrendRuntimeState>,
): TrendSeriesViewState[] {
  return getTrendSeries(element).map((series) => ({
    series,
    runtimeState: runtimeStates.get(getTrendSeriesConsumerId(element.id, series.binding)) ?? { status: 'loading' },
  }));
}

function getTrendPoints(
  element: TrendElement,
  runtimeStates: ReadonlyMap<string, TrendRuntimeState>,
) {
  const points = getTrendSeriesStates(element, runtimeStates)
    .flatMap(({ runtimeState }) => runtimeState.data?.points
      ?? runtimeState.data?.states?.map((state) => ({ time: state.time, value: 0 }))
      ?? [])
    .sort((left, right) => left.time - right.time);
  return points.length > 0 ? points : undefined;
}

function getElementFill(element: DisplayDocument['elements'][number]): string {
  if (element.type !== RECTANGLE_TYPE) {
    return ELEMENT_FILL;
  }
  const fill = element.properties.fill;
  return typeof fill === 'string' ? fill : DEFAULT_RECTANGLE_PROPERTIES.fill;
}

function getElementStroke(element: DisplayDocument['elements'][number]): string {
  if (element.type !== RECTANGLE_TYPE) {
    return ELEMENT_STROKE;
  }
  const stroke = element.properties.stroke;
  return typeof stroke === 'string' ? stroke : DEFAULT_RECTANGLE_PROPERTIES.stroke;
}
