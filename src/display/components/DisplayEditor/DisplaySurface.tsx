import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import type { DisplayDocument } from '../../displayDocument';
import { DEFAULT_RECTANGLE_PROPERTIES, RECTANGLE_TYPE, type RectangleElement } from '../../createRectangle';
import { VALUE_TYPE, type ValueElement } from '../../createValue';
import { CALCULATION_TYPE, type CalculationElement } from '../../createCalculation';
import { CalculationElementView } from '../CalculationElementView';
import { evaluateCalculation, type CalculationDefinition } from '../../../calculations/calculationEngine';
import { getTrendSeries, TREND_TYPE, type TrendElement } from '../../createTrend';
import { BAR_TYPE, getBarOptions, type BarElement } from '../../createBar';
import { TABLE_TYPE, type TableColumnConfig, type TableElement } from '../../createTable';
import { TableElementView, getTableItemConsumerId, getTableTrendConsumerId } from '../TableElementView';
import { GAUGE_TYPE, getGaugeOptions, type GaugeElement } from '../../createGauge';
import { ValueElementView } from '../ValueElementView';
import { GaugeElementView } from '../GaugeElementView';
import { BarElementView } from '../BarElementView';
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
import { getMultistateColor } from '../../multistate';
import { TEXT_TYPE, type TextElement } from '../../createText';
import { IMAGE_TYPE, type ImageElement } from '../../createImage';
import { getLibrarySymbolColor, LIBRARY_SYMBOL_TYPE, type LibrarySymbolElement } from '../../createLibrarySymbol';
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
  onStartDrag: (elementId: string, pointer: Point, selectedIds?: string[]) => void;
  onStartResize: (elementId: string, handle: ResizeHandle, pointer: Point) => void;
  onPointerMove: (pointer: Point) => void;
  onPointerEnd: () => void;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  loadPiPointDatabaseLimits?: (binding: PiPointBinding) => Promise<PiPointDatabaseLimits>;
  loadValues?: LoadCurrentValues;
  loadTrend?: LoadTrendSeries;
  trendRefreshKey?: string;
  trendTimeRange?: DisplayTimeRange;
  onTrendOpen?: (element: TrendElement, seriesStates: readonly TrendSeriesViewState[], cursors?: readonly TrendCursor[]) => void;
  onTrendContextMenu?: (element: TrendElement) => void;
  onLibrarySymbolContextMenu?: (element: LibrarySymbolElement) => void;
  onTableColumnsChange?: (elementId: string, columns: TableColumnConfig[]) => void;
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
  selectedElementIds,
  onSelect,
  onSelectMany,
  onStartDrag,
  onStartResize,
  onPointerMove,
  onPointerEnd,
  loadValue,
  loadPiPointDatabaseLimits,
  loadValues,
  loadTrend,
  trendRefreshKey,
  trendTimeRange,
  onTrendOpen,
  onTrendContextMenu,
  onLibrarySymbolContextMenu,
  onTableColumnsChange,
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
  const [databaseScales, setDatabaseScales] = useState<Record<string, PiPointDatabaseLimits>>({});
  useEffect(() => {
    if (!loadPiPointDatabaseLimits) {
      return;
    }
    const databaseElements = elements.filter((element): element is BarElement | GaugeElement => {
      if (element.type === BAR_TYPE) {
        return getBarOptions(element.properties).scaleMode === 'database' && isPiPointBinding(element.properties.binding);
      }
      if (element.type === GAUGE_TYPE) {
        return getGaugeOptions(element.properties).scaleMode === 'database' && isPiPointBinding(element.properties.binding);
      }
      return false;
    });
    void Promise.all(databaseElements.map(async (item) => {
      try { return [item.id, await loadPiPointDatabaseLimits(item.properties.binding as PiPointBinding)] as const; } catch { return null; }
    })).then((results) => setDatabaseScales(Object.fromEntries(results.filter((item): item is readonly [string, PiPointDatabaseLimits] => item !== null))));
  }, [elements, loadPiPointDatabaseLimits]);
  const [selectionBox, setSelectionBox] = useState<{ start: Point; current: Point } | null>(null);
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
  const valueConsumers: ValueRuntimeConsumer[] = elements.flatMap((element) => {
    if (element.type === CALCULATION_TYPE) {
      const calculation = calculations.find((item) => item.id === element.properties.calculationId);
      return calculation?.inputs.map((input) => ({ elementId: `${element.id}:${input.name}`, binding: input.binding })) ?? [];
    }
    const calculationId = typeof (element.properties as { calculationId?: unknown }).calculationId === 'string'
      ? (element.properties as { calculationId: string }).calculationId
      : undefined;
    if (calculationId && (element.type === VALUE_TYPE || element.type === GAUGE_TYPE || element.type === BAR_TYPE)) {
      const calculation = calculations.find((item) => item.id === calculationId);
      return calculation?.inputs.map((input) => ({ elementId: `${element.id}:${input.name}`, binding: input.binding })) ?? [];
    }
    return (element.type === VALUE_TYPE || element.type === GAUGE_TYPE || element.type === BAR_TYPE || element.type === RECTANGLE_TYPE || element.type === LIBRARY_SYMBOL_TYPE)
      && isPiPointBinding(element.properties.binding)
      ? [{ elementId: element.id, binding: element.properties.binding }]
      : [];
  }).concat(elements.flatMap((element) => element.type === TABLE_TYPE
    ? (element as TableElement).properties.items.map((item, index) => ({ elementId: getTableItemConsumerId(element.id, index), binding: item.binding }))
    : []));
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
  const calculationTrendElements = useMemo(() => elements.flatMap((element) => {
    if (element.type !== TREND_TYPE) {
      return [];
    }
    return getTrendSeries(element as TrendElement)
      .filter((series) => Boolean(series.calculationId))
      .map((series) => ({ element: element as TrendElement, series }));
  }), [elements]);
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
      const points = calculateHistoricalPoints(calculation, inputSeries.map((result) => result.status === 'success' ? result.series : undefined));
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
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element || element.type !== TREND_TYPE) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!onTrendOpen) {
      return;
    }
    onTrendOpen(element as TrendElement, getTrendSeriesStates(element as TrendElement, allTrendRuntimeStates), cursorsByTrend[element.id] ?? []);
  }, [allTrendRuntimeStates, cursorsByTrend, editable, elements, onTrendOpen]);
  const handleTrendContextMenu = useCallback((event: React.MouseEvent<SVGGElement>, elementId: string) => {
    if (!editable) {
      return;
    }
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element || element.type !== TREND_TYPE) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onTrendContextMenu?.(element as TrendElement);
  }, [editable, elements, onTrendContextMenu]);

  const handleLibrarySymbolContextMenu = useCallback((event: React.MouseEvent<SVGElement>, elementId: string) => {
    if (!editable) {
      return;
    }
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element || element.type !== LIBRARY_SYMBOL_TYPE) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onLibrarySymbolContextMenu?.(element as LibrarySymbolElement);
  }, [editable, elements, onLibrarySymbolContextMenu]);

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
  }, [allTrendRuntimeStates, elements]);

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
      for (const trendElement of elements.filter((candidate) => candidate.type === TREND_TYPE)) {
        next[trendElement.id] = [...(next[trendElement.id] ?? []), cursor];
      }
      return next;
    });
    setSelectedCursor({ trendElementId: elementId, cursorId: cursor.id });
    svg.focus();
  }, [allTrendRuntimeStates, cursorDrag, editable, elements]);

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
  const handleElementClick = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (editable) {
      return;
    }
    const target = event.target as Element;
    const elementId = target.getAttribute('data-element-id') ?? target.closest('[data-element-id]')?.getAttribute('data-element-id');
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
        if (e.ctrlKey || e.metaKey) {
          multiSelectionRef.current = true;
          onSelectMany([elementId], true);
          return;
        }
        const preserveSelection = multiSelectionRef.current && selectedElementIds.includes(elementId);
        if (!preserveSelection) {
          multiSelectionRef.current = false;
          onSelectMany([elementId]);
        }
        onStartDrag(
          elementId,
          svgPointFromEvent(svg, e.clientX, e.clientY),
          preserveSelection ? selectedElementIds : [elementId],
        );
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        onSelectMany([], true);
      } else {
        onSelect(null);
        const point = svgPointFromEvent(svg, e.clientX, e.clientY);
        setSelectionBox({ start: point, current: point });
      }
    },
    [editable, onSelect, onSelectMany, onStartDrag, onStartResize, selectedElementIds],
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
        const seriesPoints = getTrendSeriesStates(trendElement, allTrendRuntimeStates)
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
      if (selectionBox) {
        const point = svgPointFromEvent(svg, e.clientX, e.clientY);
        setSelectionBox((current) => current ? { ...current, current: point } : current);
        return;
      }
      if (!hasPointerCapture(svg, e.pointerId)) {
        return;
      }
      onPointerMove(svgPointFromEvent(svg, e.clientX, e.clientY));
    },
    [allTrendRuntimeStates, cursorDrag, editable, elements, onPointerMove, selectionBox, trendTimeRange],
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
      if (selectionBox) {
        const box = normalizeSelectionBox(selectionBox.start, selectionBox.current);
        if (box.width > 2 || box.height > 2) {
          const ids = elements.filter((element) => intersectsSelection(element, box)).map((element) => element.id);
          onSelectMany(ids);
          multiSelectionRef.current = ids.length > 1;
        } else {
          onSelect(null);
          multiSelectionRef.current = false;
        }
        setSelectionBox(null);
        tryReleasePointerCapture(svg, e.pointerId);
        return;
      }
      tryReleasePointerCapture(svg, e.pointerId);
      onPointerEnd();
    },
    [cursorDrag, editable, elements, onPointerEnd, onSelect, onSelectMany, selectionBox],
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
      onClick={handleElementClick}
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
        {elements.filter((element) => element.type === LIBRARY_SYMBOL_TYPE).map((element) => {
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
        if (element.type === TABLE_TYPE) {
          return <TableElementView key={element.id} element={element as TableElement} runtimeStates={runtimeStates} trendStates={trendRuntimeStates} onColumnsChange={editable ? (columns) => onTableColumnsChange?.(element.id, columns) : undefined} />;
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
              timeRange={trendTimeRange}
              onDoubleClick={handleTrendDoubleClick}
              onContextMenu={handleTrendContextMenu}
            />
          );
        }
  if (element.type === RECTANGLE_TYPE) {
          return renderGeometricShape(element as RectangleElement, runtimeStates.get(element.id));
        }
        if (element.type === TEXT_TYPE) {
          const textElement = element as TextElement;
          const anchor = textElement.properties.textAlign === 'left' ? 'start' : textElement.properties.textAlign === 'right' ? 'end' : 'middle';
          const x = textElement.properties.textAlign === 'left' ? textElement.x + 4 : textElement.properties.textAlign === 'right' ? textElement.x + textElement.width - 4 : textElement.x + textElement.width / 2;
          const rotation = textElement.properties.rotation ?? 0;
          return <text key={element.id} x={x} y={textElement.y + textElement.height / 2} transform={`rotate(${rotation} ${textElement.x + textElement.width / 2} ${textElement.y + textElement.height / 2})`} fill={textElement.properties.color} fontSize={textElement.properties.fontSize} textAnchor={anchor} dominantBaseline="middle" data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} style={{ cursor: 'move' }}>{textElement.properties.text}</text>;
        }
        if (element.type === IMAGE_TYPE) {
          const image = element as ImageElement;
          const rotation = image.properties.rotation ?? 0;
          return <image key={element.id} href={image.properties.src} x={element.x} y={element.y} width={element.width} height={element.height} transform={`rotate(${rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`} preserveAspectRatio="none" data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} style={{ cursor: 'move' }} />;
        }
        if (element.type === LIBRARY_SYMBOL_TYPE) {
          const symbol = element as LibrarySymbolElement;
          const source = getLibrarySymbolSource(symbol);
          const runtimeState = runtimeStates.get(element.id);
          const value = runtimeState?.status === 'success' ? runtimeState.result.value : undefined;
          const color = getMultistateColor(value, symbol.properties.multistate, getLibrarySymbolColor(symbol.properties));
          return (
            <g key={element.id} data-element-id={element.id} data-element-type={element.type} style={{ cursor: 'move' }}>
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
      })}

      {selectionBox && (() => {
        const box = normalizeSelectionBox(selectionBox.start, selectionBox.current);
        return <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="rgba(110, 159, 255, 0.12)" stroke={SELECTION_STROKE} strokeDasharray="4 2" data-testid="display-selection-box" pointerEvents="none" />;
      })()}
      {selectedElementIds.filter((id) => id !== selectedElement?.id).map((id) => {
        const element = elements.find((candidate) => candidate.id === id);
        if (!element) {
          return null;
        }
        const positions = getResizeHandlePositions(element);
        return (
          <g key={id} data-testid={`display-selection-overlay-${id}`}>
            <rect x={element.x - 1} y={element.y - 1} width={element.width + 2} height={element.height + 2} fill="none" stroke={SELECTION_STROKE} strokeWidth={1} strokeDasharray="4 2" data-testid={`display-selection-box-${id}`} pointerEvents="none" />
            {positions.map((pos) => {
              const rect = getResizeHandleRect(pos, HANDLE_SIZE);
              return <rect key={pos.handle} x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={HANDLE_FILL} stroke={HANDLE_STROKE} strokeWidth={1} data-testid={`display-resize-handle-${id}-${pos.handle}`} data-element-id={id} data-resize-handle={pos.handle} style={{ cursor: getHandleCursor(pos.handle) }} />;
            })}
          </g>
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

function calculateHistoricalPoints(
  calculation: CalculationDefinition,
  inputSeries: Array<PiTrendSeries | undefined>,
): PiTrendSeries['points'] {
  const times = [...new Set(inputSeries.flatMap((series) => series?.points.map((point) => point.time) ?? []))].sort((left, right) => left - right);
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

function renderGeometricShape(element: RectangleElement, runtimeState?: ValueRuntimeState) {
  const baseFill = getElementFill(element);
  const value = runtimeState?.status === 'success' ? runtimeState.result.value : undefined;
  const fill = getMultistateColor(value, element.properties.multistate, baseFill);
  const common = {
    key: element.id,
    'data-testid': `display-element-${element.id}`,
    'data-element-id': element.id,
    'data-element-type': element.type,
    'data-shape': element.properties.shape ?? 'rectangle',
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    style: { cursor: 'move' },
    transform: `rotate(${Number(element.properties.rotation) || 0} ${element.x + element.width / 2} ${element.y + element.height / 2})`,
  };
  const appearance = { fill, stroke: getElementStroke(element), strokeWidth: 1, pointerEvents: 'all' as const };
  if (element.properties.shape === 'ellipse') {
    return <g {...common}><ellipse {...appearance} cx={element.x + element.width / 2} cy={element.y + element.height / 2} rx={element.width / 2} ry={element.height / 2} /></g>;
  }
  if (element.properties.shape === 'triangle') {
    return <g {...common}><polygon {...appearance} points={`${element.x + element.width / 2},${element.y} ${element.x + element.width},${element.y + element.height} ${element.x},${element.y + element.height}`} /></g>;
  }
  return <g {...common}><rect {...appearance} x={element.x} y={element.y} width={element.width} height={element.height} /></g>;
}

function normalizeSelectionBox(start: Point, current: Point) {
  return { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) };
}

function intersectsSelection(element: DisplayDocument['elements'][number], box: ReturnType<typeof normalizeSelectionBox>): boolean {
  return element.x < box.x + box.width && element.x + element.width > box.x
    && element.y < box.y + box.height && element.y + element.height > box.y;
}
