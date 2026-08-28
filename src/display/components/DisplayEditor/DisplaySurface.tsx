import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import type { DisplayDocument } from '../../displayDocument';
import type { DisplayElement } from '../../displayElement';
import { DEFAULT_RECTANGLE_PROPERTIES, RECTANGLE_TYPE, type RectangleElement } from '../../createRectangle';
import { VALUE_TYPE, type ValueElement } from '../../createValue';
import { CALCULATION_TYPE, type CalculationElement } from '../../createCalculation';
import { CalculationElementView } from '../CalculationElementView';
import { evaluateCalculation, type CalculationDefinition } from '../../../calculations/calculationEngine';
import { createTrendElementForElement, getTrendSeries, TREND_TYPE, type TrendElement, type TrendSeries } from '../../createTrend';
import { BAR_TYPE, getBarOptions, type BarElement } from '../../createBar';
import { BAR_CHART_TYPE, getBarChartVisualOptions, getBarChartItemConsumerId, type BarChartElement } from '../../createBarChart';
import { TABLE_TYPE, type TableColumnConfig, type TableElement } from '../../createTable';
import { TableElementView, getTableItemConsumerId, getTableTrendConsumerId } from '../TableElementView';
import { SQL_TABLE_TYPE, type SqlTableElement } from '../../createSqlTable';
import { SqlTableElementView } from '../SqlTableElementView';
import { GAUGE_TYPE, getGaugeOptions, type GaugeElement } from '../../createGauge';
import { ValueElementView } from '../ValueElementView';
import { GaugeElementView } from '../GaugeElementView';
import { BarElementView } from '../BarElementView';
import { BarChartElementView } from '../BarChartElementView';
import {
  TrendElementView,
  buildTrendChartForSeries,
  trendTimeForX,
  type TrendSeriesViewState,
} from '../TrendElementView';
import type { PiPointValue, PiPointValueResult, PiTrendSeries, PiTrendSeriesResult } from '../../../pi/piDataSource';
import { isPiPointBinding, type PiPointBinding, type PiPointDatabaseLimits } from '../../../pi/piPointBinding';
import type { DisplayTimeRange } from '../../../time/timeRange';
import { useValueRuntime, type LoadCurrentValues, type ValueRuntimeConsumer, type ValueRuntimeState } from '../../runtime/valueRuntime';
import { evaluateMultistate, getMultistateColor } from '../../multistate';
import { TEXT_TYPE, type TextElement } from '../../createText';
import { resolveThemeForeground } from '../../themeColor';
import { IMAGE_TYPE, type ImageElement } from '../../createImage';
import { PROGRAMMING_TYPE, type ProgrammingElement } from '../../createProgramming';
import { ProgrammingDisplayElementView, getProgrammingConsumerId } from '../../../programming/ProgrammingDisplayElementView';
import { getLibrarySymbolColor, LIBRARY_SYMBOL_TYPE, type LibrarySymbolElement } from '../../createLibrarySymbol';
import { extractAllGroupBindingsAndElements, findTopLevelElementId, getElementAbsoluteGeometry, GROUP_TYPE, type GroupElement } from '../../createGroup';
import { isElementLocked } from '../../createLocked';
import { findIndustrialSymbol, getIndustrialSymbolAssetUrl } from '../../../library';
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
  getCanvasBounds,
  getResizeHandlePositions,
  getResizeHandleRect,
  getHandleCursor,
  svgPointFromEvent,
  type AlignmentGuide,
  type Point,
  type ResizeHandle,
} from './editorGeometry';
import { zoomViewportAtPoint, type SurfaceViewport } from './viewportZoom';

const HANDLE_SIZE = 8;
const ELEMENT_FILL = 'rgba(110, 159, 255, 0.15)';
const ELEMENT_STROKE = '#6e9fff';
const SELECTION_STROKE = 'var(--selection-outline, #6e9fff)';
const HANDLE_FILL = 'var(--selection-handle-fill, #ffffff)';
const HANDLE_STROKE = 'var(--selection-outline, #6e9fff)';
const DEFAULT_SURFACE_BACKGROUND = '#1f1f1f';
const themedDefaultSurface = css`
  fill: var(--canvas-bg);
`;

function evaluateCalculationFromRuntime(
  calculation: CalculationDefinition,
  states: Array<ValueRuntimeState | undefined>,
) {
  const values = new Map<string, unknown>();
  for (const [index, state] of states.entries()) {
    if (!state || state.status === 'loading') {
      return { status: 'loading' as const };
    }
    if (state.status === 'error') {
      return { status: 'error' as const, error: new Error('Consulta PI indisponível.') };
    }
    values.set(calculation.inputs[index].name, state.result.value);
  }
  return evaluateCalculation(calculation, values);
}

function calculationValueRuntimeState(
  calculation: CalculationDefinition,
  elementId: string,
  runtimeStates: ReadonlyMap<string, ValueRuntimeState>,
): ValueRuntimeState {
  const evaluation = evaluateCalculationFromRuntime(
    calculation,
    calculation.inputs.map((input) => runtimeStates.get(`${elementId}:${input.name}`)),
  );
  if (evaluation.status === 'loading') {
    return { status: 'loading' };
  }
  if (evaluation.status === 'error') {
    return { status: 'error' };
  }
  return { status: 'success', result: { value: evaluation.value } };
}

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
  selectedElementIds: string[];
  onSelect: (elementId: string | null) => void;
  onSelectMany: (elementIds: string[], additive?: boolean) => void;
  onDoubleClick?: (elementId: string) => void;
  onStartDrag: (elementId: string, pointer: Point, selectedIds?: string[]) => void;
  onStartResize: (elementId: string, handle: ResizeHandle, pointer: Point) => void;
  onPointerMove: (pointer: Point) => void;
  onPointerEnd: () => void;
  alignmentGuides?: readonly AlignmentGuide[];
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  loadPiPointDatabaseLimits?: (binding: PiPointBinding) => Promise<PiPointDatabaseLimits>;
  loadValues?: LoadCurrentValues;
  loadTrend?: LoadTrendSeries;
  trendRefreshKey?: string;
  trendTimeRange?: DisplayTimeRange;
  onTrendOpen?: (element: TrendElement, seriesStates: readonly TrendSeriesViewState[], cursors?: readonly TrendCursor[]) => void;
  onTrendContextMenu?: (element: TrendElement, event?: React.MouseEvent) => void;
  onTrendLegendContextMenu?: (series: TrendSeries, value: string | number | undefined) => void;
  onElementContextMenu?: (element: DisplayElement, event?: React.MouseEvent) => void;
  onLibrarySymbolContextMenu?: (element: LibrarySymbolElement, event?: React.MouseEvent) => void;
  onTableColumnsChange?: (elementId: string, columns: TableColumnConfig[]) => void;
  onTrendLegendWidthChange?: (elementId: string, legendWidth: number) => void;
  zoom?: number;
  viewCenter?: Point;
  onViewportWheelZoom?: (viewport: SurfaceViewport) => void;
  minZoom?: number;
  maxZoom?: number;
  wheelZoomFactor?: number;
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
  selectedElementIds,
  onSelect,
  onSelectMany,
  onDoubleClick,
  onStartDrag,
  onStartResize,
  onPointerMove,
  onPointerEnd,
  alignmentGuides = [],
  loadValue,
  loadPiPointDatabaseLimits,
  loadValues,
  loadTrend,
  trendRefreshKey,
  trendTimeRange,
  onTrendOpen,
  onTrendContextMenu,
  onTrendLegendContextMenu,
  onElementContextMenu,
  onLibrarySymbolContextMenu,
  onTableColumnsChange,
  onTrendLegendWidthChange,
  zoom = 1,
  viewCenter,
  onViewportWheelZoom,
  minZoom = 0.1,
  maxZoom = 5,
  wheelZoomFactor = 1.1,
}: DisplaySurfaceProps) {
  const { surface, elements } = displayDocument;
  const cursorEnabled = !editable;
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SurfaceViewport>({
    zoom,
    viewCenter: viewCenter ?? { x: displayDocument.surface.width / 2, y: displayDocument.surface.height / 2 },
  });
  const nextCursorId = useRef(1);
  const [cursorsByTrend, setCursorsByTrend] = useState<Record<string, TrendCursor[]>>({});
  const [selectedCursor, setSelectedCursor] = useState<CursorSelection | null>(null);
  const [cursorDrag, setCursorDrag] = useState<CursorDrag | null>(null);
  const [databaseScales, setDatabaseScales] = useState<Record<string, PiPointDatabaseLimits>>({});
  useEffect(() => {
    viewportRef.current = {
      zoom,
      viewCenter: viewCenter ?? { x: surface.width / 2, y: surface.height / 2 },
    };
  }, [surface.height, surface.width, viewCenter, zoom]);
  const allElements = useMemo(() => extractAllGroupBindingsAndElements(elements), [elements]);

  useEffect(() => {
    if (!loadPiPointDatabaseLimits) {
      return;
    }
    const databaseElements = allElements.flatMap((element): Array<{ id: string; binding: PiPointBinding }> => {
      if (element.type === BAR_TYPE) {
        return getBarOptions(element.properties).scaleMode === 'database' && isPiPointBinding(element.properties.binding)
          ? [{ id: element.id, binding: element.properties.binding as PiPointBinding }]
          : [];
      }
      if (element.type === GAUGE_TYPE) {
        return getGaugeOptions(element.properties).scaleMode === 'database' && isPiPointBinding(element.properties.binding)
          ? [{ id: element.id, binding: element.properties.binding as PiPointBinding }]
          : [];
      }
      if (element.type === BAR_CHART_TYPE) {
        const barChart = element as BarChartElement;
        const visual = getBarChartVisualOptions(barChart);
        return visual.scaleMode === 'database'
          ? (barChart.properties.items ?? []).map((item) => ({
              id: getBarChartItemConsumerId(barChart.id, item.binding),
              binding: item.binding,
            }))
          : [];
      }
      return [];
    });
    void Promise.all(databaseElements.map(async (item) => {
      try { return [item.id, await loadPiPointDatabaseLimits(item.binding)] as const; } catch { return null; }
    })).then((results) => setDatabaseScales(Object.fromEntries(results.filter((item): item is readonly [string, PiPointDatabaseLimits] => item !== null))));
  }, [allElements, loadPiPointDatabaseLimits]);
  const [selectionBox, setSelectionBoxState] = useState<{ start: Point; current: Point } | null>(null);
  const selectionBoxRef = useRef<{ start: Point; current: Point } | null>(null);
  const setSelectionBox = useCallback((box: { start: Point; current: Point } | null) => {
    selectionBoxRef.current = box;
    setSelectionBoxState(box);
  }, []);
  const multiSelectionRef = useRef(false);

  useEffect(() => {
    if (!editable) {
      return;
    }
    setCursorsByTrend({});
    setSelectedCursor(null);
    setCursorDrag(null);
  }, [editable]);

  const calculations = useMemo(() => displayDocument.calculations ?? [], [displayDocument.calculations]);
  const valueConsumers: ValueRuntimeConsumer[] = allElements.flatMap((element) => {
    if (element.type === CALCULATION_TYPE) {
      const calculation = calculations.find((item) => item.id === element.properties.calculationId);
      return calculation?.inputs.map((input) => ({ elementId: `${element.id}:${input.name}`, binding: input.binding })) ?? [];
    }
    const calculationId = typeof (element.properties as { calculationId?: unknown }).calculationId === 'string'
      ? (element.properties as { calculationId: string }).calculationId
      : undefined;
    if (calculationId && (element.type === VALUE_TYPE || element.type === GAUGE_TYPE || element.type === BAR_TYPE || element.type === RECTANGLE_TYPE || element.type === LIBRARY_SYMBOL_TYPE || element.type === TEXT_TYPE)) {
      const calculation = calculations.find((item) => item.id === calculationId);
      return calculation?.inputs.map((input) => ({ elementId: `${element.id}:${input.name}`, binding: input.binding })) ?? [];
    }
    if (element.type === PROGRAMMING_TYPE) {
      return (element as ProgrammingElement).properties.query.map((item, index) => ({
        elementId: getProgrammingConsumerId(element.id, index),
        binding: item.binding,
      }));
    }
    return (element.type === VALUE_TYPE || element.type === GAUGE_TYPE || element.type === BAR_TYPE || element.type === RECTANGLE_TYPE || element.type === LIBRARY_SYMBOL_TYPE || element.type === TEXT_TYPE)
      && isPiPointBinding(element.properties.binding)
      ? [{ elementId: element.id, binding: element.properties.binding }]
      : [];
  }).concat(allElements.flatMap((element) => {
    if (element.type === TABLE_TYPE) {
      return (element as TableElement).properties.items.map((item, index) => ({ elementId: getTableItemConsumerId(element.id, index), binding: item.binding }));
    }
    if (element.type === BAR_CHART_TYPE) {
      return (element as BarChartElement).properties.items.map((item) => ({
        elementId: getBarChartItemConsumerId(element.id, item.binding),
        binding: item.binding,
      }));
    }
    return [];
  }));
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
  const trendConsumers: TrendRuntimeConsumer[] = allElements.flatMap((element) => {
    if (element.type === TABLE_TYPE) {
      return (element as TableElement).properties.items.map((item, index) => ({ elementId: element.id, consumerId: getTableTrendConsumerId(element.id, index), binding: item.binding, width: Math.max(80, element.width / 4) }));
    }
    if (element.type !== TREND_TYPE) {
      return [];
    }
    return getTrendSeries(element as TrendElement).filter((series) => !series.calculationId).map(({ binding }) => ({
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
  const calculationTrendElements = useMemo(() => allElements.flatMap((element) => {
    if (element.type !== TREND_TYPE) {
      return [];
    }
    return getTrendSeries(element as TrendElement)
      .filter((series) => Boolean(series.calculationId))
      .map((series) => ({ element: element as TrendElement, series }));
  }), [allElements]);
  const calculationTrendSignature = calculationTrendElements.map(({ element, series }) => `${element.id}:${series.calculationId}`).join('|');
  const [calculationTrendStates, setCalculationTrendStates] = useState<Map<string, TrendRuntimeState>>(new Map());
  useEffect(() => {
    let active = true;
    const next = new Map<string, TrendRuntimeState>();
    if (calculationTrendElements.length === 0) {
      setCalculationTrendStates(next);
      return () => { active = false; };
    }
    if (!loadTrend) {
      calculationTrendElements.forEach(({ element, series }) => {
        next.set(getTrendSeriesConsumerId(element.id, series.binding), { status: 'error', error: new Error('Consulta histórica PI indisponível') });
      });
      setCalculationTrendStates(next);
      return () => { active = false; };
    }
    const calculationsById = new Map(calculations.map((calculation) => [calculation.id, calculation]));
    void Promise.all(calculationTrendElements.map(async ({ element, series }) => {
      const calculation = series.calculationId ? calculationsById.get(series.calculationId) : undefined;
      if (!calculation) {
        return [element, series, { status: 'error', error: new Error('Cálculo não encontrado') } as TrendRuntimeState] as const;
      }
      const results = await loadTrend(calculation.inputs.map((input) => input.binding), undefined, { maxDataPoints: 1000 });
      const inputSeries = calculation.inputs.map((input) => results[getPiBindingKey(input.binding)]);
      if (inputSeries.some((result) => !result || result.status !== 'success')) {
        return [element, series, { status: 'error', error: new Error('Não foi possível carregar o histórico do cálculo') } as TrendRuntimeState] as const;
      }
      const points = calculateHistoricalPoints(calculation, inputSeries.map((result) => result.status === 'success' ? result.series : undefined), trendTimeRange);
      return [element, series, { status: 'success', data: { pointName: calculation.name, points } } as TrendRuntimeState] as const;
    })).then((results) => {
      if (!active) {
        return;
      }
      results.forEach(([element, series, state]) => next.set(getTrendSeriesConsumerId(element.id, series.binding), state));
      setCalculationTrendStates(next);
    }).catch(() => {
      if (active) {
        setCalculationTrendStates(next);
      }
    });
    return () => { active = false; };
  }, [calculationTrendElements, calculationTrendSignature, calculations, loadTrend, trendRefreshKey]);
  const allTrendRuntimeStates = useMemo(
    () => new Map([...trendRuntimeStates, ...calculationTrendStates]),
    [calculationTrendStates, trendRuntimeStates],
  );

  const handleTrendDoubleClick = useCallback((
    event: React.MouseEvent<SVGGElement>,
    elementId: string,
  ) => {
    if (editable) {
      return;
    }
    const element = allElements.find((candidate) => candidate.id === elementId)
      ?? elements.find((candidate) => candidate.id === elementId);
    if (!element) {
      return;
    }
    const trendElement = createTrendElementForElement(element);
    if (!trendElement) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!onTrendOpen) {
      return;
    }
    onTrendOpen(trendElement, getTrendSeriesStates(trendElement, allTrendRuntimeStates), cursorsByTrend[element.id] ?? []);
  }, [allElements, allTrendRuntimeStates, cursorsByTrend, editable, elements, onTrendOpen]);
  const handleTrendContextMenu = useCallback((event: React.MouseEvent<SVGGElement>, elementId: string) => {
    if (!editable) {
      return;
    }
    const topLevelId = findTopLevelElementId(elements, elementId) ?? elementId;
    const topLevelElement = elements.find((candidate) => candidate.id === topLevelId);
    if (!topLevelElement) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (topLevelElement.type === GROUP_TYPE) {
      onElementContextMenu?.(topLevelElement, event);
    } else if (topLevelElement.type === TREND_TYPE) {
      onTrendContextMenu?.(topLevelElement as TrendElement, event);
    } else {
      onElementContextMenu?.(topLevelElement, event);
    }
  }, [editable, elements, onElementContextMenu, onTrendContextMenu]);

  const handleTrendLegendContextMenu = useCallback((event: React.MouseEvent<SVGGElement>, _elementId: string, series: TrendSeries, value: string | number | undefined) => {
    if (editable) return;
    event.preventDefault();
    event.stopPropagation();
    onTrendLegendContextMenu?.(series, value);
  }, [editable, onTrendLegendContextMenu]);

  const handleLibrarySymbolContextMenu = useCallback((event: React.MouseEvent<SVGElement>, elementId: string) => {
    if (!editable) {
      return;
    }
    const topLevelId = findTopLevelElementId(elements, elementId) ?? elementId;
    const topLevelElement = elements.find((candidate) => candidate.id === topLevelId);
    if (!topLevelElement) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (topLevelElement.type === GROUP_TYPE) {
      onElementContextMenu?.(topLevelElement, event);
    } else if (topLevelElement.type === LIBRARY_SYMBOL_TYPE) {
      onLibrarySymbolContextMenu?.(topLevelElement as LibrarySymbolElement, event);
    } else {
      onElementContextMenu?.(topLevelElement, event);
    }
  }, [editable, elements, onElementContextMenu, onLibrarySymbolContextMenu]);

  const handleElementContextMenu = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (!editable) {
      return;
    }
    const target = event.target as Element;
    const rawId = target.getAttribute('data-element-id') ?? target.closest('[data-element-id]')?.getAttribute('data-element-id');
    const topLevelId = rawId ? (findTopLevelElementId(elements, rawId) ?? rawId) : undefined;
    const element = topLevelId ? elements.find((candidate) => candidate.id === topLevelId) : undefined;
    if (!element) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (element.type === TREND_TYPE) {
      onTrendContextMenu?.(element as TrendElement, event);
    } else if (element.type === LIBRARY_SYMBOL_TYPE) {
      onLibrarySymbolContextMenu?.(element as LibrarySymbolElement, event);
    } else {
      onElementContextMenu?.(element, event);
    }
  }, [editable, elements, onElementContextMenu, onLibrarySymbolContextMenu, onTrendContextMenu]);

  useEffect(() => {
    setCursorsByTrend((current) => {
      let changed = false;
      const next: Record<string, TrendCursor[]> = {};
      for (const [elementId, cursors] of Object.entries(current)) {
        if (!allElements.some((element) => element.id === elementId && element.type === TREND_TYPE)) {
          changed = true;
          continue;
        }
        const element = allElements.find((candidate) => candidate.id === elementId) as TrendElement | undefined;
        const points = element ? getTrendPoints(element, allTrendRuntimeStates) : undefined;
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
  }, [allElements, allTrendRuntimeStates]);

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
    const element = allElements.find((candidate) => candidate.id === elementId) as TrendElement | undefined;
    const points = element ? getTrendPoints(element, allTrendRuntimeStates) : undefined;
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
      for (const trendElement of allElements.filter((candidate) => candidate.type === TREND_TYPE)) {
        next[trendElement.id] = [...(next[trendElement.id] ?? []), cursor];
      }
      return next;
    });
    setSelectedCursor({ trendElementId: elementId, cursorId: cursor.id });
    svg.focus();
  }, [allElements, allTrendRuntimeStates, cursorDrag, editable]);

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
  const selectedElementGeom = selectedElement
    ? (getElementAbsoluteGeometry(elements, selectedElement.id) ?? selectedElement)
    : null;

  const handleSvgDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const rawId = target.getAttribute('data-element-id')
      ?? target.closest('[data-element-id]')?.getAttribute('data-element-id');
    if (!rawId) {
      return;
    }
    if (editable) {
      e.preventDefault();
      e.stopPropagation();
      onDoubleClick?.(rawId);
      onSelect(rawId);
      return;
    }

    // View mode: open trend popup for any element that has a tag
    const element = allElements.find((candidate) => candidate.id === rawId)
      ?? elements.find((candidate) => candidate.id === rawId);
    if (!element) {
      return;
    }
    const trendElement = createTrendElementForElement(element);
    if (!trendElement) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!onTrendOpen) {
      return;
    }
    onTrendOpen(
      trendElement,
      getTrendSeriesStates(trendElement, allTrendRuntimeStates),
      cursorsByTrend[element.id] ?? [],
    );
  }, [allElements, allTrendRuntimeStates, cursorsByTrend, editable, elements, onDoubleClick, onSelect, onTrendOpen]);

  const handleElementClick = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (editable) {
      return;
    }
    const target = event.target as Element;
    const rawId = target.getAttribute('data-element-id') ?? target.closest('[data-element-id]')?.getAttribute('data-element-id');
    const elementId = rawId ? (findTopLevelElementId(displayDocument.elements, rawId) ?? rawId) : undefined;
    const element = elementId ? displayDocument.elements.find((candidate) => candidate.id === elementId) : undefined;
    if (element?.type === TREND_TYPE) {
      return;
    }
    const linkUrl = element && typeof (element.properties as { linkUrl?: unknown }).linkUrl === 'string' ? (element.properties as { linkUrl: string }).linkUrl.trim() : '';
    if (linkUrl) {
      event.preventDefault();
      const openInNewTab = (element?.properties as { openInNewTab?: unknown }).openInNewTab !== false;
      window.open(linkUrl, openInNewTab ? '_blank' : '_self', openInNewTab ? 'noopener,noreferrer' : undefined);
    }
  }, [displayDocument.elements, editable]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey || event.deltaY === 0) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    event.preventDefault();
    const anchor = svgPointFromEvent(svg, event.clientX, event.clientY);
    const nextViewport = zoomViewportAtPoint(
      viewportRef.current,
      anchor,
      event.deltaY < 0 ? 'in' : 'out',
      minZoom,
      maxZoom,
      wheelZoomFactor,
    );
    viewportRef.current = nextViewport;
    onViewportWheelZoom?.(nextViewport);
  }, [maxZoom, minZoom, onViewportWheelZoom, wheelZoomFactor]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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
      const rawId = target.getAttribute('data-element-id')
        ?? target.closest('[data-element-id]')?.getAttribute('data-element-id');

      if (rawId && e.detail >= 2) {
        onDoubleClick?.(rawId);
        onSelect(rawId);
        return;
      }

      const handleAttr = target.getAttribute('data-resize-handle');
      const elementId = handleAttr ? rawId : (rawId ? (findTopLevelElementId(elements, rawId) ?? rawId) : undefined);
      const clickedEl = elementId ? getElementById(displayDocument, elementId) : undefined;
      const isLocked = isElementLocked(clickedEl);

      if (e.button === 2) {
        if (elementId) {
          if (!selectedElementIds.includes(elementId)) {
            multiSelectionRef.current = false;
            onSelectMany([elementId]);
          }
        }
        return;
      }

      trySetPointerCapture(svg, e.pointerId);

      if (handleAttr && elementId && !isLocked) {
        onStartResize(
          elementId,
          handleAttr as ResizeHandle,
          svgPointFromEvent(svg, e.clientX, e.clientY),
        );
        return;
      }

      if (elementId) {
        if (e.ctrlKey || e.metaKey) {
          multiSelectionRef.current = true;
          onSelectMany([elementId], true);
          return;
        }
        const preserveSelection = selectedElementIds.includes(elementId);
        if (!preserveSelection) {
          multiSelectionRef.current = false;
          onSelectMany([elementId]);
        }
        if (!isLocked) {
          onStartDrag(
            elementId,
            svgPointFromEvent(svg, e.clientX, e.clientY),
            preserveSelection ? selectedElementIds : [elementId],
          );
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        onSelectMany([], true);
      } else {
        onSelect(null);
        const point = svgPointFromEvent(svg, e.clientX, e.clientY);
        selectionBoxRef.current = { start: point, current: point };
        setSelectionBox(selectionBoxRef.current);
      }
    },
    [displayDocument, editable, elements, onSelect, onSelectMany, onStartDrag, onStartResize, selectedElementIds, setSelectionBox],
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
        const element = allElements.find((candidate) => candidate.id === cursorDrag.trendElementId);
        if (!element || element.type !== TREND_TYPE) {
          return;
        }
        const trendElement = element as TrendElement;
        const seriesPoints = getTrendSeriesStates(trendElement, allTrendRuntimeStates)
          .flatMap(({ runtimeState }) => runtimeState.data?.points ? [runtimeState.data.points] : []);
        const points = seriesPoints.flat().sort((left, right) => left.time - right.time);
        if (points.length === 0) {
          return;
        }
        const chart = buildTrendChartForSeries(trendElement, seriesPoints, trendTimeRange);
        const pointerPoint = svgPointFromEvent(svg, e.clientX, e.clientY);
        // Match PI Vision: dragging a cursor beyond the left edge removes it.
        // Keep a small tolerance so the cursor can still be positioned exactly
        // on the first sample without disappearing unexpectedly.
        if (pointerPoint.x < chart.plotX - 8) {
          tryReleasePointerCapture(svg, e.pointerId);
          removeTrendCursor(cursorDrag.cursorId);
          return;
        }
        const time = clampTrendCursorTime(points, trendTimeForX(chart, pointerPoint.x));
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
      if (selectionBoxRef.current) {
        const point = svgPointFromEvent(svg, e.clientX, e.clientY);
        selectionBoxRef.current = { ...selectionBoxRef.current, current: point };
        setSelectionBox(selectionBoxRef.current);
        return;
      }
      if (!hasPointerCapture(svg, e.pointerId)) {
        return;
      }
      onPointerMove(svgPointFromEvent(svg, e.clientX, e.clientY));
    },
    [allElements, allTrendRuntimeStates, cursorDrag, cursorsByTrend, editable, onPointerMove, removeTrendCursor, setSelectionBox, trendTimeRange],
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
      if (selectionBoxRef.current) {
        const start = selectionBoxRef.current.start;
        const current = selectionBoxRef.current.current;
        const isWindow = current.x >= start.x;
        const box = normalizeSelectionBox(start, current);
        if (box.width > 2 || box.height > 2) {
          const ids = elements
            .filter((element) => (isWindow ? isFullyInsideSelection(element, box) : intersectsSelection(element, box)))
            .map((element) => element.id);
          onSelectMany(ids);
          multiSelectionRef.current = ids.length > 1;
        } else {
          onSelect(null);
          multiSelectionRef.current = false;
        }
        selectionBoxRef.current = null;
        setSelectionBox(null);
        tryReleasePointerCapture(svg, e.pointerId);
        return;
      }
      tryReleasePointerCapture(svg, e.pointerId);
      onPointerEnd();
    },
    [cursorDrag, editable, elements, onPointerEnd, onSelect, onSelectMany, setSelectionBox],
  );

  const handleSurfaceKeyDown = useCallback((event: React.KeyboardEvent<SVGSVGElement>) => {
    if (editable || !selectedCursor || (event.key !== 'Delete' && event.key !== 'Backspace')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    removeTrendCursor(selectedCursor.cursorId);
  }, [editable, removeTrendCursor, selectedCursor]);

  const handlePositions = selectedElementGeom
    ? getResizeHandlePositions({
        x: selectedElementGeom.x,
        y: selectedElementGeom.y,
        width: selectedElementGeom.width,
        height: selectedElementGeom.height,
      })
    : [];
  const canvasBounds = getCanvasBounds(surface, elements);

  return (
    <svg
      onClick={handleElementClick}
      onDoubleClick={handleSvgDoubleClick}
      onContextMenu={handleElementContextMenu}
      ref={svgRef}
      width={canvasBounds.width}
      height={canvasBounds.height}
      viewBox={`${canvasBounds.left} ${canvasBounds.top} ${canvasBounds.width} ${canvasBounds.height}`}
      style={{ width: canvasBounds.width * zoom, height: canvasBounds.height * zoom, flex: '0 0 auto' }}
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
      <style>{'@keyframes pimsMultistateBlink{0%,49%{opacity:1}50%,100%{opacity:.2}}'}</style>
      <defs>
        <pattern id="visualization-editor-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--canvas-dot)" />
        </pattern>
        {allElements.filter((element) => element.type === LIBRARY_SYMBOL_TYPE).map((element) => {
          const symbol = element as LibrarySymbolElement;
          const source = getLibrarySymbolSource(symbol);
          return (
            <mask key={getLibrarySymbolMaskId(element.id)} id={getLibrarySymbolMaskId(element.id)} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x={element.x} y={element.y} width={element.width} height={element.height}>
              <image href={source} x={element.x} y={element.y} width={element.width} height={element.height} preserveAspectRatio="xMidYMid meet" />
            </mask>
          );
        })}
      </defs>
      <rect
        x={canvasBounds.left}
        y={canvasBounds.top}
        width={canvasBounds.width}
        height={canvasBounds.height}
        fill={surface.backgroundColor}
        className={surface.backgroundColor.toLowerCase() === DEFAULT_SURFACE_BACKGROUND ? themedDefaultSurface : undefined}
        data-testid="display-surface-background"
      />
      {editable && (
        <rect
          x={canvasBounds.left}
          y={canvasBounds.top}
          width={canvasBounds.width}
          height={canvasBounds.height}
          fill="url(#visualization-editor-grid)"
          pointerEvents="none"
          data-testid="display-surface-grid"
        />
      )}

      {(() => {
        const renderSingleElement = (element: DisplayElement): React.ReactNode => {
          if (element.type === GROUP_TYPE) {
            const group = element as GroupElement;
            const rotation = group.properties.rotation ?? 0;
            const children = group.properties.elements ?? [];
            return (
              <g
                key={element.id}
                data-testid={`display-element-${element.id}`}
                data-element-id={element.id}
                data-element-type={element.type}
                transform={rotation ? `rotate(${rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})` : undefined}
                style={{ cursor: isElementLocked(element) ? 'default' : 'move' }}
              >
                <g transform={`translate(${element.x}, ${element.y})`}>
                  {children.map((child) => renderSingleElement(child))}
                </g>
              </g>
            );
          }
          if (element.type === VALUE_TYPE && (isPiPointBinding(element.properties.binding) || typeof element.properties.calculationId === 'string')) {
            const calculation = typeof element.properties.calculationId === 'string'
              ? calculations.find((item) => item.id === element.properties.calculationId)
              : undefined;
            return (
              <ValueElementView
                key={element.id}
                element={element as unknown as ValueElement}
                runtimeState={calculation
                  ? calculationValueRuntimeState(calculation, element.id, runtimeStates)
                  : runtimeStates.get(element.id) ?? { status: 'loading' }}
                label={calculation?.name}
              />
            );
          }
          if (element.type === CALCULATION_TYPE) {
            const calculation = calculations.find((item) => item.id === element.properties.calculationId);
            if (!calculation) {
              return null;
            }
            const inputStates = calculation.inputs.map((input) => runtimeStates.get(`${element.id}:${input.name}`));
            const evaluation = evaluateCalculationFromRuntime(calculation, inputStates);
            return <CalculationElementView key={element.id} element={element as CalculationElement} calculationName={calculation.name} evaluation={evaluation} />;
          }
          if (element.type === GAUGE_TYPE) {
            const calculation = typeof element.properties.calculationId === 'string'
              ? calculations.find((item) => item.id === element.properties.calculationId)
              : undefined;
            return (
              <GaugeElementView
                key={element.id}
                element={element as unknown as GaugeElement}
                runtimeState={calculation
                  ? calculationValueRuntimeState(calculation, element.id, runtimeStates)
                  : runtimeStates.get(element.id)}
                databaseScale={databaseScales[element.id]}
                label={calculation?.name}
              />
            );
          }
          if (element.type === BAR_TYPE) {
            const calculation = typeof element.properties.calculationId === 'string'
              ? calculations.find((item) => item.id === element.properties.calculationId)
              : undefined;
            return (
              <BarElementView
                key={element.id}
                element={element as unknown as BarElement}
                runtimeState={calculation
                  ? calculationValueRuntimeState(calculation, element.id, runtimeStates)
                  : runtimeStates.get(element.id)}
                databaseScale={databaseScales[element.id]}
                label={calculation?.name}
              />
            );
          }
          if (element.type === BAR_CHART_TYPE) {
            return (
              <BarChartElementView
                key={element.id}
                element={element as unknown as BarChartElement}
                runtimeStates={runtimeStates}
                databaseScales={databaseScales}
              />
            );
          }
          if (element.type === TABLE_TYPE) {
            return <TableElementView key={element.id} element={element as TableElement} runtimeStates={runtimeStates} trendStates={trendRuntimeStates} onColumnsChange={editable ? (columns) => onTableColumnsChange?.(element.id, columns) : undefined} />;
          }
          if (element.type === SQL_TABLE_TYPE) {
            return <SqlTableElementView key={element.id} element={element as unknown as SqlTableElement} selected={selectedElementIds?.includes(element.id)} editable={editable} />;
          }
          if (element.type === TREND_TYPE) {
            const trendElement = element as unknown as TrendElement;
            const seriesStates = getTrendSeriesStates(trendElement, allTrendRuntimeStates);
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
                onLegendWidthChange={onTrendLegendWidthChange}
                timeRange={trendTimeRange}
                onDoubleClick={handleTrendDoubleClick}
                onContextMenu={handleTrendContextMenu}
                onLegendContextMenu={handleTrendLegendContextMenu}
              />
            );
          }
          if (element.type === RECTANGLE_TYPE) {
            const shape = element as RectangleElement;
            const calculation = typeof shape.properties.calculationId === 'string'
              ? calculations.find((item) => item.id === shape.properties.calculationId)
              : undefined;
            const runtimeState = calculation
              ? calculationValueRuntimeState(calculation, element.id, runtimeStates)
              : runtimeStates.get(element.id);
            return renderGeometricShape(shape, runtimeState);
          }
          if (element.type === TEXT_TYPE) {
            const textElement = element as TextElement;
            const calculation = typeof textElement.properties.calculationId === 'string'
              ? calculations.find((item) => item.id === textElement.properties.calculationId)
              : undefined;
            const runtimeState = calculation
              ? calculationValueRuntimeState(calculation, element.id, runtimeStates)
              : runtimeStates.get(element.id);
            const runtimeVal = runtimeState?.status === 'loading' ? undefined : runtimeState?.result?.value;
            const textColor = getMultistateColor(runtimeVal, textElement.properties.multistate, resolveThemeForeground(textElement.properties.color));
            const bgColor = getMultistateColor(runtimeVal, textElement.properties.backgroundMultistate, textElement.properties.backgroundColor || 'transparent');
            const blink = evaluateMultistate(runtimeVal, textElement.properties.multistate)?.rule.blink === true
              || evaluateMultistate(runtimeVal, textElement.properties.backgroundMultistate)?.rule.blink === true;
            const anchor = textElement.properties.textAlign === 'left' ? 'start' : textElement.properties.textAlign === 'right' ? 'end' : 'middle';
            const x = textElement.properties.textAlign === 'left' ? textElement.x + 6 : textElement.properties.textAlign === 'right' ? textElement.x + textElement.width - 6 : textElement.x + textElement.width / 2;
            const rotation = textElement.properties.rotation ?? 0;
            const lines = (textElement.properties.text || '').split('\n');
            const lineCount = lines.length;
            const fontSize = textElement.properties.fontSize || 24;
            const lineHeight = fontSize * 1.2;
            const totalHeight = lineCount * lineHeight;
            const startY = textElement.y + (textElement.height - totalHeight) / 2 + fontSize * 0.9;
            return (
              <g
                key={element.id}
                x={textElement.x}
                y={textElement.y}
                width={textElement.width}
                height={textElement.height}
                transform={`rotate(${rotation} ${textElement.x + textElement.width / 2} ${textElement.y + textElement.height / 2})`}
                data-testid={`display-element-${element.id}`}
                data-element-id={element.id}
                data-element-type={element.type}
                style={{ cursor: isElementLocked(element) ? 'default' : 'move', ...(blink ? { animation: 'pimsMultistateBlink .8s steps(2, start) infinite' } : {}) }}
              >
                <rect
                  x={textElement.x}
                  y={textElement.y}
                  width={textElement.width}
                  height={textElement.height}
                  fill={bgColor}
                  stroke="none"
                  strokeWidth={0}
                  data-testid={`text-background-${element.id}`}
                  data-element-id={element.id}
                  data-element-type={element.type}
                  pointerEvents="all"
                />
                <text
                  x={lineCount === 1 ? x : undefined}
                  y={lineCount === 1 ? textElement.y + textElement.height / 2 : undefined}
                  fill={textColor}
                  fontSize={fontSize}
                  textAnchor={anchor}
                  dominantBaseline={lineCount === 1 ? 'middle' : undefined}
                  pointerEvents="none"
                >
                  {lineCount === 1
                    ? lines[0]
                    : lines.map((line, idx) => (
                      <tspan
                        key={idx}
                        x={x}
                        y={startY + idx * lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                </text>
              </g>
            );
          }
          if (element.type === IMAGE_TYPE) {
            const image = element as ImageElement;
            const rotation = image.properties.rotation ?? 0;
            return <image key={element.id} href={image.properties.src} x={element.x} y={element.y} width={element.width} height={element.height} transform={`rotate(${rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`} preserveAspectRatio="none" data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} style={{ cursor: isElementLocked(element) ? 'default' : 'move' }} />;
          }
          if (element.type === PROGRAMMING_TYPE) {
            return <ProgrammingDisplayElementView
              key={element.id}
              element={element as ProgrammingElement}
              runtimeStates={runtimeStates}
              editable={editable}
            />;
          }
          if (element.type === LIBRARY_SYMBOL_TYPE) {
            const symbol = element as LibrarySymbolElement;
            const source = getLibrarySymbolSource(symbol);
            const calculation = typeof symbol.properties.calculationId === 'string'
              ? calculations.find((item) => item.id === symbol.properties.calculationId)
              : undefined;
            const runtimeState = calculation
              ? calculationValueRuntimeState(calculation, element.id, runtimeStates)
              : runtimeStates.get(element.id);
            const value = runtimeState?.status === 'loading' ? undefined : runtimeState?.result?.value;
            const color = getMultistateColor(value, symbol.properties.multistate, getLibrarySymbolColor(symbol.properties));
            const blink = evaluateMultistate(value, symbol.properties.multistate)?.rule.blink === true;
            return (
              <g key={element.id} data-element-id={element.id} data-element-type={element.type} style={{ cursor: isElementLocked(element) ? 'default' : 'move', ...(blink ? { animation: 'pimsMultistateBlink .8s steps(2, start) infinite' } : {}) }}>
                <g transform={`rotate(${symbol.properties.rotation ?? 0} ${element.x + element.width / 2} ${element.y + element.height / 2})`}>
                  <rect x={element.x} y={element.y} width={element.width} height={element.height} fill={color} mask={`url(#${getLibrarySymbolMaskId(element.id)})`} pointerEvents="none" data-testid={`library-symbol-color-layer-${element.id}`} />
                  <image href={source} x={element.x} y={element.y} width={element.width} height={element.height} preserveAspectRatio="xMidYMid meet" opacity={0} pointerEvents="all" data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} onContextMenu={(event) => handleLibrarySymbolContextMenu(event, element.id)} />
                </g>
              </g>
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
        };

        return elements.map((element) => renderSingleElement(element));
      })()}

      {selectionBox && (() => {
        const box = normalizeSelectionBox(selectionBox.start, selectionBox.current);
        const isWindow = selectionBox.current.x >= selectionBox.start.x;
        return (
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill={isWindow ? 'rgba(0, 120, 215, 0.2)' : 'rgba(46, 204, 113, 0.22)'}
            stroke={isWindow ? '#0078d7' : '#2ecc71'}
            strokeWidth={1}
            strokeDasharray={isWindow ? undefined : '4 2'}
            data-testid="display-selection-box"
            data-selection-mode={isWindow ? 'window' : 'crossing'}
            pointerEvents="none"
          />
        );
      })()}
      {editable && alignmentGuides.map((guide, index) => guide.axis === 'horizontal' ? (
        <line
          key={`alignment-guide-${guide.axis}-${index}`}
          x1={guide.start}
          x2={guide.end}
          y1={guide.position}
          y2={guide.position}
          stroke="#ff2b9d"
          strokeWidth={1.5 / Math.max(zoom, 0.1)}
          strokeDasharray={`${4 / Math.max(zoom, 0.1)} ${2 / Math.max(zoom, 0.1)}`}
          pointerEvents="none"
          data-testid="display-alignment-guide-horizontal"
        />
      ) : (
        <line
          key={`alignment-guide-${guide.axis}-${index}`}
          x1={guide.position}
          x2={guide.position}
          y1={guide.start}
          y2={guide.end}
          stroke="#ff2b9d"
          strokeWidth={1.5 / Math.max(zoom, 0.1)}
          strokeDasharray={`${4 / Math.max(zoom, 0.1)} ${2 / Math.max(zoom, 0.1)}`}
          pointerEvents="none"
          data-testid="display-alignment-guide-vertical"
        />
      ))}
      {selectedElementIds.filter((id) => id !== selectedElement?.id).map((id) => {
        const element = getElementById(displayDocument, id);
        if (!element) {
          return null;
        }
        const isLocked = isElementLocked(element);
        const geom = getElementAbsoluteGeometry(elements, id) ?? element;
        const positions = getResizeHandlePositions(geom);
        return (
          <g key={id} data-testid={`display-selection-overlay-${id}`}>
            <rect
              x={geom.x - 1}
              y={geom.y - 1}
              width={geom.width + 2}
              height={geom.height + 2}
              fill="none"
              stroke={isLocked ? '#f5a623' : SELECTION_STROKE}
              strokeWidth={1}
              strokeDasharray={isLocked ? '2 2' : '4 2'}
              data-testid={`display-selection-box-${id}`}
              pointerEvents="none"
            />
            {!isLocked && positions.map((pos) => {
              const rect = getResizeHandleRect(pos, HANDLE_SIZE);
              return <rect key={pos.handle} x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HANDLE_FILL} stroke={HANDLE_STROKE} strokeWidth={1} data-testid={`display-resize-handle-${id}-${pos.handle}`} data-element-id={id} data-resize-handle={pos.handle} style={{ cursor: getHandleCursor(pos.handle) }} />;
            })}
          </g>
        );
      })}
      {selectedElement && (() => {
        const isLocked = isElementLocked(selectedElement);
        const geom = selectedElementGeom ?? selectedElement;
        return (
          <g data-testid="display-selection-overlay">
            <rect
              x={geom.x - 1}
              y={geom.y - 1}
              width={geom.width + 2}
              height={geom.height + 2}
              fill="none"
              stroke={isLocked ? '#f5a623' : SELECTION_STROKE}
              strokeWidth={1}
              strokeDasharray={isLocked ? '2 2' : '4 2'}
              data-testid="display-selection-bounding-box"
              pointerEvents="none"
            />

            {!isLocked && handlePositions.map((pos) => {
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
        );
      })()}
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

function calculateHistoricalPoints(
  calculation: CalculationDefinition,
  inputSeries: Array<PiTrendSeries | undefined>,
  timeRange?: DisplayTimeRange,
): PiTrendSeries['points'] {
  let times = [...new Set(inputSeries.flatMap((series) => series?.points.map((point) => point.time) ?? []))].sort((left, right) => left - right);
  if (times.length === 0 && calculation.inputs.length === 0 && timeRange) {
    times = [timeRange.from, timeRange.to];
  }
  return times.flatMap((time) => {
    const values = new Map<string, unknown>();
    for (const [index, input] of calculation.inputs.entries()) {
      const series = inputSeries[index];
      const point = series?.points.filter((candidate) => candidate.time <= time).at(-1);
      if (!point) {
        return [];
      }
      values.set(input.name, point.value);
    }
    const evaluation = evaluateCalculation(calculation, values);
    return evaluation.status === 'success' ? [{ time, value: evaluation.value }] : [];
  });
}

function getPiBindingKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
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

function getLibrarySymbolMaskId(elementId: string): string {
  return `library-symbol-mask-${elementId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function getLibrarySymbolSource(element: LibrarySymbolElement): string {
  const definition = findIndustrialSymbol(element.properties.symbolId);
  return definition ? getIndustrialSymbolAssetUrl(definition) : element.properties.src;
}

function renderGeometricShape(element: RectangleElement, runtimeState?: ValueRuntimeState, parentElementId?: string) {
  const baseFill = getElementFill(element);
  const value = runtimeState?.status === 'loading' ? undefined : runtimeState?.result?.value;
  const fill = getMultistateColor(value, element.properties.multistate, baseFill);
  const blink = evaluateMultistate(value, element.properties.multistate)?.rule.blink === true;
  const common = {
    key: element.id,
    'data-testid': `display-element-${element.id}`,
    'data-element-id': parentElementId ?? element.id,
    'data-element-type': element.type,
    'data-shape': element.properties.shape ?? 'rectangle',
    style: { cursor: 'move', ...(blink ? { animation: 'pimsMultistateBlink .8s steps(2, start) infinite' } : {}) },
    transform: `rotate(${Number(element.properties.rotation) || 0} ${element.x + element.width / 2} ${element.y + element.height / 2})`,
    stroke: getElementStroke(element),
    strokeWidth: typeof element.properties.strokeWidth === 'number'
      ? element.properties.strokeWidth
      : element.properties.shape === 'line' || element.properties.shape === 'arc' ? 4 : 1,
    strokeDasharray: element.properties.strokeStyle === 'dashed'
      ? '8 5'
      : element.properties.strokeStyle === 'dotted' ? '2 4' : undefined,
    pointerEvents: 'all' as const,
  };
  if (element.properties.shape === 'ellipse') {
    return <ellipse {...common} fill={fill} cx={element.x + element.width / 2} cy={element.y + element.height / 2} rx={element.width / 2} ry={element.height / 2} />;
  }
  if (element.properties.shape === 'triangle') {
    return <polygon {...common} fill={fill} points={`${element.x + element.width / 2},${element.y} ${element.x + element.width},${element.y + element.height} ${element.x},${element.y + element.height}`} />;
  }
  if (element.properties.shape === 'line') {
    if (Array.isArray(element.properties.points) && element.properties.points.length >= 2) {
      const points = element.properties.points
        .map((point) => `${element.x + point.x},${element.y + point.y}`)
        .join(' ');
      return <polyline {...common} fill="none" points={points} />;
    }
    return <line {...common} fill="none" x1={element.x} y1={element.y + element.height / 2} x2={element.x + element.width} y2={element.y + element.height / 2} />;
  }
  if (element.properties.shape === 'arc') {
    const startX = element.x + element.width * 0.1;
    const startY = element.y + element.height * 0.12;
    const endX = element.x + element.width * 0.88;
    const endY = element.y + element.height * 0.9;
    return <path {...common} fill="none" d={`M ${startX} ${startY} A ${element.width * 0.9} ${element.height * 0.9} 0 0 1 ${endX} ${endY}`} />;
  }
  if (element.properties.shape === 'pentagon') {
    const x = element.x;
    const y = element.y;
    const w = element.width;
    const h = element.height;
    return <polygon {...common} fill={fill} points={`${x + w / 2},${y} ${x + w},${y + h * 0.38} ${x + w * 0.8},${y + h} ${x + w * 0.2},${y + h} ${x},${y + h * 0.38}`} />;
  }
  return <rect {...common} fill={fill} x={element.x} y={element.y} width={element.width} height={element.height} />;
}

function normalizeSelectionBox(start: Point, current: Point) {
  return { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) };
}

function isFullyInsideSelection(element: DisplayDocument['elements'][number], box: ReturnType<typeof normalizeSelectionBox>): boolean {
  return element.x >= box.x && element.y >= box.y
    && element.x + element.width <= box.x + box.width
    && element.y + element.height <= box.y + box.height;
}

function intersectsSelection(element: DisplayDocument['elements'][number], box: ReturnType<typeof normalizeSelectionBox>): boolean {
  return element.x < box.x + box.width && element.x + element.width > box.x
    && element.y < box.y + box.height && element.y + element.height > box.y;
}
