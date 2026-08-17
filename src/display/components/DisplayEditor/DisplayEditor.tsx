import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { DisplayDocument } from '../../displayDocument';
import {
  createDisplayHistory,
  hasRedo,
  hasUndo,
  recordDisplayEdit,
  redoDisplayEdit,
  undoDisplayEdit,
} from '../../displayHistory';
import {
  appendValue,
  createValue,
  updateValueVisualOptions,
  VALUE_TYPE,
  type ValueElement,
  type ValueVisualOptions,
} from '../../createValue';
import {
  addTrendSeries,
  appendTrend,
  createTrend,
  getTrendSeries,
  getTrendVisualOptions,
  removeTrendSeries,
  TREND_TYPE,
  type TrendElement,
  updateTrendSeriesOptions,
  updateTrendVisualOptions,
} from '../../createTrend';
import {
  appendGauge,
  createGauge,
  GAUGE_TYPE,
  getGaugeOptions,
  updateGaugeOptions,
  type GaugeElement,
} from '../../createGauge';
import {
  appendBar,
  createBar,
  BAR_TYPE,
  getBarOptions,
  updateBarOptions,
  type BarElement,
} from '../../createBar';
import {
  appendDisplayElement,
  createRectangle,
  DEFAULT_RECTANGLE_PROPERTIES,
  RECTANGLE_TYPE,
  updateRectangleProperties,
  type RectangleElement,
} from '../../createRectangle';
import { createPiPointBinding, isPiPointBinding, type PiPointBinding } from '../../../pi/piPointBinding';
import type { PiPointSearchResult, PiPointValue } from '../../../pi/piDataSource';
import { PI_POINT_DRAG_MIME, parsePiPointDragData } from '../../../pi/piPointDrag';
import { LIBRARY_SYMBOL_DRAG_MIME, parseLibrarySymbolDragData } from '../../../library/librarySymbolDrag';
import { DisplaySurface } from './DisplaySurface';
import { TrendPopup } from '../TrendPopup';
import type { TrendSeriesViewState } from '../TrendElementView';
import { ValuePropertiesPanel } from './ValuePropertiesPanel';
import { ScalePropertiesPanel } from './ScalePropertiesPanel';
import { RectanglePropertiesPanel } from './RectanglePropertiesPanel';
import { TextPropertiesPanel } from './TextPropertiesPanel';
import { ImagePropertiesPanel } from './ImagePropertiesPanel';
import { appendImage, createImage, IMAGE_TYPE, updateImageProperties, type ImageElement } from '../../createImage';
import { appendLibrarySymbol, createLibrarySymbol } from '../../createLibrarySymbol';
import { appendText, createText, TEXT_TYPE, updateTextProperties, type TextElement } from '../../createText';
import { TrendPropertiesPanel } from './TrendPropertiesPanel';
import type { TrendCursor } from '../../runtime/trendCursor';
import type { LoadCurrentValues } from '../../runtime/valueRuntime';
import type { LoadTrendSeries } from '../../runtime/trendRuntime';
import type { PiPointDatabaseLimits } from '../../../pi/piPointBinding';
import type { DisplayTimeRange, DisplayTimeSelection } from '../../../time/timeRange';
import { updateMultistateConfig, type MultistateConfig } from '../../multistate';
import { getDisplayExportFileName, parseImportedDisplay, serializeDisplay } from '../../displayTransfer';
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from './editorState';
import {
  computeDragGeometry,
  computeResizeGeometry,
  getElementById,
  updateElementGeometry,
  type ElementGeometry,
  type Point,
  type ResizeHandle,
} from './editorGeometry';

export type DisplayEditorMode = 'edit' | 'view';
export type PiPointDropSymbolType = 'value' | 'trend' | 'gauge' | 'bar';

export interface DisplayEditorProps {
  document: DisplayDocument;
  onChange?: (document: DisplayDocument) => void;
  onModeChange?: (mode: DisplayEditorMode) => void;
  selectedPiPoint?: PiPointSearchResult | null;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  loadPiPointDatabaseLimits?: (binding: PiPointBinding) => Promise<PiPointDatabaseLimits>;
  loadValues?: LoadCurrentValues;
  loadTrend?: LoadTrendSeries;
  loadRecordedTrend?: LoadTrendSeries;
  dropSymbolType?: PiPointDropSymbolType;
  onDropSymbolTypeChange?: (type: PiPointDropSymbolType) => void;
  trendRefreshKey?: string;
  trendTimeRange?: DisplayTimeRange;
  timeSelection?: DisplayTimeSelection;
  onTimeSelectionChange?: (selection: DisplayTimeSelection) => void;
  showToolbar?: boolean;
}

interface PendingDocumentTransaction {
  before: DisplayDocument;
}

interface PiPointDragPreview {
  left: number;
  top: number;
  width: number;
  height: number;
  valid: boolean;
  label: string;
  symbolType: PiPointDropSymbolType;
  targetTrend: boolean;
  targetTrendId?: string;
}

interface TrendPopupState {
  element: TrendElement;
  seriesStates: readonly TrendSeriesViewState[];
  loading: boolean;
  cursors: readonly TrendCursor[];
}

const TREND_POPUP_MAX_DATA_POINTS = 500;
const DISPLAY_ZOOM_MIN = 0.1;
const DISPLAY_ZOOM_MAX = 5;
const DISPLAY_ZOOM_STEP = 0.1;

export function DisplayEditor({
  document: displayDocument,
  onChange,
  onModeChange,
  selectedPiPoint,
  loadValue,
  loadPiPointDatabaseLimits,
  loadValues,
  loadTrend,
  loadRecordedTrend,
  dropSymbolType = 'value',
  onDropSymbolTypeChange,
  trendRefreshKey,
  trendTimeRange,
  timeSelection,
  onTimeSelectionChange,
  showToolbar = true,
}: DisplayEditorProps) {
  const styles = useStyles2(getStyles);
  const [state, baseDispatch] = useReducer(editorReducer, initialEditorState);
  const [mode, setMode] = useState<DisplayEditorMode>('edit');

  const stateRef = useRef<EditorState>(state);
  const documentRef = useRef<DisplayDocument>(displayDocument);
  const onChangeRef = useRef<((document: DisplayDocument) => void) | undefined>(onChange);
  const historyRef = useRef(createDisplayHistory(displayDocument));
  const expectedDocumentRef = useRef<DisplayDocument | null>(null);
  const pendingTransactionRef = useRef<PendingDocumentTransaction | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [, refreshHistory] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [piPointDragPreview, setPiPointDragPreview] = useState<PiPointDragPreview | null>(null);
  const [trendPopup, setTrendPopup] = useState<TrendPopupState | null>(null);
  const [optionsTrendId, setOptionsTrendId] = useState<string | null>(null);
  const [surfaceZoom, setSurfaceZoom] = useState(1);
  const [surfaceViewCenter, setSurfaceViewCenter] = useState({
    x: displayDocument.surface.width / 2,
    y: displayDocument.surface.height / 2,
  });
  const trendPopupRequest = useRef(0);
  const trendPopupRef = useRef<TrendPopupState | null>(null);

  useEffect(() => {
    documentRef.current = displayDocument;
    if (expectedDocumentRef.current === displayDocument) {
      expectedDocumentRef.current = null;
      return;
    }
    if (historyRef.current.present !== displayDocument) {
      historyRef.current = createDisplayHistory(displayDocument);
      refreshHistory((version) => version + 1);
    }
  }, [displayDocument]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const dispatch = useCallback(
    (action: EditorAction) => {
      stateRef.current = editorReducer(stateRef.current, action);
      baseDispatch(action);
    },
    [baseDispatch],
  );

  const publishDocument = useCallback((nextDocument: DisplayDocument) => {
    documentRef.current = nextDocument;
    expectedDocumentRef.current = nextDocument;
    onChangeRef.current?.(nextDocument);
  }, []);

  const reconcileSelection = useCallback((nextDocument: DisplayDocument) => {
    const selectedId = stateRef.current.selectedElementId;
    if (selectedId && !nextDocument.elements.some((element) => element.id === selectedId)) {
      dispatch({ type: 'CLEAR_SELECTION' });
    }
  }, [dispatch]);

  const commitDocument = useCallback((nextDocument: DisplayDocument): boolean => {
    const nextHistory = recordDisplayEdit(historyRef.current, nextDocument);
    if (nextHistory === historyRef.current) {
      return false;
    }
    historyRef.current = nextHistory;
    refreshHistory((version) => version + 1);
    publishDocument(nextDocument);
    reconcileSelection(nextDocument);
    return true;
  }, [publishDocument, reconcileSelection]);

  const handleUndo = useCallback(() => {
    const nextHistory = undoDisplayEdit(historyRef.current);
    if (nextHistory === historyRef.current) {
      return;
    }
    historyRef.current = nextHistory;
    refreshHistory((version) => version + 1);
    publishDocument(nextHistory.present);
    reconcileSelection(nextHistory.present);
  }, [publishDocument, reconcileSelection]);

  const handleRedo = useCallback(() => {
    const nextHistory = redoDisplayEdit(historyRef.current);
    if (nextHistory === historyRef.current) {
      return;
    }
    historyRef.current = nextHistory;
    refreshHistory((version) => version + 1);
    publishDocument(nextHistory.present);
    reconcileSelection(nextHistory.present);
  }, [publishDocument, reconcileSelection]);

  const handleSelect = useCallback(
    (elementId: string | null) => {
      dispatch({ type: 'SELECT', elementId });
    },
    [dispatch],
  );
  const handleSelectMany = useCallback((elementIds: string[], additive = false) => {
    dispatch({ type: 'SELECT_MANY', elementIds, additive });
  }, [dispatch]);

  const handleStartDrag = useCallback(
    (elementId: string, pointer: Point, selectedIds: string[] = [elementId]) => {
      const el = getElementById(documentRef.current, elementId);
      if (!el) {
        return;
      }
      pendingTransactionRef.current = { before: documentRef.current };
      dispatch({
        type: 'START_DRAG',
        elementId,
        pointer,
        originalGeometry: { x: el.x, y: el.y, width: el.width, height: el.height },
        originalGeometries: Object.fromEntries(
          selectedIds.map((id) => {
            const selected = getElementById(documentRef.current, id);
            return selected ? [id, { x: selected.x, y: selected.y, width: selected.width, height: selected.height }] : [];
          }).filter((entry): entry is [string, ElementGeometry] => entry.length > 0),
        ),
      });
    },
    [dispatch],
  );

  const handleStartResize = useCallback(
    (elementId: string, handle: ResizeHandle, pointer: Point) => {
      const el = getElementById(documentRef.current, elementId);
      if (!el) {
        return;
      }
      pendingTransactionRef.current = { before: documentRef.current };
      dispatch({
        type: 'START_RESIZE',
        elementId,
        handle,
        pointer,
        originalGeometry: { x: el.x, y: el.y, width: el.width, height: el.height },
      });
    },
    [dispatch],
  );

  const handlePointerMove = useCallback((pointer: Point) => {
    const interaction = stateRef.current.interaction;
    if (interaction.kind === 'idle') {
      return;
    }

    let newGeometry: ElementGeometry;
    if (interaction.kind === 'dragging') {
      newGeometry = computeDragGeometry(
        interaction.originalGeometry,
        interaction.startPointer,
        pointer,
      );
    } else {
      newGeometry = computeResizeGeometry(
        interaction.handle,
        interaction.originalGeometry,
        interaction.startPointer,
        pointer,
      );
    }

    if (interaction.kind === 'dragging') {
      const dx = newGeometry.x - interaction.originalGeometry.x;
      const dy = newGeometry.y - interaction.originalGeometry.y;
      let nextDocument = documentRef.current;
      Object.entries(interaction.originalGeometries).forEach(([id, geometry]) => {
        nextDocument = updateElementGeometry(nextDocument, id, { x: geometry.x + dx, y: geometry.y + dy });
      });
      publishDocument(nextDocument);
    } else {
      publishDocument(updateElementGeometry(documentRef.current, interaction.elementId, newGeometry));
    }
  }, [publishDocument]);

  const handlePointerEnd = useCallback(() => {
    if (pendingTransactionRef.current) {
      pendingTransactionRef.current = null;
      commitDocument(documentRef.current);
    }
    dispatch({ type: 'END_INTERACTION' });
  }, [commitDocument, dispatch]);

  const handleInsertRectangle = useCallback(() => {
    const currentDocument = documentRef.current;
    const element = createRectangle({
      surface: currentDocument.surface,
      existingIds: currentDocument.elements.map(({ id }) => id),
    });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendDisplayElement(currentDocument, element));
    dispatch({ type: 'SELECT', elementId: element.id });
  }, [commitDocument, dispatch]);

  const handleInsertText = useCallback(() => {
    const currentDocument = documentRef.current;
    const element = createText({ surface: currentDocument.surface, existingIds: currentDocument.elements.map(({ id }) => id) });
    commitDocument(appendText(currentDocument, element));
    dispatch({ type: 'SELECT', elementId: element.id });
  }, [commitDocument, dispatch]);

  const reorderSelected = useCallback((direction: 'front' | 'back', all = false) => {
    const selectedId = stateRef.current.selectedElementId;
    if (!selectedId) {
      return;
    }
    const current = documentRef.current.elements;
    const index = current.findIndex((element) => element.id === selectedId);
    const targetIndex = direction === 'front' ? (all ? current.length - 1 : index + 1) : (all ? 0 : index - 1);
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) {
      return;
    }
    const elements = [...current];
    [elements[index], elements[targetIndex]] = [elements[targetIndex], elements[index]];
    commitDocument({ ...documentRef.current, elements });
  }, [commitDocument]);

  const handleImageFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    if (file.size > 1024 * 1024) {
      setImportError('A imagem não pode ultrapassar 1 MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setImportError('Selecione um arquivo de imagem válido.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }
      const currentDocument = documentRef.current;
      const element = createImage({ src: reader.result, alt: file.name, surface: currentDocument.surface, existingIds: currentDocument.elements.map(({ id }) => id) });
      commitDocument(appendImage(currentDocument, element));
      dispatch({ type: 'SELECT', elementId: element.id });
      setImportError(null);
    };
    reader.onerror = () => setImportError('Não foi possível ler a imagem.');
    reader.readAsDataURL(file);
  }, [commitDocument, dispatch]);

  const handleInsertBoundElement = useCallback((type: PiPointDropSymbolType) => {
    const binding = selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined;
    if (!binding) {
      return;
    }
    const currentDocument = documentRef.current;
    const options = { binding: binding!, surface: currentDocument.surface, existingIds: currentDocument.elements.map(({ id }) => id) };
    const element = type === 'value' ? createValue(options)
      : type === 'trend' ? createTrend(options)
        : type === 'gauge' ? createGauge({ ...options, binding })
          : createBar({ ...options, binding });
    const next = type === 'value' ? appendValue(currentDocument, element as ValueElement)
      : type === 'trend' ? appendTrend(currentDocument, element as TrendElement)
        : type === 'gauge' ? appendGauge(currentDocument, element as GaugeElement)
          : appendBar(currentDocument, element as BarElement);
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(next);
    dispatch({ type: 'SELECT', elementId: element.id });
  }, [commitDocument, dispatch, selectedPiPoint]);

  const handlePiPointDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (mode !== 'edit' || !onChangeRef.current) {
      return;
    }
    const librarySymbolId = Array.from(event.dataTransfer.types).includes(LIBRARY_SYMBOL_DRAG_MIME)
      ? parseLibrarySymbolDragData(event.dataTransfer.getData(LIBRARY_SYMBOL_DRAG_MIME))
      : undefined;
    if (librarySymbolId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      return;
    }
    if (!Array.from(event.dataTransfer.types).includes(PI_POINT_DRAG_MIME)) {
      return;
    }
    event.preventDefault();
    const pointResult = parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)) ?? selectedPiPoint;
    const svg = event.currentTarget.querySelector('svg');
    const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
    // Soltar uma PI Point sobre uma Trend só acrescenta uma série quando o
    // modo de criação selecionado também for Trend. Nos demais modos, o drop
    // mantém o comportamento de criar o novo símbolo escolhido.
    const targetTrend = dropSymbolType === 'trend'
      ? resolveTrendDropTarget(
        documentRef.current,
        event.target,
        event.clientX,
        event.clientY,
        point,
      )
      : undefined;
    const preview = svg && pointResult
      ? createPiPointDragPreview(
        svg,
        event.currentTarget,
        event.clientX,
        event.clientY,
        documentRef.current,
        pointResult.name,
        dropSymbolType,
        pointResult,
        targetTrend,
        dropSymbolType === 'trend',
      )
      : undefined;
    event.dataTransfer.dropEffect = preview?.valid ? 'copy' : 'none';
    const nextPreview = preview ?? createInvalidDragPreview(
      event.currentTarget,
      event.clientX,
      event.clientY,
      pointResult?.name ?? 'PI Point',
      dropSymbolType,
    );
    setPiPointDragPreview(nextPreview);
    if (nextPreview.targetTrendId && stateRef.current.selectedElementId !== nextPreview.targetTrendId) {
      dispatch({ type: 'SELECT', elementId: nextPreview.targetTrendId });
    }
  }, [dispatch, dropSymbolType, mode, selectedPiPoint]);

  const handlePiPointDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setPiPointDragPreview(null);
    }
  }, []);

  const handlePiPointDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    setPiPointDragPreview(null);
    if (mode !== 'edit' || !onChangeRef.current) {
      return;
    }
    const librarySymbolId = parseLibrarySymbolDragData(event.dataTransfer.getData(LIBRARY_SYMBOL_DRAG_MIME));
    if (librarySymbolId) {
      const svg = event.currentTarget.querySelector('svg');
      const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
      if (!point) {
        return;
      }
      event.preventDefault();
      const currentDocument = documentRef.current;
      const symbol = createLibrarySymbol({
        symbol: librarySymbolId,
        surface: currentDocument.surface,
        existingIds: currentDocument.elements.map((element) => element.id),
      });
      const positioned = positionElementAt(symbol, point, currentDocument);
      commitDocument(appendLibrarySymbol(currentDocument, positioned));
      dispatch({ type: 'SELECT', elementId: positioned.id });
      return;
    }
    const pointResult = parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)) ?? selectedPiPoint;
    const binding = pointResult ? createPiPointBinding(pointResult) : undefined;
    const svg = event.currentTarget.querySelector('svg');
    const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
    const currentDocument = documentRef.current;
    const targetTrend = dropSymbolType === 'trend'
      ? resolveTrendDropTarget(
        currentDocument,
        event.target,
        event.clientX,
        event.clientY,
        point,
      )
      : undefined;
    const targetShape = resolveGeometricDropTarget(currentDocument, event.target, point);
    if (!binding || (!point && !targetTrend && !targetShape)) {
      return;
    }
    event.preventDefault();

    if (targetTrend) {
      commitDocument(addTrendSeries(currentDocument, targetTrend.id, binding));
      dispatch({ type: 'SELECT', elementId: targetTrend.id });
      return;
    }

    if (targetShape) {
      commitDocument(updateRectangleProperties(currentDocument, targetShape.id, { binding }));
      dispatch({ type: 'SELECT', elementId: targetShape.id });
      return;
    }
    const createOptions = {
      binding,
      surface: currentDocument.surface,
      existingIds: currentDocument.elements.map((element) => element.id),
    };

    switch (dropSymbolType) {
      case 'trend': {
        const element = positionElementAt(createTrend(createOptions), point!, currentDocument);
        commitDocument(appendTrend(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
      case 'gauge': {
        const element = positionElementAt(createGauge(createOptions), point!, currentDocument);
        commitDocument(appendGauge(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
      case 'bar': {
        const element = positionElementAt(createBar(createOptions), point!, currentDocument);
        commitDocument(appendBar(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
      case 'value': {
        const element = positionElementAt(createValue(createOptions), point!, currentDocument);
        commitDocument(appendValue(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
    }
  }, [commitDocument, dispatch, dropSymbolType, mode, selectedPiPoint]);

  const handleModeChange = useCallback(
    (nextMode: DisplayEditorMode) => {
      setMode(nextMode);
      onModeChange?.(nextMode);
      if (nextMode === 'view') {
        dispatch({ type: 'CLEAR_SELECTION' });
        setOptionsTrendId(null);
      }
    },
    [dispatch, onModeChange],
  );

  const handleExport = useCallback(() => {
    const blob = new Blob([serializeDisplay(documentRef.current)], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = getDisplayExportFileName(documentRef.current.name);
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }, []);

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !onChangeRef.current) {
      return;
    }
    try {
      const imported = parseImportedDisplay(await readFileText(file));
      historyRef.current = createDisplayHistory(imported);
      refreshHistory((version) => version + 1);
      pendingTransactionRef.current = null;
      dispatch({ type: 'CLEAR_SELECTION' });
      setImportError(null);
      publishDocument(imported);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Arquivo de Display inválido.');
    }
  }, [dispatch, publishDocument]);

  const selectedValue = mode === 'edit' && state.selectedElementId
    ? displayDocument.elements.find((element) => (
      element.id === state.selectedElementId
      && element.type === VALUE_TYPE
      && isPiPointBinding(element.properties.binding)
    )) as ValueElement | undefined
    : undefined;

  const handleValueVisualChange = useCallback((patch: Partial<ValueVisualOptions>) => {
    const selectedId = stateRef.current.selectedElementId;
    if (!selectedId || !onChangeRef.current) {
      return;
    }
    commitDocument(updateValueVisualOptions(documentRef.current, selectedId, patch));
  }, [commitDocument]);

  const handleMultistateChange = useCallback((config: MultistateConfig) => {
    const selectedId = stateRef.current.selectedElementId;
    if (!selectedId) {
      return;
    }
    commitDocument(updateMultistateConfig(documentRef.current, selectedId, config));
  }, [commitDocument]);

  const selectedGauge = mode === 'edit' && state.selectedElementId
    ? displayDocument.elements.find((element) => element.id === state.selectedElementId && element.type === GAUGE_TYPE) as GaugeElement | undefined
    : undefined;
  const selectedBar = mode === 'edit' && state.selectedElementId
    ? displayDocument.elements.find((element) => element.id === state.selectedElementId && element.type === BAR_TYPE) as BarElement | undefined
    : undefined;
  const selectedRectangle = mode === 'edit' && state.selectedElementId
    ? displayDocument.elements.find((element) => element.id === state.selectedElementId && element.type === RECTANGLE_TYPE) as RectangleElement | undefined
    : undefined;
  const selectedText = mode === 'edit' && state.selectedElementId
    ? displayDocument.elements.find((element) => element.id === state.selectedElementId && element.type === TEXT_TYPE) as TextElement | undefined
    : undefined;
  const selectedImage = mode === 'edit' && state.selectedElementId
    ? displayDocument.elements.find((element) => element.id === state.selectedElementId && element.type === IMAGE_TYPE) as ImageElement | undefined
    : undefined;
  const handleGaugeChange = useCallback((patch: Parameters<typeof updateGaugeOptions>[2]) => {
    commitDocument(updateGaugeOptions(documentRef.current, stateRef.current.selectedElementId ?? '', patch));
  }, [commitDocument]);
  const handleBarChange = useCallback((patch: Parameters<typeof updateBarOptions>[2]) => {
    commitDocument(updateBarOptions(documentRef.current, stateRef.current.selectedElementId ?? '', patch));
  }, [commitDocument]);
  const handleRectangleChange = useCallback((patch: Parameters<typeof updateRectangleProperties>[2]) => {
    commitDocument(updateRectangleProperties(documentRef.current, stateRef.current.selectedElementId ?? '', patch));
  }, [commitDocument]);
  const handleTextChange = useCallback((patch: Parameters<typeof updateTextProperties>[2]) => {
    commitDocument(updateTextProperties(documentRef.current, stateRef.current.selectedElementId ?? '', patch));
  }, [commitDocument]);
  const handleImageChange = useCallback((patch: Parameters<typeof updateImageProperties>[2]) => {
    commitDocument(updateImageProperties(documentRef.current, stateRef.current.selectedElementId ?? '', patch));
  }, [commitDocument]);
  const optionsTrend = optionsTrendId
    ? displayDocument.elements.find((element) => element.id === optionsTrendId && element.type === TREND_TYPE) as TrendElement | undefined
    : undefined;
  const handleTrendVisualChange = useCallback((patch: Parameters<typeof updateTrendVisualOptions>[2]) => {
    if (optionsTrendId) {
      commitDocument(updateTrendVisualOptions(documentRef.current, optionsTrendId, patch));
    }
  }, [commitDocument, optionsTrendId]);
  const handleTrendSeriesChange = useCallback((key: string, patch: Parameters<typeof updateTrendSeriesOptions>[3]) => {
    if (optionsTrendId) {
      commitDocument(updateTrendSeriesOptions(documentRef.current, optionsTrendId, key, patch));
    }
  }, [commitDocument, optionsTrendId]);
  const handleTrendSeriesRemove = useCallback((key: string) => {
    if (optionsTrendId) {
      commitDocument(removeTrendSeries(documentRef.current, optionsTrendId, key));
    }
  }, [commitDocument, optionsTrendId]);

  const handleDeleteSelectedElement = useCallback(() => {
    if (mode !== 'edit') {
      return;
    }
    const selectedId = stateRef.current.selectedElementId;
    if (!selectedId) {
      return;
    }
    const currentDocument = documentRef.current;
    if (!currentDocument.elements.some((element) => element.id === selectedId)) {
      dispatch({ type: 'CLEAR_SELECTION' });
      return;
    }
    commitDocument({
      ...currentDocument,
      elements: currentDocument.elements.filter((element) => element.id !== selectedId),
    });
  }, [commitDocument, dispatch, mode]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target)) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      handleRedo();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'edit') {
      event.preventDefault();
      handleDeleteSelectedElement();
    }
  }, [handleDeleteSelectedElement, handleRedo, handleUndo, mode]);

  useEffect(() => {
    if (state.selectedElementId && !displayDocument.elements.some((element) => element.id === state.selectedElementId)) {
      dispatch({ type: 'CLEAR_SELECTION' });
    }
  }, [dispatch, displayDocument.elements, state.selectedElementId]);

  const handleTrendOpen = useCallback((element: TrendElement, seriesStates: readonly TrendSeriesViewState[], cursors: readonly TrendCursor[] = []) => {
    const requestId = trendPopupRequest.current + 1;
    trendPopupRequest.current = requestId;
    const initialState = { element, seriesStates, cursors, loading: !!loadRecordedTrend };
    trendPopupRef.current = initialState;
    setTrendPopup(initialState);
    if (!loadRecordedTrend) {
      return;
    }
    const series = getTrendSeries(element);
    const applyResults = (results: Awaited<ReturnType<LoadTrendSeries>>) => {
      if (trendPopupRequest.current !== requestId) {
        return;
      }
      setTrendPopup((current) => {
        if (!current || current.element.id !== element.id) {
          return current;
        }
        const next = {
          ...current,
          loading: false,
          seriesStates: current.seriesStates.map(({ series: trendSeries, runtimeState }) => {
            const result = results[`${trendSeries.binding.dataSourceUid}\u0000${trendSeries.binding.serverPath}\u0000${trendSeries.binding.pointName}`];
            return result?.status === 'success'
              ? { series: trendSeries, runtimeState: { status: 'success' as const, data: result.series } }
              : { series: trendSeries, runtimeState };
          }),
        };
        trendPopupRef.current = next;
        return next;
      });
    };
    void loadRecordedTrend(series.map(({ binding }) => binding), applyResults, { maxDataPoints: TREND_POPUP_MAX_DATA_POINTS })
      .then(applyResults)
      .catch(() => {
        if (trendPopupRequest.current === requestId) {
          setTrendPopup((current) => {
            const next = current ? { ...current, loading: false } : null;
            trendPopupRef.current = next;
            return next;
          });
        }
      });
  }, [loadRecordedTrend]);

  const handleTrendPopupClose = useCallback(() => {
    trendPopupRequest.current += 1;
    trendPopupRef.current = null;
    setTrendPopup(null);
  }, []);

  const handleZoomFit = useCallback(() => {
    const elements = documentRef.current.elements;
    const surface = documentRef.current.surface;
    if (elements.length === 0) {
      setSurfaceZoom(1);
      setSurfaceViewCenter({ x: surface.width / 2, y: surface.height / 2 });
      return;
    }
    const left = Math.min(...elements.map((element) => element.x));
    const top = Math.min(...elements.map((element) => element.y));
    const right = Math.max(...elements.map((element) => element.x + element.width));
    const bottom = Math.max(...elements.map((element) => element.y + element.height));
    const padding = 1.12;
    const zoom = Math.max(DISPLAY_ZOOM_MIN, Math.min(
      DISPLAY_ZOOM_MAX,
      surface.width / Math.max(1, (right - left) * padding),
      surface.height / Math.max(1, (bottom - top) * padding),
    ));
    setSurfaceZoom(Number(zoom.toFixed(2)));
    setSurfaceViewCenter({ x: (left + right) / 2, y: (top + bottom) / 2 });
  }, []);

  useEffect(() => {
    const current = trendPopupRef.current;
    if (!current) {
      return;
    }
    const element = displayDocument.elements.find((candidate) => candidate.id === current.element.id);
    if (element?.type === TREND_TYPE) {
    handleTrendOpen(element as TrendElement, current.seriesStates, current.cursors);
    }
  }, [displayDocument.elements, handleTrendOpen, trendRefreshKey]);

  return (
    <div className={styles.container} data-testid="display-editor" onKeyDown={handleEditorKeyDown}>
      <div className={styles.header}>
        <div className={styles.headerPrimary}>
          <div className={styles.displayLabel}>
            <span className={styles.displayLabelPrefix}>Display:</span>
            <span className={styles.title} data-testid="display-editor-name">
              {displayDocument.name}
            </span>
          </div>
          <div className={styles.modeControls} role="group" aria-label="Modo do display">
            <button
              type="button"
              className={mode === 'edit' ? styles.modeButtonActive : styles.modeButton}
              data-testid="display-mode-edit"
              aria-pressed={mode === 'edit'}
              aria-label="Editar"
              title="Editar"
              onClick={() => handleModeChange('edit')}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              className={mode === 'view' ? styles.modeButtonActive : styles.modeButton}
              data-testid="display-mode-view"
              aria-pressed={mode === 'view'}
              aria-label="Visualizar"
              title="Visualizar"
              onClick={() => handleModeChange('view')}
            >
              <EyeIcon />
            </button>
          </div>
          {mode === 'edit' && showToolbar && (
            <div className={styles.toolbar} data-testid="display-editor-toolbar">
              <div className={styles.toolbarGroup} aria-label="Histórico">
                <button type="button" title="Desfazer" className={styles.iconButton} data-testid="display-undo" aria-label="Desfazer" disabled={!hasUndo(historyRef.current)} onClick={handleUndo}><UndoIcon /></button>
                <button type="button" title="Refazer" className={styles.iconButton} data-testid="display-redo" aria-label="Refazer" disabled={!hasRedo(historyRef.current)} onClick={handleRedo}><RedoIcon /></button>
              </div>
              <span className={styles.toolbarDivider} aria-hidden="true" />
              <div className={styles.toolbarGroup} aria-label="Inserir elementos">
                <button type="button" title="Inserir forma geométrica" aria-label="Inserir forma geométrica" className={styles.iconButton} data-testid="display-insert-rectangle" onClick={handleInsertRectangle}><RectangleIcon /></button>
                <button type="button" title="Inserir texto" aria-label="Inserir texto" className={styles.iconButton} data-testid="display-insert-text" onClick={handleInsertText}><TextIcon /></button>
                <button type="button" title="Inserir imagem" aria-label="Inserir imagem" className={styles.iconButton} data-testid="display-insert-image" onClick={() => imageInputRef.current?.click()}><ImageIcon /></button>
                <input ref={imageInputRef} type="file" accept="image/*" data-testid="display-image-input" className={styles.fileInput} onChange={handleImageFile} />
                <button type="button" title="Arrastar como Value" aria-label="Arrastar como Value" className={dropSymbolType === 'value' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-value" aria-pressed={dropSymbolType === 'value'} disabled={!createPiPointBinding(selectedPiPoint ?? {})} onClick={() => { onDropSymbolTypeChange?.('value'); handleInsertBoundElement('value'); }}><ValueIcon /></button>
                <button type="button" title="Arrastar como Gauge" aria-label="Arrastar como Gauge" className={dropSymbolType === 'gauge' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-gauge" aria-pressed={dropSymbolType === 'gauge'} disabled={!createPiPointBinding(selectedPiPoint ?? {})} onClick={() => { onDropSymbolTypeChange?.('gauge'); handleInsertBoundElement('gauge'); }}><GaugeIcon /></button>
                <button type="button" title="Arrastar como Barra" aria-label="Arrastar como Barra" className={dropSymbolType === 'bar' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-bar" aria-pressed={dropSymbolType === 'bar'} disabled={!createPiPointBinding(selectedPiPoint ?? {})} onClick={() => { onDropSymbolTypeChange?.('bar'); handleInsertBoundElement('bar'); }}><BarIcon /></button>
                <button type="button" title="Arrastar como Trend" aria-label="Arrastar como Trend" className={dropSymbolType === 'trend' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-trend" aria-pressed={dropSymbolType === 'trend'} disabled={!createPiPointBinding(selectedPiPoint ?? {})} onClick={() => { onDropSymbolTypeChange?.('trend'); handleInsertBoundElement('trend'); }}><TrendIcon /></button>
              </div>
              <span className={styles.toolbarDivider} aria-hidden="true" />
              <div className={styles.toolbarGroup} aria-label="Ordem dos objetos">
                <button type="button" title="Trazer uma camada para frente" aria-label="Trazer uma camada para frente" className={styles.iconButton} data-testid="display-bring-front" disabled={state.selectedElementId === null} onClick={() => reorderSelected('front')}><BringFrontIcon /></button>
                <button type="button" title="Enviar uma camada para trás" aria-label="Enviar uma camada para trás" className={styles.iconButton} data-testid="display-send-back" disabled={state.selectedElementId === null} onClick={() => reorderSelected('back')}><SendBackIcon /></button>
                <button type="button" title="Trazer tudo para frente" aria-label="Trazer tudo para frente" className={styles.iconButton} data-testid="display-bring-all-front" disabled={state.selectedElementId === null} onClick={() => reorderSelected('front', true)}><BringAllFrontIcon /></button>
                <button type="button" title="Enviar tudo para trás" aria-label="Enviar tudo para trás" className={styles.iconButton} data-testid="display-send-all-back" disabled={state.selectedElementId === null} onClick={() => reorderSelected('back', true)}><SendAllBackIcon /></button>
              </div>
            </div>
          )}
          <div className={styles.transferControls} data-testid="display-transfer-controls">
            <div className={styles.zoomControls} role="group" aria-label="Zoom do display">
              <button type="button" title="Ampliar" aria-label="Ampliar" className={styles.iconButton} data-testid="display-zoom-in" disabled={surfaceZoom >= DISPLAY_ZOOM_MAX} onClick={() => setSurfaceZoom((zoom) => Math.min(DISPLAY_ZOOM_MAX, Number((zoom + DISPLAY_ZOOM_STEP).toFixed(1))))}><ZoomInIcon /></button>
              <button type="button" title="Reduzir" aria-label="Reduzir" className={styles.iconButton} data-testid="display-zoom-out" disabled={surfaceZoom <= DISPLAY_ZOOM_MIN} onClick={() => setSurfaceZoom((zoom) => Math.max(DISPLAY_ZOOM_MIN, Number((zoom - DISPLAY_ZOOM_STEP).toFixed(1))))}><ZoomOutIcon /></button>
              <button type="button" title="Ajustar à tela" aria-label="Ajustar à tela" className={styles.iconButton} data-testid="display-zoom-fit" onClick={handleZoomFit}><ZoomFitIcon /></button>
            </div>
            <button type="button" title="Exportar Display" aria-label="Exportar Display" className={styles.iconButton} data-testid="display-export" onClick={handleExport}>
              <ExportIcon />
            </button>
            <button type="button" title="Importar Display" aria-label="Importar Display" className={styles.iconButton} data-testid="display-import" disabled={!onChange} onClick={() => importInputRef.current?.click()}>
              <ImportIcon />
            </button>
            <input ref={importInputRef} type="file" accept="application/json,.json,.pims-vision.json" data-testid="display-import-input" className={styles.fileInput} onChange={handleImportFile} />
          </div>
        </div>
      </div>
      {importError && <div className={styles.importError} role="alert" data-testid="display-import-error">{importError}</div>}
      <div className={styles.workspace}>
        <div
          className={styles.surfaceWrapper}
          data-testid="display-editor-surface-wrapper"
          onDragOver={handlePiPointDragOver}
          onDragLeave={handlePiPointDragLeave}
          onDrop={handlePiPointDrop}
        >
          <DisplaySurface
            document={displayDocument}
            editable={mode === 'edit'}
            selectedElementId={mode === 'edit' ? state.selectedElementId : null}
            selectedElementIds={mode === 'edit' ? state.selectedElementIds : []}
            onSelect={handleSelect}
            onSelectMany={handleSelectMany}
            onStartDrag={handleStartDrag}
            onStartResize={handleStartResize}
            onPointerMove={handlePointerMove}
            onPointerEnd={handlePointerEnd}
            loadValue={loadValue}
            loadPiPointDatabaseLimits={loadPiPointDatabaseLimits}
            loadValues={loadValues}
            loadTrend={loadTrend}
            trendRefreshKey={trendRefreshKey}
            trendTimeRange={trendTimeRange}
            onTrendOpen={handleTrendOpen}
            onTrendContextMenu={(trend) => setOptionsTrendId(trend.id)}
            zoom={surfaceZoom}
            viewCenter={surfaceViewCenter}
          />
          {displayDocument.elements.length === 0 && (
            <div className={styles.emptyState} data-testid="display-empty-state">
              <BarIcon />
              <strong>Adicione um elemento</strong>
              <span>para começar</span>
            </div>
          )}
          {piPointDragPreview && (
            <div
              className={piPointDragPreview.targetTrend
                ? styles.piPointDragPreviewTrendTarget
                : piPointDragPreview.valid ? styles.piPointDragPreviewValid : styles.piPointDragPreviewInvalid}
              data-testid="pi-point-drag-preview"
              data-valid={piPointDragPreview.valid ? 'true' : 'false'}
              data-target-trend={piPointDragPreview.targetTrend ? 'true' : 'false'}
              style={{
                left: piPointDragPreview.left,
                top: piPointDragPreview.top,
                width: piPointDragPreview.width,
                height: piPointDragPreview.height,
              }}
            >
              {piPointDragPreview.targetTrend ? (
                <><TagIcon /><span>{piPointDragPreview.label}</span></>
              ) : piPointDragPreview.valid ? (
                <DropPreviewIcon symbolType={piPointDragPreview.symbolType} />
              ) : (
                <span>{piPointDragPreview.label}</span>
              )}
            </div>
          )}
        </div>
        {selectedValue && (
          <ValuePropertiesPanel
            options={selectedValue.properties.visual}
            pointName={selectedValue.properties.binding.pointName}
            onChange={handleValueVisualChange}
            multistate={selectedValue.properties.multistate}
            onMultistateChange={handleMultistateChange}
          />
        )}
        {selectedGauge && (
          <ScalePropertiesPanel kind="Gauge" {...getGaugeOptions(selectedGauge.properties)} onChange={handleGaugeChange} multistate={selectedGauge.properties.multistate} onMultistateChange={handleMultistateChange} />
        )}
        {selectedBar && (
          <ScalePropertiesPanel kind="Bar" {...getBarOptions(selectedBar.properties)} onChange={handleBarChange} multistate={selectedBar.properties.multistate} onMultistateChange={handleMultistateChange} />
        )}
        {selectedRectangle && (
          <RectanglePropertiesPanel
            fill={selectedRectangle.properties.fill ?? DEFAULT_RECTANGLE_PROPERTIES.fill}
            stroke={selectedRectangle.properties.stroke ?? DEFAULT_RECTANGLE_PROPERTIES.stroke}
            shape={selectedRectangle.properties.shape ?? 'rectangle'}
            rotation={selectedRectangle.properties.rotation}
            pointName={isPiPointBinding(selectedRectangle.properties.binding) ? selectedRectangle.properties.binding.pointName : undefined}
            multistate={selectedRectangle.properties.multistate}
            onChange={handleRectangleChange}
            onMultistateChange={handleMultistateChange}
          />
        )}
        {selectedText && <TextPropertiesPanel properties={selectedText.properties} onChange={handleTextChange} />}
        {selectedImage && <ImagePropertiesPanel properties={selectedImage.properties} onChange={handleImageChange} />}
        {optionsTrend && <TrendPropertiesPanel element={optionsTrend} onVisualChange={handleTrendVisualChange} onSeriesChange={handleTrendSeriesChange} onSeriesRemove={handleTrendSeriesRemove} onClose={() => setOptionsTrendId(null)} />}
      </div>
      {trendPopup && (
        <TrendPopup
          seriesStates={trendPopup.seriesStates}
          initialCursors={trendPopup.cursors}
          visualOptions={getTrendVisualOptions(trendPopup.element)}
          timeRange={trendTimeRange}
          timeSelection={timeSelection}
          onTimeSelectionChange={onTimeSelectionChange}
          loading={trendPopup.loading}
          onClose={handleTrendPopupClose}
        />
      )}
    </div>
  );
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Arquivo de Display inválido.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file, 'UTF-8');
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName?.toLowerCase();
  return tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || element.isContentEditable;
}

function getDropPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  document: DisplayDocument,
): Point | undefined {
  const bounds = svg.getBoundingClientRect();
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)
    || bounds.width <= 0 || bounds.height <= 0
    || clientX < bounds.left || clientX > bounds.right
    || clientY < bounds.top || clientY > bounds.bottom) {
    return undefined;
  }
  const viewport = getSvgViewport(bounds, document);
  if (clientX < viewport.left || clientX > viewport.left + viewport.width
    || clientY < viewport.top || clientY > viewport.top + viewport.height) {
    return undefined;
  }
  return {
    x: (clientX - viewport.left) / viewport.scale,
    y: (clientY - viewport.top) / viewport.scale,
  };
}

function getSvgViewport(bounds: DOMRect, document: DisplayDocument) {
  const scale = Math.min(
    bounds.width / document.surface.width,
    bounds.height / document.surface.height,
  );
  const width = document.surface.width * scale;
  const height = document.surface.height * scale;
  return {
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
    height,
    scale,
  };
}

function positionElementAt<T extends ElementGeometry>(
  element: T,
  point: Point,
  document: DisplayDocument,
): T {
  return {
    ...element,
    x: Math.max(0, Math.min(document.surface.width - element.width, point.x - element.width / 2)),
    y: Math.max(0, Math.min(document.surface.height - element.height, point.y - element.height / 2)),
  };
}

function createPiPointDragPreview(
  svg: SVGSVGElement,
  wrapper: HTMLDivElement,
  clientX: number,
  clientY: number,
  document: DisplayDocument,
  label: string,
  symbolType: PiPointDropSymbolType,
  pointResult: PiPointSearchResult,
  trendAtClientPoint?: TrendElement,
  allowTrendTarget = true,
): PiPointDragPreview {
  const binding = createPiPointBinding(pointResult);
  const point = binding ? getDropPoint(svg, clientX, clientY, document) : undefined;
  const prototype = binding ? createDropPreviewElement(symbolType, binding, document) : undefined;
  const targetTrend = allowTrendTarget
    ? trendAtClientPoint ?? (point ? findTrendAtPoint(document, point) : undefined)
    : undefined;
  // The drop handler clamps the element to the surface bounds, so every
  // pointer position inside the display is a valid placement.
  const valid = !!binding && !!prototype && (!!point || !!targetTrend);

  if (!valid || !prototype) {
    return createInvalidDragPreview(wrapper, clientX, clientY, label, symbolType);
  }

  const svgBounds = svg.getBoundingClientRect();
  const wrapperBounds = wrapper.getBoundingClientRect();
  const viewport = getSvgViewport(svgBounds, document);
  if (targetTrend) {
    const trendLeft = viewport.left - wrapperBounds.left + targetTrend.x * viewport.scale;
    const trendTop = viewport.top - wrapperBounds.top + targetTrend.y * viewport.scale;
    const trendWidth = targetTrend.width * viewport.scale;
    const trendHeight = targetTrend.height * viewport.scale;
    const width = Math.min(320, Math.max(1, trendWidth - 12));
    const height = Math.min(64, Math.max(1, trendHeight - 12));
    const pointerLeft = clientX - wrapperBounds.left - width / 2;
    const pointerTop = clientY - wrapperBounds.top - height / 2;
    return {
      left: Math.max(trendLeft + 6, Math.min(pointerLeft, trendLeft + trendWidth - width - 6)),
      top: Math.max(trendTop + 6, Math.min(pointerTop, trendTop + trendHeight - height - 6)),
      width,
      height,
      valid: true,
      label,
      symbolType: 'trend',
      targetTrend: true,
      targetTrendId: targetTrend.id,
    };
  }
  const positioned = positionElementAt(prototype, point!, document);
  return {
    left: viewport.left - wrapperBounds.left + positioned.x * viewport.scale,
    top: viewport.top - wrapperBounds.top + positioned.y * viewport.scale,
    width: positioned.width * viewport.scale,
    height: positioned.height * viewport.scale,
    valid: true,
    label,
    symbolType,
    targetTrend: false,
  };
}

function findTrendAtPoint(document: DisplayDocument, point: Point): TrendElement | undefined {
  const topmostElement = [...document.elements].reverse().find((element) => (
    point.x >= element.x
    && point.x <= element.x + element.width
    && point.y >= element.y
    && point.y <= element.y + element.height
  ));
  return topmostElement?.type === TREND_TYPE ? topmostElement as TrendElement : undefined;
}

function resolveGeometricDropTarget(
  document: DisplayDocument,
  eventTarget: EventTarget | null,
  point: Point | undefined,
): RectangleElement | undefined {
  const shapeNode = eventTarget instanceof Element
    ? eventTarget.closest('[data-element-id][data-element-type="rectangle"]')
    : null;
  const elementId = shapeNode?.getAttribute('data-element-id');
  if (elementId) {
    const element = document.elements.find((candidate) => candidate.id === elementId && candidate.type === RECTANGLE_TYPE);
    if (element) {
      return element as RectangleElement;
    }
  }
  if (!point) {
    return undefined;
  }
  const topmostElement = [...document.elements].reverse().find((element) => (
    element.type === RECTANGLE_TYPE
      && point.x >= element.x
      && point.x <= element.x + element.width
      && point.y >= element.y
      && point.y <= element.y + element.height
  ));
  return topmostElement as RectangleElement | undefined;
}

function findTrendAtClientPoint(
  clientX: number,
  clientY: number,
  displayDocument: DisplayDocument,
): TrendElement | undefined {
  const hit = globalThis.document.elementFromPoint?.(clientX, clientY);
  const trendNode = hit instanceof Element
    ? hit.closest('[data-element-id][data-element-type="trend"]')
    : null;
  const elementId = trendNode?.getAttribute('data-element-id');
  if (!elementId) {
    return undefined;
  }
  const element = displayDocument.elements.find((candidate) => (
    candidate.id === elementId && candidate.type === TREND_TYPE
  ));
  return element as TrendElement | undefined;
}

function resolveTrendDropTarget(
  document: DisplayDocument,
  eventTarget: EventTarget | null,
  clientX: number,
  clientY: number,
  point: Point | undefined,
): TrendElement | undefined {
  return findTrendFromEventTarget(eventTarget, document)
    ?? findTrendAtClientPoint(clientX, clientY, document)
    ?? (point ? findTrendAtPoint(document, point) : undefined)
}

function findTrendFromEventTarget(
  eventTarget: EventTarget | null,
  displayDocument: DisplayDocument,
): TrendElement | undefined {
  const trendNode = eventTarget instanceof Element
    ? eventTarget.closest('[data-element-id][data-element-type="trend"]')
    : null;
  const elementId = trendNode?.getAttribute('data-element-id');
  if (!elementId) {
    return undefined;
  }
  const element = displayDocument.elements.find((candidate) => (
    candidate.id === elementId && candidate.type === TREND_TYPE
  ));
  return element as TrendElement | undefined;
}

function createInvalidDragPreview(
  wrapper: HTMLDivElement,
  clientX: number,
  clientY: number,
  label: string,
  symbolType: PiPointDropSymbolType,
): PiPointDragPreview {
  const wrapperBounds = wrapper.getBoundingClientRect();
  const width = Math.max(220, Math.min(420, label.length * 8 + 24));
  const height = 48;
  const x = Number.isFinite(clientX) ? clientX - wrapperBounds.left : 0;
  const y = Number.isFinite(clientY) ? clientY - wrapperBounds.top : 0;
  return {
    left: Math.max(0, x - width / 2),
    top: Math.max(0, y - height / 2),
    width,
    height,
    valid: false,
    label,
    symbolType,
    targetTrend: false,
  };
}

function createDropPreviewElement(
  symbolType: PiPointDropSymbolType,
  binding: PiPointBinding,
  document: DisplayDocument,
): ElementGeometry {
  const options = {
    binding,
    surface: document.surface,
  };
  switch (symbolType) {
    case 'trend':
      return createTrend(options);
    case 'gauge':
      return createGauge(options);
    case 'bar':
      return createBar(options);
    case 'value':
      return createValue(options);
  }
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    background: linear-gradient(115deg, var(--surface-primary), var(--surface-secondary));

    @media (max-width: 760px) {
      height: auto;
      min-height: 100%;
      border-radius: 0;
    }
  `,
  header: css`
    display: flex;
    flex: 0 0 68px;
    min-height: 68px;
    border-bottom: 1px solid var(--border-color);
    background: var(--surface-primary);

    @media (max-width: 760px) {
      flex: 0 0 auto;
      min-height: 56px;
      flex-wrap: wrap;
    }
  `,
  headerPrimary: css`
    flex: 1 1 auto;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1.25)};
    padding: 0 ${theme.spacing(1.5)};
    min-width: 0;
    color: var(--text-primary);
    background: transparent;

    @media (max-width: 760px) {
      flex: 1 1 100%;
      height: 56px;
    }
  `,
  displayLabel: css`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 36%;
  `,
  displayLabelPrefix: css`
    color: var(--text-secondary);
    font-size: 12px;
  `,
  modeControls: css`
    display: flex;
    gap: 2px;
    margin-left: ${theme.spacing(1)};
  `,
  modeButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 46px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;

    &:hover {
      color: var(--text-primary);
      background: var(--button-hover);
    }
  `,
  modeButtonActive: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 46px;
    padding: 0;
    border: 1px solid var(--accent);
    border-radius: 12px;
    background: var(--selection-bg);
    color: var(--accent);
    cursor: pointer;
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    height: 100%;
    box-sizing: border-box;
    gap: 7px;
    min-width: 0;
    overflow-x: auto;
    padding: 0 ${theme.spacing(1)};

    @media (max-width: 760px) {
      flex: 1 1 100%;
      height: 50px;
      border-top: 1px solid var(--border-color);
    }
  `,
  toolbarGroup: css`
    display: flex;
    align-items: center;
    gap: 3px;
    flex: 0 0 auto;
  `,
  addTrendSeriesButton: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 36px;
    flex: 0 0 auto;
    padding: 0 9px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--selection-bg);
    color: var(--accent);
    cursor: pointer;
    font-size: 12px;

    &:hover:not(:disabled) {
      background: var(--button-hover);
      border-color: var(--accent-hover);
    }

    &:disabled {
      cursor: default;
      opacity: 0.38;
    }

    & svg {
      width: 17px;
      height: 17px;
    }
  `,
  toolbarDivider: css`
    width: 1px;
    height: 25px;
    flex: 0 0 1px;
    background: var(--border-color);
  `,
  symbolModeButton: css`
    display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 42px; padding: 0;
    border: 1px solid transparent; border-radius: 11px; background: var(--button-bg); color: var(--text-secondary); cursor: pointer;
    &:hover { color: var(--text-primary); background: var(--button-hover); border-color: var(--border-color); }
  `,
  symbolModeButtonActive: css`
    display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 42px; padding: 0;
    border: 1px solid var(--accent); border-radius: 11px; background: var(--selection-bg); color: var(--accent); cursor: pointer;
  `,
  transferControls: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  `,
  zoomControls: css`
    display: flex;
    gap: 3px;
    padding-right: 8px;
    border-right: 1px solid var(--border-color);
  `,
  fileInput: css`display: none;`,
  importError: css`
    padding: ${theme.spacing(0.75, 1.5)};
    color: ${theme.colors.error.text};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  title: css`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    font-size: 15px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  iconButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 42px;
    flex: 0 0 44px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 11px;
    background: var(--button-bg);
    color: var(--text-secondary);
    cursor: pointer;

    &:disabled {
      cursor: default;
      opacity: 0.35;
    }

    &:hover:not(:disabled) {
      color: var(--text-primary);
      border-color: var(--border-color);
      background: var(--button-hover);
    }
  `,
  surfaceWrapper: css`
    display: flex;
    position: relative;
    align-items: center;
    justify-content: center;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    background-color: var(--canvas-bg);
    background-image: radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px);
    background-size: 16px 16px;
    border-top: 1px solid var(--border-subtle);

    & > svg {
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
    }

    @media (max-width: 760px) {
      flex: 0 0 auto;
      width: 100%;
      min-height: min(62vh, 560px);
    }
  `,
  surfaceWrapperDragOver: css`
    box-shadow: inset 0 0 0 3px var(--accent);
  `,
  emptyState: css`
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 300px;
    height: 180px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-secondary);
    background: var(--surface-elevated);
    box-shadow: var(--shadow);
    pointer-events: none;

    & svg { width: 52px; height: 52px; color: var(--text-muted); }
    & strong { margin-top: 8px; color: var(--text-primary); font-size: 20px; }
    & span { font-size: 16px; }
  `,
  piPointDragPreviewValid: css`
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 2px solid #67ff35;
    background: rgba(104, 75, 125, 0.22);
    pointer-events: none;

    & svg {
      width: 64px;
      height: 64px;
      color: rgba(255, 255, 255, 0.72);
    }
  `,
  piPointDragPreviewTrendTarget: css`
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    box-sizing: border-box;
    padding: 0 8px;
    border: 2px solid #38b000;
    background: rgba(31, 31, 31, 0.9);
    color: #ffffff;
    font-size: 16px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;

    & svg {
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
      color: #7b858f;
    }

    & span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
  piPointDragPreviewInvalid: css`
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 10px;
    border: 2px solid #ef4444;
    background: rgba(106, 32, 40, 0.84);
    color: #ffffff;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    filter: none;
    box-shadow: none;
    backdrop-filter: none;
    pointer-events: none;
  `,
  workspace: css`
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;

    @media (max-width: 760px) {
      flex-direction: column;
      overflow-y: auto;

      & > aside {
        width: 100% !important;
        max-width: none !important;
        max-height: 46vh;
        flex: 0 0 auto !important;
        border-left: 0 !important;
        border-top: 1px solid var(--border-color);
      }
    }
  `,
});

function UndoIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 7 4 12l5 5" /><path d="M5 12h8a6 6 0 0 1 6 6" /></svg>;
}

function DropPreviewIcon({ symbolType }: { symbolType: PiPointDropSymbolType }) {
  switch (symbolType) {
    case 'trend':
      return <TrendIcon />;
    case 'gauge':
      return <GaugeIcon />;
    case 'bar':
      return <BarIcon />;
    case 'value':
      return <ValueIcon />;
  }
}

function TagIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 12.4 11.4 4H20v8.6L11.6 21 3 12.4Zm13-5.9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
}

function RedoIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 7 5 5-5 5" /><path d="M19 12h-8a6 6 0 0 0-6 6" /></svg>;
}

function ZoomInIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="M10 7v6M7 10h6m7 7-5.5-5.5" /></svg>;
}

function ZoomOutIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="M7 10h6m7 7-5.5-5.5" /></svg>;
}

function ZoomFitIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><rect x="8" y="8" width="8" height="8" /></svg>;
}

function ValueIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" /><path d="M8 9h8M8 12h8M8 15h5" /></svg>;
}

function RectangleIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="6" width="16" height="12" /></svg>;
}

function TextIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5h14M12 5v14M8 19h8" /></svg>;
}

function ImageIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="5" width="16" height="14" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 4-4 3 3 2-2 5 4" /></svg>;
}

function BringFrontIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="7" y="4" width="12" height="12" /><path d="M5 8v11h11M10 7l3-3 3 3" /></svg>;
}

function SendBackIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="8" width="12" height="12" /><path d="M8 5h11v11M13 17l-3 3-3-3" /></svg>;
}

function BringAllFrontIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8V4h4M4 4l5 5M20 16v4h-4M20 20l-5-5" /><rect x="8" y="8" width="10" height="10" /></svg>;
}

function SendAllBackIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 8V4h-4M20 4l-5 5M4 16v4h4M4 20l5-5" /><rect x="6" y="6" width="10" height="10" /></svg>;
}

function GaugeIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 17a8 8 0 1 1 16 0" /><path d="m12 13 4-4" /><path d="M7 18h10" /></svg>;
}

function BarIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 19V9M10 19V5M15 19v-7M20 19V3" /><path d="M3 20h19" /></svg>;
}

function TrendIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 18 9 12l3 3 6-8" /><path d="M15 7h3v3" /></svg>;
}

function PencilIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 17-.7 3.7L7 20l10.8-10.8-3-3z" /><path d="m13.5 6.5 3 3M4 20h4" /></svg>;
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
}

function ExportIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 4v11M8 8l4-4 4 4" /><path d="M5 13v6h14v-6" /></svg>;
}

function ImportIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 15V4m-4 7 4 4 4-4" /><path d="M5 13v6h14v-6" /></svg>;
}
