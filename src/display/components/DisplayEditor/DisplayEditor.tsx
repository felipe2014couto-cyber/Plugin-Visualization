import React, { useReducer, useEffect, useRef, useCallback, useState, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { DisplayDocument } from '../../displayDocument';
import type { DisplayElement } from '../../displayElement';
import { generateId } from '../../ids';
import {
  createDisplayHistory,
  areDisplayDocumentsEqual,
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
  addCalculationTrendSeries,
  addTrendSeries,
  appendTrend,
  createTrend,
  getTrendSeries,
  getTrendVisualOptions,
  removeTrendSeries,
  TREND_TYPE,
  type TrendElement,
  type TrendSeries,
  updateTrendSeriesOptions,
  updateTrendVisualOptions,
  createTrendElementForElement,
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
import { addTableItem, appendTable, createTable, moveTableItem, removeTableItem, TABLE_TYPE, updateTableProperties, type TableColumnConfig, type TableElement, type TableDataItem } from '../../createTable';
import {
  appendDisplayElement,
  createRectangle,
  DEFAULT_RECTANGLE_PROPERTIES,
  RECTANGLE_TYPE,
  updateRectangleProperties,
  type RectangleElement,
  type GeometricShape,
} from '../../createRectangle';
import { createPiPointBinding, isPiPointBinding, type PiPointBinding, type PiPointDatabaseLimits } from '../../../pi/piPointBinding';
import { getPiPointMetadata, type PiDigitalStatesResult, type PiPointMetadata, type PiPointSearchResult, type PiPointValue } from '../../../pi/piDataSource';
import { PI_POINT_DRAG_MIME, parsePiPointDragData } from '../../../pi/piPointDrag';
import { CALCULATION_DRAG_MIME, parseCalculationDragData } from '../../../calculations/calculationDrag';
import { LIBRARY_SYMBOL_DRAG_MIME, parseLibrarySymbolDragData } from '../../../library/librarySymbolDrag';
import { DisplaySurface } from './DisplaySurface';
import { PROGRAMMING_TYPE, type ProgrammingElement } from '../../createProgramming';
import { TrendPopup } from '../TrendPopup';
import type { TrendSeriesViewState } from '../TrendElementView';
import { ValuePropertiesPanel } from './ValuePropertiesPanel';
import { ScalePropertiesPanel } from './ScalePropertiesPanel';
import { RectanglePropertiesPanel } from './RectanglePropertiesPanel';
import { TextPropertiesPanel } from './TextPropertiesPanel';
import { ImagePropertiesPanel } from './ImagePropertiesPanel';
import { LinkPropertiesPanel } from './LinkPropertiesPanel';
import { CanvasPropertiesPanel } from './CanvasPropertiesPanel';
import { appendImage, createImage, IMAGE_TYPE, updateImageProperties, type ImageElement } from '../../createImage';
import { LibrarySymbolPropertiesPanel } from './LibrarySymbolPropertiesPanel';
import { appendLibrarySymbol, createLibrarySymbol, updateLibrarySymbolProperties, type LibrarySymbolElement, type LibrarySymbolProperties } from '../../createLibrarySymbol';
import { appendText, createText, TEXT_TYPE, updateTextProperties, type TextElement } from '../../createText';
import {
  GROUP_TYPE,
  groupElements,
  resizeGroup,
  ungroupElements,
  updateElementInDocument,
  updateGroupProperties,
  type GroupElement,
  type GroupProperties,
} from '../../createGroup';
import { isElementLocked, updateElementLocked } from '../../createLocked';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { convertDisplayElementType, getElementPiBindings, symbolConversionTargets, type SymbolConversionType } from '../../symbolConversion';
import { TrendPropertiesPanel } from './TrendPropertiesPanel';
import { TablePropertiesPanel } from './TablePropertiesPanel';
import { PiPointInfoPanel } from './PiPointInfoPanel';
import { SqlTablePropertiesPanel } from './SqlTablePropertiesPanel';
import { SQL_TABLE_TYPE, type SqlTableElement } from '../../createSqlTable';
import { XY_PLOT_TYPE, addXYPlotYSeries, appendXYPlot, createXYPlot, moveXYPlotYSeries, removeXYPlotYSeries, updateXYPlotProperties, type XYPlotElement } from '../../createXYPlot';
import { XYPlotPropertiesPanel } from './XYPlotPropertiesPanel';
import {
  BAR_CHART_TYPE,
  createBarChart,
  appendBarChart,
  addBarChartItem,
  removeBarChartItem,
  moveBarChartItem,
  updateBarChartProperties,
  updateBarChartVisualOptions,
  type BarChartElement,
  type BarChartProperties,
  type BarChartVisualOptions,
  type BarChartItem,
} from '../../createBarChart';
import { BarChartPropertiesPanel } from './BarChartPropertiesPanel';
import type { TrendCursor } from '../../runtime/trendCursor';
import type { LoadCurrentValues } from '../../runtime/valueRuntime';
import type { LoadTrendSeries } from '../../runtime/trendRuntime';
import type { DisplayTimeRange, DisplayTimeSelection } from '../../../time/timeRange';
import { updateMultistateConfig, updateBackgroundMultistateConfig, type MultistateConfig } from '../../multistate';
import { getDisplayExportFileName, parseImportedDisplay, serializeDisplay, serializeDisplayCsv, serializeDisplayXml, type DisplayExportFileFormat } from '../../displayTransfer';
import { PiVisionImportDialog } from './PiVisionImportDialog';
import { collectDisplayDataBindings, DISPLAY_DATA_EXPORT_MAX_POINTS, serializePiDataCsv, serializePiDataXml, type DisplayDataLoader } from '../../displayDataExport';
import { serializeTableData, type TableDataExportFormat } from '../../tableDataExport';
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from './editorState';
import {
  computeDragGeometry,
  computeAlignmentSnap,
  computeResizeGeometry,
  getCanvasBounds,
  getContentBounds,
  getElementById,
  updateElementGeometry,
  type AlignmentGuide,
  type ElementGeometry,
  type Point,
  type ResizeHandle,
} from './editorGeometry';
import type { SurfaceViewport } from './viewportZoom';

export type DisplayEditorMode = 'edit' | 'view';
export type PiPointDropSymbolType = 'value' | 'trend' | 'gauge' | 'bar' | 'bar-chart' | 'table' | 'xy-plot';

export interface DisplayEditorProps {
  document: DisplayDocument;
  onChange?: (document: DisplayDocument) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onModeChange?: (mode: DisplayEditorMode) => void;
  selectedPiPoint?: PiPointSearchResult | null;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  loadPiPointDatabaseLimits?: (binding: PiPointBinding) => Promise<PiPointDatabaseLimits>;
  loadDigitalStates?: (binding: PiPointBinding) => Promise<PiDigitalStatesResult>;
  loadValues?: LoadCurrentValues;
  loadTrend?: LoadTrendSeries;
  loadRecordedTrend?: LoadTrendSeries;
  dropSymbolType?: PiPointDropSymbolType;
  onDropSymbolTypeChange?: (type: PiPointDropSymbolType) => void;
  trendRefreshKey?: string;
  trendTimeRange?: DisplayTimeRange;
  timeSelection?: DisplayTimeSelection;
  onTimeSelectionChange?: (selection: DisplayTimeSelection) => void;
  onCalculationOpen?: (calculationId: string) => void;
  onProgrammingEdit?: (elementId: string) => void;
  symbolModeOnly?: boolean;
  showToolbar?: boolean;
  loadRecordedData?: DisplayDataLoader;
  loadInterpolatedData?: DisplayDataLoader;
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
  targetTable?: boolean;
  targetTableId?: string;
  targetBarChart?: boolean;
  targetBarChartId?: string;
}

interface TrendPopupState {
  element: TrendElement;
  seriesStates: readonly TrendSeriesViewState[];
  loading: boolean;
  cursors: readonly TrendCursor[];
}

interface TrendPointInfoState {
  pointName: string;
  value: string | number | undefined;
  metadata?: PiPointMetadata;
  loading: boolean;
  error?: string;
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
  loadDigitalStates,
  loadValues,
  loadTrend,
  loadRecordedTrend,
  dropSymbolType = 'value',
  onDropSymbolTypeChange,
  trendRefreshKey,
  trendTimeRange,
  timeSelection,
  onTimeSelectionChange,
  onCalculationOpen,
  onProgrammingEdit,
  symbolModeOnly = false,
  showToolbar = true,
  loadRecordedData,
  loadInterpolatedData,
  onSelectionChange,
}: DisplayEditorProps) {
  const styles = useStyles2(getStyles);
  const [state, baseDispatch] = useReducer(editorReducer, initialEditorState);
  const [mode, setMode] = useState<DisplayEditorMode>('edit');

  const stateRef = useRef<EditorState>(state);
  const documentRef = useRef<DisplayDocument>(displayDocument);
  const onChangeRef = useRef<((document: DisplayDocument) => void) | undefined>(onChange);
  const historyRef = useRef(createDisplayHistory(displayDocument));
  const expectedDocumentsRef = useRef<DisplayDocument[]>([]);
  const pendingTransactionRef = useRef<PendingDocumentTransaction | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [, refreshHistory] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [piVisionImportOpen, setPiVisionImportOpen] = useState(false);
  const [piPointDragPreview, setPiPointDragPreview] = useState<PiPointDragPreview | null>(null);
  const [trendPopup, setTrendPopup] = useState<TrendPopupState | null>(null);
  const [trendPointInfo, setTrendPointInfo] = useState<TrendPointInfoState | null>(null);
  const [optionsTrendId, setOptionsTrendId] = useState<string | null>(null);
  const [optionsElementId, setOptionsElementId] = useState<string | null>(null);
  // Sidebars are opened explicitly with the element context menu.
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    elementId?: string;
    elementIds?: string[];
    showGroup?: boolean;
    showUngroup?: boolean;
    isLocked?: boolean;
    showProgrammingEdit?: boolean;
  } | null>(null);
  const [pendingSymbolConversion, setPendingSymbolConversion] = useState<{ elementId: string; targetType: SymbolConversionType; bindings: PiPointBinding[]; selectedIndex: number } | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [shapeMenuPosition, setShapeMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [exporting, setExporting] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(displayDocument.name);
  const [surfaceZoom, setSurfaceZoom] = useState(displayDocument.surface.zoom ?? 1);
  const [surfaceViewCenter, setSurfaceViewCenter] = useState({
    x: displayDocument.surface.viewCenterX ?? (displayDocument.surface.width / 2),
    y: displayDocument.surface.viewCenterY ?? (displayDocument.surface.height / 2),
  });
  const trendPopupRequest = useRef(0);
  const trendPopupRef = useRef<TrendPopupState | null>(null);
  const copiedElementsRef = useRef<DisplayElement[]>([]);
  const batchEditElementIdsRef = useRef<string[]>([]);
  const pasteCountRef = useRef(0);
  const surfaceWrapperRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const canvasBounds = useMemo(
    () => getCanvasBounds(displayDocument.surface, displayDocument.elements),
    [displayDocument.elements, displayDocument.surface],
  );

  // Keep the native scroll position aligned with the logical viewport. This
  // is important after “Ajustar à tela”: changing the SVG viewBox alone does
  // not move a previously scrolled container back to the centered content.
  useLayoutEffect(() => {
    const wrapper = surfaceWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const targetLeft = (surfaceViewCenter.x - canvasBounds.left) * surfaceZoom - wrapper.clientWidth / 2;
    const targetTop = (surfaceViewCenter.y - canvasBounds.top) * surfaceZoom - wrapper.clientHeight / 2;
    wrapper.scrollLeft = Math.max(0, Math.min(targetLeft, wrapper.scrollWidth - wrapper.clientWidth));
    wrapper.scrollTop = Math.max(0, Math.min(targetTop, wrapper.scrollHeight - wrapper.clientHeight));
  }, [canvasBounds, surfaceViewCenter, surfaceZoom]);

  const handleSurfaceScroll = useCallback(() => {
    const wrapper = surfaceWrapperRef.current;
    if (!wrapper) {
      return;
    }
    const nextCenter = {
      x: canvasBounds.left + (wrapper.scrollLeft + wrapper.clientWidth / 2) / surfaceZoom,
      y: canvasBounds.top + (wrapper.scrollTop + wrapper.clientHeight / 2) / surfaceZoom,
    };
    setSurfaceViewCenter((current) => (
      Math.abs(current.x - nextCenter.x) < 0.5 && Math.abs(current.y - nextCenter.y) < 0.5
        ? current
        : nextCenter
    ));
  }, [canvasBounds, surfaceZoom]);

  useEffect(() => {
    if (optionsTrendId && state.selectedElementId !== optionsTrendId) {
      setOptionsTrendId(null);
    }
  }, [optionsTrendId, state.selectedElementId]);

  useEffect(() => {
    if (optionsElementId && state.selectedElementId !== optionsElementId) {
      setOptionsElementId(null);
    }
  }, [optionsElementId, state.selectedElementId]);

  useEffect(() => {
    const expectedDocuments = expectedDocumentsRef.current;
    if (expectedDocuments.length > 0) {
      const acknowledgedIndex = expectedDocuments.findIndex((expected) => areDisplayDocumentsEqual(expected, displayDocument));
      if (acknowledgedIndex >= 0) {
        expectedDocuments.splice(0, acknowledgedIndex + 1);
        documentRef.current = expectedDocuments.at(-1) ?? displayDocument;
        return;
      }
      // Some hosts normalize/clone imported PI Vision documents before
      // returning them through onChange. Consume one pending publication,
      // but preserve newer local publications and the complete edit stack.
      expectedDocuments.shift();
      const latestPendingDocument = expectedDocuments.at(-1);
      documentRef.current = latestPendingDocument ?? displayDocument;
      if (!latestPendingDocument) {
        historyRef.current = {
          ...historyRef.current,
          present: displayDocument,
        };
        refreshHistory((version) => version + 1);
      }
      return;
    }
    documentRef.current = displayDocument;
    if (!areDisplayDocumentsEqual(historyRef.current.present, displayDocument)) {
      historyRef.current = createDisplayHistory(displayDocument);
      refreshHistory((version) => version + 1);
    }
  }, [displayDocument]);
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    onSelectionChange?.(state.selectedElementIds);
  }, [state.selectedElementIds, onSelectionChange]);

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
    expectedDocumentsRef.current.push(nextDocument);
    onChangeRef.current?.(nextDocument);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const currentDoc = documentRef.current;
      if (
        currentDoc.surface.zoom !== surfaceZoom ||
        currentDoc.surface.viewCenterX !== surfaceViewCenter.x ||
        currentDoc.surface.viewCenterY !== surfaceViewCenter.y
      ) {
        publishDocument({
          ...currentDoc,
          surface: {
            ...currentDoc.surface,
            zoom: surfaceZoom,
            viewCenterX: surfaceViewCenter.x,
            viewCenterY: surfaceViewCenter.y,
          },
        });
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [surfaceZoom, surfaceViewCenter, publishDocument]);

  const reconcileSelection = useCallback((nextDocument: DisplayDocument) => {
    const selectedId = stateRef.current.selectedElementId;
    if (selectedId && !getElementById(nextDocument, selectedId)) {
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

  useEffect(() => {
    if (!editingDisplayName) {
      setDisplayNameDraft(displayDocument.name);
    }
  }, [displayDocument.name, editingDisplayName]);

  const commitDisplayName = useCallback(() => {
    const nextName = displayNameDraft.trim();
    if (nextName) {
      commitDocument({ ...documentRef.current, name: nextName });
    } else {
      setDisplayNameDraft(documentRef.current.name);
    }
    setEditingDisplayName(false);
  }, [commitDocument, displayNameDraft]);

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
      batchEditElementIdsRef.current = [];
      dispatch({ type: 'SELECT', elementId });
      setPropertiesPanelOpen(Boolean(elementId));
      setOptionsElementId(null);
      setOptionsTrendId(null);
      const element = elementId ? getElementById(documentRef.current, elementId) : undefined;
      const calculationId = element && typeof (element.properties as { calculationId?: unknown }).calculationId === 'string'
        ? (element.properties as { calculationId: string }).calculationId
        : element?.type === 'calculation' && typeof (element.properties as { calculationId?: unknown }).calculationId === 'string'
          ? (element.properties as { calculationId: string }).calculationId
          : undefined;
      if (calculationId) onCalculationOpen?.(calculationId);
    },
    [dispatch, onCalculationOpen],
  );
  const handleSelectMany = useCallback((elementIds: string[], additive = false) => {
    batchEditElementIdsRef.current = [];
    dispatch({ type: 'SELECT_MANY', elementIds, additive });
    setPropertiesPanelOpen(elementIds.length === 1);
    setOptionsElementId(null);
    setOptionsTrendId(null);
  }, [dispatch]);

  const handleDoubleClick = useCallback((elementId: string) => {
    batchEditElementIdsRef.current = [];
    dispatch({ type: 'SELECT', elementId });
    setPropertiesPanelOpen(true);
    setOptionsElementId(null);
    setOptionsTrendId(null);
  }, [dispatch]);

  const handleStartDrag = useCallback(
    (elementId: string, pointer: Point, selectedIds: string[] = [elementId]) => {
      const el = getElementById(documentRef.current, elementId);
      if (!el || isElementLocked(el)) {
        return;
      }
      const unlockedSelectedIds = selectedIds.filter((id) => {
        const candidate = getElementById(documentRef.current, id);
        return candidate && !isElementLocked(candidate);
      });
      pendingTransactionRef.current = { before: documentRef.current };
      setAlignmentGuides([]);
      dispatch({
        type: 'START_DRAG',
        elementId,
        pointer,
        originalGeometry: { x: el.x, y: el.y, width: el.width, height: el.height },
        originalGeometries: Object.fromEntries(
          unlockedSelectedIds.map((id) => {
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
      if (!el || isElementLocked(el)) {
        return;
      }
      pendingTransactionRef.current = { before: documentRef.current };
      dispatch({
        type: 'START_RESIZE',
        elementId,
        handle,
        pointer,
        originalGeometry: { x: el.x, y: el.y, width: el.width, height: el.height },
        originalProperties: el.properties,
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
      const rawDx = newGeometry.x - interaction.originalGeometry.x;
      const rawDy = newGeometry.y - interaction.originalGeometry.y;
      const movingIds = new Set(Object.keys(interaction.originalGeometries));
      const targets = documentRef.current.elements
        .filter((element) => !movingIds.has(element.id))
        .map(({ x, y, width, height }) => ({ x, y, width, height }));
      const snap = computeAlignmentSnap(
        Object.values(interaction.originalGeometries),
        targets,
        rawDx,
        rawDy,
        6 / Math.max(surfaceZoom, 0.1),
      );
      const { dx, dy } = snap;
      setAlignmentGuides(snap.guides);
      let nextDocument = documentRef.current;
      Object.entries(interaction.originalGeometries).forEach(([id, geometry]) => {
        nextDocument = updateElementGeometry(nextDocument, id, { x: geometry.x + dx, y: geometry.y + dy });
      });
      publishDocument(nextDocument);
    } else {
      setAlignmentGuides([]);
      const targetEl = getElementById(documentRef.current, interaction.elementId);
      if (targetEl && targetEl.type === TEXT_TYPE) {
        const originalFontSize = typeof interaction.originalProperties?.fontSize === 'number'
          ? interaction.originalProperties.fontSize
          : (typeof (targetEl.properties as { fontSize?: number }).fontSize === 'number' ? (targetEl.properties as { fontSize: number }).fontSize : 24);
        const widthRatio = newGeometry.width / Math.max(1, interaction.originalGeometry.width);
        const heightRatio = newGeometry.height / Math.max(1, interaction.originalGeometry.height);
        let scale = 1;
        if (interaction.handle === 'ml' || interaction.handle === 'mr') {
          scale = widthRatio;
        } else if (interaction.handle === 'tc' || interaction.handle === 'bc') {
          scale = heightRatio;
        } else {
          scale = Math.min(widthRatio, heightRatio);
        }
        const nextFontSize = Math.max(6, Math.min(240, Math.round(originalFontSize * scale)));
        let updatedDoc = updateElementGeometry(documentRef.current, interaction.elementId, newGeometry);
        updatedDoc = updateTextProperties(updatedDoc, interaction.elementId, { fontSize: nextFontSize });
        publishDocument(updatedDoc);
      } else if (targetEl && targetEl.type === GROUP_TYPE) {
        const resizedGroup = resizeGroup(
          targetEl as GroupElement,
          newGeometry,
          interaction.originalGeometry,
          interaction.originalProperties as GroupProperties | undefined,
        );
        let updatedDoc = updateElementGeometry(documentRef.current, interaction.elementId, newGeometry);
        updatedDoc = updateGroupProperties(updatedDoc, interaction.elementId, resizedGroup.properties);
        publishDocument(updatedDoc);
      } else {
        publishDocument(updateElementGeometry(documentRef.current, interaction.elementId, newGeometry));
      }
    }
  }, [publishDocument, surfaceZoom]);

  const handlePointerEnd = useCallback(() => {
    if (pendingTransactionRef.current) {
      pendingTransactionRef.current = null;
      commitDocument(documentRef.current);
    }
    setAlignmentGuides([]);
    dispatch({ type: 'END_INTERACTION' });
  }, [commitDocument, dispatch]);

  const handleInsertRectangle = useCallback((shape: GeometricShape = 'rectangle') => {
    const currentDocument = documentRef.current;
    const element = createRectangle({
      surface: currentDocument.surface,
      existingIds: currentDocument.elements.map(({ id }) => id),
      properties: { shape },
    });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendDisplayElement(currentDocument, element));
    dispatch({ type: 'SELECT', elementId: element.id });
    setPropertiesPanelOpen(true);
    setOptionsElementId(null);
    setOptionsTrendId(null);
    setShapeMenuOpen(false);
  }, [commitDocument, dispatch]);

  const handleInsertText = useCallback(() => {
    const currentDocument = documentRef.current;
    const element = createText({
      surface: currentDocument.surface,
      existingIds: currentDocument.elements.map(({ id }) => id),
    });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendText(currentDocument, element));
    dispatch({ type: 'SELECT', elementId: element.id });
    setPropertiesPanelOpen(true);
    setOptionsElementId(element.id);
    setOptionsTrendId(null);
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

  const handlePiPointDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (mode !== 'edit' || !onChangeRef.current) {
      return;
    }
    // During dragover browsers expose the MIME types but protect the payload;
    // read the symbol data only in drop, where getData is available.
    if (Array.from(event.dataTransfer.types).includes(LIBRARY_SYMBOL_DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      return;
    }
    if (Array.from(event.dataTransfer.types).includes(CALCULATION_DRAG_MIME)) {
      event.preventDefault();
      const svg = event.currentTarget.querySelector<SVGSVGElement>('svg[data-testid="display-surface"]');
      const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
      const targetTrend = dropSymbolType === 'trend'
        ? resolveTrendDropTarget(documentRef.current, event.target, event.clientX, event.clientY, point)
        : undefined;
      const targetLibrarySymbol = resolveLibrarySymbolDropTarget(documentRef.current, event.target, point);
      const targetShape = resolveGeometricDropTarget(documentRef.current, event.target, point);
      const preview = svg
        ? createCalculationDragPreview(
          svg,
          event.currentTarget,
          event.clientX,
          event.clientY,
          documentRef.current,
          dropSymbolType,
          targetTrend,
          targetLibrarySymbol,
          targetShape,
        )
        : undefined;
      event.dataTransfer.dropEffect = preview?.valid ? 'copy' : 'none';
      setPiPointDragPreview(preview ?? createInvalidDragPreview(
        event.currentTarget,
        event.clientX,
        event.clientY,
        'Cálculo',
        dropSymbolType,
      ));
      return;
    }
    if (!Array.from(event.dataTransfer.types).includes(PI_POINT_DRAG_MIME)) {
      return;
    }
    event.preventDefault();
    const pointResult = parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)) ?? selectedPiPoint;
    const svg = event.currentTarget.querySelector<SVGSVGElement>('svg[data-testid="display-surface"]');
    const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
    // Trend keeps its explicit insertion mode. Bar Chart and Table, however,
    // always accept a dropped PI Point as another item.
    const targetTrend = dropSymbolType === 'trend'
      ? resolveTrendDropTarget(
        documentRef.current,
        event.target,
        event.clientX,
        event.clientY,
        point,
      )
      : undefined;
    const targetBarChart = resolveBarChartDropTarget(
      documentRef.current,
      event.target,
      event.clientX,
      event.clientY,
      point,
    );
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
        targetBarChart,
        true,
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
    if (nextPreview.targetBarChartId && stateRef.current.selectedElementId !== nextPreview.targetBarChartId) {
      dispatch({ type: 'SELECT', elementId: nextPreview.targetBarChartId });
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
    const calculationId = parseCalculationDragData(event.dataTransfer.getData(CALCULATION_DRAG_MIME));
    if (calculationId) {
      const currentDocument = documentRef.current;
      const calculation = currentDocument.calculations?.find((item) => item.id === calculationId);
      const svg = event.currentTarget.querySelector<SVGSVGElement>('svg[data-testid="display-surface"]');
      const point = svg ? getDropPoint(svg, event.clientX, event.clientY, currentDocument) : undefined;
      if (!calculation || !point) {
        return;
      }
      event.preventDefault();
      const options = {
        calculationId,
        surface: currentDocument.surface,
        existingIds: currentDocument.elements.map((item) => item.id),
      };
      if (dropSymbolType === 'table') {
        return;
      }
      const targetText = resolveTextDropTarget(currentDocument, event.target, point);
      if (targetText) {
        commitDocument(updateTextProperties(currentDocument, targetText.id, { calculationId, binding: undefined }));
        dispatch({ type: 'SELECT', elementId: targetText.id });
        setPropertiesPanelOpen(true);
        setOptionsElementId(null);
        return;
      }
      const targetLibrarySymbol = resolveLibrarySymbolDropTarget(currentDocument, event.target, point);
      if (targetLibrarySymbol) {
        const multistate = targetLibrarySymbol.properties.multistate
          ? { ...targetLibrarySymbol.properties.multistate, enabled: true }
          : { enabled: true, rules: [] };
        commitDocument(updateLibrarySymbolProperties(currentDocument, targetLibrarySymbol.id, { calculationId, binding: undefined, multistate }));
        dispatch({ type: 'SELECT', elementId: targetLibrarySymbol.id });
        setPropertiesPanelOpen(true);
        setOptionsElementId(null);
        return;
      }
      const targetShape = resolveGeometricDropTarget(currentDocument, event.target, point);
      if (targetShape) {
        const multistate = targetShape.properties.multistate
          ? { ...targetShape.properties.multistate, enabled: true }
          : { enabled: true, rules: [] };
        commitDocument(updateRectangleProperties(currentDocument, targetShape.id, { calculationId, binding: undefined, multistate }));
        dispatch({ type: 'SELECT', elementId: targetShape.id });
        setPropertiesPanelOpen(true);
        setOptionsElementId(null);
        return;
      }
      const targetTrend = dropSymbolType === 'trend'
        ? resolveTrendDropTarget(currentDocument, event.target, event.clientX, event.clientY, point)
        : undefined;
      if (targetTrend) {
        commitDocument(addCalculationTrendSeries(currentDocument, targetTrend.id, calculationId, calculation.name));
        dispatch({ type: 'SELECT', elementId: targetTrend.id });
        return;
      }
      const element = dropSymbolType === 'value' ? createValue(options)
        : dropSymbolType === 'trend' ? createTrend({ ...options, calculationName: calculation.name })
          : dropSymbolType === 'gauge' ? createGauge(options)
            : createBar(options);
      const positioned = positionElementAt(element, point, currentDocument);
      const nextDocument = dropSymbolType === 'value' ? appendValue(currentDocument, positioned as ValueElement)
        : dropSymbolType === 'trend' ? appendTrend(currentDocument, positioned as TrendElement)
          : dropSymbolType === 'gauge' ? appendGauge(currentDocument, positioned as GaugeElement)
            : appendBar(currentDocument, positioned as BarElement);
      commitDocument(nextDocument);
      dispatch({ type: 'SELECT', elementId: positioned.id });
      setPropertiesPanelOpen(true);
      return;
    }
    const librarySymbolId = parseLibrarySymbolDragData(event.dataTransfer.getData(LIBRARY_SYMBOL_DRAG_MIME));
    if (librarySymbolId) {
      const svg = event.currentTarget.querySelector<SVGSVGElement>('svg[data-testid="display-surface"]');
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
        binding: selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined,
      });
      const positioned = positionElementAt(symbol, point, currentDocument);
      const nextDocument = appendLibrarySymbol(currentDocument, positioned);
      const viewCenter = {
        x: positioned.x + positioned.width / 2,
        y: positioned.y + positioned.height / 2,
      };
      const isFirstElement = currentDocument.elements.length === 0;
      const wrapper = surfaceWrapperRef.current;
      const availableWidth = Math.max(1, (wrapper?.clientWidth ?? currentDocument.surface.width) - 32);
      const availableHeight = Math.max(1, (wrapper?.clientHeight ?? currentDocument.surface.height) - 32);
      const zoom = isFirstElement
        ? Number(Math.max(
          DISPLAY_ZOOM_MIN,
          Math.min(1, availableWidth / currentDocument.surface.width, availableHeight / currentDocument.surface.height),
        ).toFixed(2))
        : surfaceZoom;
      const targetViewCenter = isFirstElement
        ? { x: currentDocument.surface.width / 2, y: currentDocument.surface.height / 2 }
        : viewCenter;
      commitDocument(nextDocument);
      setSurfaceZoom(zoom);
      setSurfaceViewCenter(targetViewCenter);
      const focusInsertedSymbol = () => {
        const wrapper = surfaceWrapperRef.current;
        if (!wrapper) {
          return;
        }
        const bounds = getCanvasBounds(nextDocument.surface, nextDocument.elements);
        wrapper.scrollLeft = Math.max(0, Math.min(
          (targetViewCenter.x - bounds.left) * zoom - wrapper.clientWidth / 2,
          wrapper.scrollWidth - wrapper.clientWidth,
        ));
        wrapper.scrollTop = Math.max(0, Math.min(
          (targetViewCenter.y - bounds.top) * zoom - wrapper.clientHeight / 2,
          wrapper.scrollHeight - wrapper.clientHeight,
        ));
      };
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(focusInsertedSymbol);
      } else {
        focusInsertedSymbol();
      }
      dispatch({ type: 'SELECT', elementId: positioned.id });
      setPropertiesPanelOpen(true);
      return;
    }
    const pointResult = parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)) ?? selectedPiPoint;
    const binding = pointResult ? createPiPointBinding(pointResult) : undefined;
    const svg = event.currentTarget.querySelector<SVGSVGElement>('svg[data-testid="display-surface"]');
    const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
    const currentDocument = documentRef.current;
    // A Table and Bar Chart always receive a dropped PI Point as a new item,
    // independently of the selected toolbar tool. Trend keeps its dedicated
    // insertion mode to avoid changing the existing drop behavior.
    const targetTrend = dropSymbolType === 'trend'
      ? resolveTrendDropTarget(
        currentDocument,
        event.target,
        event.clientX,
        event.clientY,
        point,
      )
      : undefined;
    const targetBarChart = resolveBarChartDropTarget(
      currentDocument,
      event.target,
      event.clientX,
      event.clientY,
      point,
    );
    const targetLibrarySymbol = resolveLibrarySymbolDropTarget(currentDocument, event.target, point);
    const targetTable = resolveTableDropTarget(currentDocument, event.target, point);
    const targetXYPlot = resolveXYPlotDropTarget(currentDocument, event.target, point);
    const targetShape = resolveGeometricDropTarget(currentDocument, event.target, point);
    const targetText = resolveTextDropTarget(currentDocument, event.target, point);
    if (!binding || (!point && !targetTrend && !targetBarChart && !targetShape && !targetLibrarySymbol && !targetTable && !targetXYPlot && !targetText)) {
      return;
    }
    event.preventDefault();

    if (targetText) {
      commitDocument(updateTextProperties(currentDocument, targetText.id, { binding }));
      dispatch({ type: 'SELECT', elementId: targetText.id });
      setPropertiesPanelOpen(true);
      setOptionsElementId(null);
      return;
    }

    if (targetLibrarySymbol) {
      const multistate = targetLibrarySymbol.properties.multistate
        ? { ...targetLibrarySymbol.properties.multistate, enabled: true }
        : { enabled: true, rules: [] };
      commitDocument(updateLibrarySymbolProperties(currentDocument, targetLibrarySymbol.id, { binding, multistate }));
      dispatch({ type: 'SELECT', elementId: targetLibrarySymbol.id });
      setPropertiesPanelOpen(true);
      setOptionsElementId(null);
      return;
    }

    if (targetTrend) {
      commitDocument(addTrendSeries(currentDocument, targetTrend.id, binding));
      dispatch({ type: 'SELECT', elementId: targetTrend.id });
      return;
    }
    if (targetBarChart) {
      const item: BarChartItem = {
        binding,
        ...(pointResult?.description ? { description: pointResult.description } : {}),
        ...(pointResult?.engineeringUnit ? { engineeringUnit: pointResult.engineeringUnit } : {}),
      };
      commitDocument(addBarChartItem(currentDocument, targetBarChart.id, item));
      dispatch({ type: 'SELECT', elementId: targetBarChart.id });
      return;
    }
    if (targetTable) {
      const item: TableDataItem = { binding, ...(pointResult?.path ? { path: pointResult.path } : {}), ...(pointResult?.description ? { description: pointResult.description } : {}), ...(pointResult?.engineeringUnit ? { engineeringUnit: pointResult.engineeringUnit } : {}), ...(pointResult?.pointType ? { pointType: pointResult.pointType } : {}) };
      commitDocument(addTableItem(currentDocument, targetTable.id, item));
      dispatch({ type: 'SELECT', elementId: targetTable.id });
      return;
    }
    if (targetXYPlot) {
      commitDocument(addXYPlotYSeries(currentDocument, targetXYPlot.id, binding));
      dispatch({ type: 'SELECT', elementId: targetXYPlot.id });
      setPropertiesPanelOpen(true);
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
      case 'bar-chart': {
        const barChartItem: BarChartItem = {
          binding,
          ...(pointResult?.description ? { description: pointResult.description } : {}),
          ...(pointResult?.engineeringUnit ? { engineeringUnit: pointResult.engineeringUnit } : {}),
        };
        const element = positionElementAt(
          createBarChart({
            item: barChartItem,
            surface: currentDocument.surface,
            existingIds: currentDocument.elements.map((candidate) => candidate.id),
          }),
          point!,
          currentDocument,
        );
        commitDocument(appendBarChart(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
      case 'value': {
        const element = positionElementAt(createValue(createOptions), point!, currentDocument);
        commitDocument(appendValue(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
      case 'table': {
        const item: TableDataItem = { binding, ...(pointResult?.path ? { path: pointResult.path } : {}), ...(pointResult?.description ? { description: pointResult.description } : {}), ...(pointResult?.engineeringUnit ? { engineeringUnit: pointResult.engineeringUnit } : {}), ...(pointResult?.pointType ? { pointType: pointResult.pointType } : {}) };
        const element = positionElementAt(createTable({ item, surface: currentDocument.surface, existingIds: currentDocument.elements.map((candidate) => candidate.id) }), point!, currentDocument);
        commitDocument(appendTable(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
      case 'xy-plot': {
        const element = positionElementAt(createXYPlot({ xBinding: binding, surface: currentDocument.surface, existingIds: currentDocument.elements.map((candidate) => candidate.id) }), point!, currentDocument);
        commitDocument(appendXYPlot(currentDocument, element));
        dispatch({ type: 'SELECT', elementId: element.id });
        break;
      }
    }
  }, [commitDocument, dispatch, dropSymbolType, mode, selectedPiPoint, surfaceZoom]);

  const handleModeChange = useCallback(
    (nextMode: DisplayEditorMode) => {
      setMode(nextMode);
      onModeChange?.(nextMode);
      if (nextMode === 'view') {
        dispatch({ type: 'CLEAR_SELECTION' });
        setOptionsTrendId(null);
        setOptionsElementId(null);
      }
      if (nextMode === 'edit') setTrendPointInfo(null);
    },
    [dispatch, onModeChange],
  );

  const handleTrendLegendInfo = useCallback((series: TrendSeries, value: string | number | undefined) => {
    const binding = series.binding;
    setTrendPointInfo({ pointName: binding.pointName, value, loading: true });
    void getPiPointMetadata(binding).then(
      (metadata) => setTrendPointInfo((current) => current && current.pointName === binding.pointName ? { ...current, metadata, loading: false } : current),
      () => setTrendPointInfo((current) => current && current.pointName === binding.pointName ? { ...current, loading: false, error: 'Não foi possível carregar todos os atributos da PI Point.' } : current),
    );
  }, []);

  const handleExport = useCallback(async (exportFormat: DisplayExportFileFormat) => {
    if (exporting) return;
    if (exportFormat !== 'json') {
      const bindings = collectDisplayDataBindings(documentRef.current);
      if (bindings.length === 0) { setImportError('Nenhuma fonte de dados PI encontrada no Display.'); setExportMenuOpen(false); return; }
      if (!trendTimeRange || !loadRecordedData || (exportFormat === 'xml' && !loadInterpolatedData)) { setImportError('Consulta histórica PI indisponível.'); setExportMenuOpen(false); return; }
      setExporting(true);
      setImportError(null);
      try {
        const recorded = await loadRecordedData(bindings, trendTimeRange, { maxDataPoints: DISPLAY_DATA_EXPORT_MAX_POINTS });
        let content: string;
        if (exportFormat === 'csv') {
          content = serializePiDataCsv(bindings, recorded);
        } else {
          const interpolated = await loadInterpolatedData!(bindings, trendTimeRange, { maxDataPoints: DISPLAY_DATA_EXPORT_MAX_POINTS });
          content = serializePiDataXml(bindings, interpolated, recorded);
        }
        downloadExport(content, exportFormat, documentRef.current.name);
      } catch { setImportError('Não foi possível exportar os dados PI do Display.'); }
      finally { setExporting(false); setExportMenuOpen(false); }
      return;
    }
    const serializers: Record<DisplayExportFileFormat, () => string> = {
      json: () => serializeDisplay(documentRef.current),
      csv: () => serializeDisplayCsv(documentRef.current),
      xml: () => serializeDisplayXml(documentRef.current),
    };
    const mimeTypes: Record<DisplayExportFileFormat, string> = {
      json: 'application/json;charset=utf-8',
      csv: 'text/csv;charset=utf-8',
      xml: 'application/xml;charset=utf-8',
    };
    downloadExport(serializers[exportFormat](), exportFormat, documentRef.current.name, mimeTypes[exportFormat]);
    setExportMenuOpen(false);
  }, [exporting, loadInterpolatedData, loadRecordedData, trendTimeRange]);

  const handleTableExport = useCallback(async (table: TableElement, exportFormat: TableDataExportFormat) => {
    if (exporting) {
      return;
    }
    if (!trendTimeRange || !loadRecordedData) {
      setImportError('Consulta histórica PI indisponível para exportar a Tabela.');
      return;
    }
    const bindings = table.properties.items.map((item) => item.binding);
    if (bindings.length === 0) {
      setImportError('A Tabela não possui PI Points para exportar.');
      return;
    }
    setExporting(true);
    setImportError(null);
    try {
      const recorded = await loadRecordedData(bindings, trendTimeRange, { maxDataPoints: DISPLAY_DATA_EXPORT_MAX_POINTS });
      const content = serializeTableData(table.properties, recorded, exportFormat);
      downloadExport(content, exportFormat, `${documentRef.current.name}-tabela`);
    } catch {
      setImportError('Não foi possível exportar os dados históricos da Tabela.');
    } finally {
      setExporting(false);
    }
  }, [exporting, loadRecordedData, trendTimeRange]);

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

  const handlePiVisionImport = useCallback((imported: DisplayDocument) => {
    if (!onChangeRef.current) {
      return;
    }
    historyRef.current = createDisplayHistory(imported);
    refreshHistory((version) => version + 1);
    pendingTransactionRef.current = null;
    dispatch({ type: 'CLEAR_SELECTION' });
    setImportError(null);
    setPiVisionImportOpen(false);
    publishDocument(imported);
  }, [dispatch, publishDocument]);

  const propertiesOpen = mode === 'edit' && propertiesPanelOpen && Boolean(state.selectedElementId);
  const selectedElement = propertiesOpen && state.selectedElementId
    ? getElementById(displayDocument, state.selectedElementId)
    : undefined;

  const selectedValue = selectedElement && selectedElement.type === VALUE_TYPE && isPiPointBinding(selectedElement.properties.binding)
    ? selectedElement as ValueElement
    : undefined;

  const handleSurfaceChange = useCallback((patch: Partial<DisplayDocument['surface']>) => {
    commitDocument({
      ...documentRef.current,
      surface: {
        ...documentRef.current.surface,
        ...patch,
      },
    });
  }, [commitDocument]);

  // A property panel represents the active element, but a right-click on a
  // homogeneous multi-selection must apply compatible edits to every selected
  // element. Mixed selections intentionally keep the single-element behavior.
  const applyToCompatibleSelection = useCallback((update: (document: DisplayDocument, elementId: string) => DisplayDocument) => {
    const activeId = stateRef.current.selectedElementId;
    if (!activeId) {
      return;
    }
    const activeElement = getElementById(documentRef.current, activeId);
    const capturedIds = batchEditElementIdsRef.current;
    const selectedIds = [...new Set(capturedIds.length > 1 ? capturedIds : stateRef.current.selectedElementIds)];
    const selectedElements = selectedIds
      .map((id) => getElementById(documentRef.current, id))
      .filter((element): element is DisplayElement => element !== undefined);
    const canApplyToAll = selectedIds.length > 1
      && selectedElements.length === selectedIds.length
      && activeElement !== undefined
      && selectedElements.every((element) => element.type === activeElement.type);
    const targetIds = canApplyToAll ? selectedIds : [activeId];
    const nextDocument = targetIds.reduce((document, elementId) => update(document, elementId), documentRef.current);
    commitDocument(nextDocument);
  }, [commitDocument]);

  const handleValueVisualChange = useCallback((patch: Partial<ValueVisualOptions>) => {
    if (!onChangeRef.current) {
      return;
    }
    applyToCompatibleSelection((document, elementId) => updateValueVisualOptions(document, elementId, patch));
  }, [applyToCompatibleSelection]);

  const handleMultistateChange = useCallback((config: MultistateConfig) => {
    applyToCompatibleSelection((document, elementId) => updateMultistateConfig(document, elementId, config));
  }, [applyToCompatibleSelection]);

  const handleBackgroundMultistateChange = useCallback((config: MultistateConfig) => {
    applyToCompatibleSelection((document, elementId) => updateBackgroundMultistateConfig(document, elementId, config));
  }, [applyToCompatibleSelection]);

  const selectedGauge = selectedElement && selectedElement.type === GAUGE_TYPE
    ? selectedElement as GaugeElement
    : undefined;
  const selectedBar = selectedElement && selectedElement.type === BAR_TYPE
    ? selectedElement as BarElement
    : undefined;
  const selectedBarChart = selectedElement && selectedElement.type === BAR_CHART_TYPE
    ? selectedElement as BarChartElement
    : undefined;
    const selectedTable = selectedElement && selectedElement.type === TABLE_TYPE
    ? selectedElement as TableElement
    : undefined;
  const selectedXYPlot = selectedElement && selectedElement.type === XY_PLOT_TYPE ? selectedElement as XYPlotElement : undefined;
  const selectedSqlTable = selectedElement && selectedElement.type === SQL_TABLE_TYPE
    ? selectedElement as SqlTableElement
    : undefined;
  const selectedProgramming = selectedElement && selectedElement.type === PROGRAMMING_TYPE
    ? selectedElement as ProgrammingElement
    : undefined;
  const selectedRectangle = selectedElement && selectedElement.type === RECTANGLE_TYPE
    ? selectedElement as RectangleElement
    : undefined;

  const handleBarChartChange = useCallback((patch: Partial<BarChartProperties>) => {
    applyToCompatibleSelection((document, elementId) => updateBarChartProperties(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleXYPlotChange = useCallback((patch: Partial<XYPlotElement['properties']>) => {
    applyToCompatibleSelection((document, elementId) => updateXYPlotProperties(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleXYPlotRemoveY = useCallback((index: number) => { if (selectedXYPlot) commitDocument(removeXYPlotYSeries(displayDocument, selectedXYPlot.id, index)); }, [commitDocument, displayDocument, selectedXYPlot]);
  const handleXYPlotMoveY = useCallback((index: number, offset: -1 | 1) => { if (selectedXYPlot) commitDocument(moveXYPlotYSeries(displayDocument, selectedXYPlot.id, index, offset)); }, [commitDocument, displayDocument, selectedXYPlot]);

  const handleBarChartVisualChange = useCallback((patch: Partial<BarChartVisualOptions>) => {
    applyToCompatibleSelection((document, elementId) => updateBarChartVisualOptions(document, elementId, patch));
  }, [applyToCompatibleSelection]);

  const handleTableChange = useCallback((patch: Partial<TableElement['properties']>) => {
    applyToCompatibleSelection((document, elementId) => updateElementInDocument(document, elementId, (e) => ({
      ...e,
      properties: { ...e.properties, ...patch },
    })));
  }, [applyToCompatibleSelection]);

  const handleSqlTableChange = useCallback((patch: Partial<SqlTableElement['properties']>) => {
    applyToCompatibleSelection((document, elementId) => updateElementInDocument(document, elementId, (e) => ({
      ...e,
      properties: { ...e.properties, ...patch },
    })));
  }, [applyToCompatibleSelection]);
  
  const handleTableColumnsChange = useCallback((elementId: string, columns: TableColumnConfig[]) => {
    commitDocument(updateTableProperties(documentRef.current, elementId, { columns }));
  }, [commitDocument]);
  const selectedText = selectedElement && selectedElement.type === TEXT_TYPE
    ? selectedElement as TextElement
    : undefined;
  const selectedImage = selectedElement && selectedElement.type === IMAGE_TYPE
    ? selectedElement as ImageElement
    : undefined;
  const selectedLibrarySymbol = selectedElement && selectedElement.type === 'library-symbol'
    ? selectedElement as LibrarySymbolElement
    : undefined;
  const selectedTrend = mode === 'edit' && state.selectedElementId
    ? (selectedElement && selectedElement.type === TREND_TYPE ? selectedElement as TrendElement : undefined)
    : undefined;
  const handleGaugeChange = useCallback((patch: Parameters<typeof updateGaugeOptions>[2]) => {
    applyToCompatibleSelection((document, elementId) => updateGaugeOptions(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleBarChange = useCallback((patch: Parameters<typeof updateBarOptions>[2]) => {
    applyToCompatibleSelection((document, elementId) => updateBarOptions(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleRectangleChange = useCallback((patch: Parameters<typeof updateRectangleProperties>[2]) => {
    applyToCompatibleSelection((document, elementId) => updateRectangleProperties(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleTextChange = useCallback((patch: Parameters<typeof updateTextProperties>[2]) => {
    applyToCompatibleSelection((document, elementId) => updateTextProperties(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleImageChange = useCallback((patch: Parameters<typeof updateImageProperties>[2]) => {
    applyToCompatibleSelection((document, elementId) => updateImageProperties(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleLinkChange = useCallback((linkUrl: string) => {
    applyToCompatibleSelection((document, elementId) => updateElementInDocument(document, elementId, (element) => ({
      ...element,
      properties: { ...element.properties, linkUrl: linkUrl.trim() || undefined },
    })));
  }, [applyToCompatibleSelection]);
  const handleLinkOpenInNewTabChange = useCallback((openInNewTab: boolean) => {
    applyToCompatibleSelection((document, elementId) => updateElementInDocument(document, elementId, (element) => ({
      ...element,
      properties: { ...element.properties, openInNewTab },
    })));
  }, [applyToCompatibleSelection]);
  const handleLibrarySymbolChange = useCallback((patch: Partial<LibrarySymbolProperties>) => {
    applyToCompatibleSelection((document, elementId) => updateLibrarySymbolProperties(document, elementId, patch));
  }, [applyToCompatibleSelection]);
  const handleGroupSelected = useCallback(() => {
    const selectedIds = stateRef.current.selectedElementIds;
    if (selectedIds.length < 2) {
      return;
    }
    const result = groupElements(documentRef.current, selectedIds);
    if (result) {
      commitDocument(result.document);
      dispatch({ type: 'SELECT', elementId: result.group.id });
    }
    setContextMenu(null);
  }, [commitDocument, dispatch]);

  const handleUngroupSelected = useCallback(() => {
    const targetId = contextMenu?.elementId ?? stateRef.current.selectedElementId;
    if (!targetId) {
      return;
    }
    const result = ungroupElements(documentRef.current, targetId);
    if (result) {
      commitDocument(result.document);
      dispatch({ type: 'SELECT_MANY', elementIds: result.unpackedIds });
    }
    setContextMenu(null);
  }, [commitDocument, contextMenu?.elementId, dispatch]);

  const handleToggleLock = useCallback((elementIds: string | string[], locked: boolean) => {
    commitDocument(updateElementLocked(documentRef.current, elementIds, locked));
    setContextMenu(null);
  }, [commitDocument]);

  const applySymbolConversion = useCallback((elementId: string, targetType: SymbolConversionType, bindings: PiPointBinding[]) => {
    try {
      const next = updateElementInDocument(documentRef.current, elementId, (element) => convertDisplayElementType(element, targetType, bindings));
      commitDocument(next);
      dispatch({ type: 'SELECT', elementId });
      setPropertiesPanelOpen(true);
      setOptionsTrendId(targetType === TREND_TYPE ? elementId : null);
      setOptionsElementId(targetType === TREND_TYPE ? null : elementId);
    } finally {
      setContextMenu(null);
      setPendingSymbolConversion(null);
    }
  }, [commitDocument, dispatch]);

  const handleSymbolConversion = useCallback((elementId: string, targetType: SymbolConversionType) => {
    const source = getElementById(documentRef.current, elementId);
    if (!source) return;
    const bindings = getElementPiBindings(source);
    if (!bindings.length) return;
    const capability = symbolConversionTargets.find((target) => target.type === targetType)?.capability;
    if (capability === 'single' && bindings.length > 1) {
      setPendingSymbolConversion({ elementId, targetType, bindings, selectedIndex: 0 });
      setContextMenu(null);
      return;
    }
    applySymbolConversion(elementId, targetType, bindings);
  }, [applySymbolConversion]);

  const handleLibrarySymbolContextMenu = useCallback((element: LibrarySymbolElement, event?: React.MouseEvent) => {
    setPropertiesPanelOpen(true);
    const selectedIds = stateRef.current.selectedElementIds;
    if (selectedIds.length > 1 && selectedIds.includes(element.id)) {
      const selectedElements = selectedIds.map((id) => getElementById(documentRef.current, id)).filter(Boolean) as DisplayElement[];
      const isHomogeneousSelection = selectedElements.length === selectedIds.length
        && selectedElements.every((selected) => selected.type === element.type);
      batchEditElementIdsRef.current = isHomogeneousSelection ? [...selectedIds] : [];
      setPropertiesPanelOpen(isHomogeneousSelection);
      const allLocked = selectedElements.length > 0 && selectedElements.every((el) => isElementLocked(el));
      setContextMenu({
        x: event?.clientX ?? 100,
        y: event?.clientY ?? 100,
        elementId: element.id,
        elementIds: selectedIds,
        showGroup: true,
        showUngroup: false,
        isLocked: allLocked,
      });
      return;
    }
    batchEditElementIdsRef.current = [];
    dispatch({ type: 'SELECT', elementId: element.id });
    setContextMenu({
      x: event?.clientX ?? 100,
      y: event?.clientY ?? 100,
      elementId: element.id,
      elementIds: [element.id],
      showGroup: false,
      showUngroup: false,
      isLocked: isElementLocked(element),
    });
    setOptionsElementId(element.id);
  }, [dispatch]);

  const handleTrendContextMenu = useCallback((element: TrendElement, event?: React.MouseEvent) => {
    setPropertiesPanelOpen(true);
    const selectedIds = stateRef.current.selectedElementIds;
    if (selectedIds.length > 1 && selectedIds.includes(element.id)) {
      const selectedElements = selectedIds.map((id) => getElementById(documentRef.current, id)).filter(Boolean) as DisplayElement[];
      const isHomogeneousSelection = selectedElements.length === selectedIds.length
        && selectedElements.every((selected) => selected.type === element.type);
      batchEditElementIdsRef.current = isHomogeneousSelection ? [...selectedIds] : [];
      setPropertiesPanelOpen(isHomogeneousSelection);
      const allLocked = selectedElements.length > 0 && selectedElements.every((el) => isElementLocked(el));
      setContextMenu({
        x: event?.clientX ?? 100,
        y: event?.clientY ?? 100,
        elementId: element.id,
        elementIds: selectedIds,
        showGroup: true,
        showUngroup: false,
        isLocked: allLocked,
      });
      return;
    }
    batchEditElementIdsRef.current = [];
    dispatch({ type: 'SELECT', elementId: element.id });
    setContextMenu({
      x: event?.clientX ?? 100,
      y: event?.clientY ?? 100,
      elementId: element.id,
      elementIds: [element.id],
      showGroup: false,
      showUngroup: false,
      isLocked: isElementLocked(element),
    });
    setOptionsElementId(null);
    setOptionsTrendId(element.id);
  }, [dispatch]);

  const handleSurfaceContextMenu = useCallback((_event?: React.MouseEvent) => {
    dispatch({ type: 'SELECT', elementId: null });
    setPropertiesPanelOpen(true);
    setContextMenu(null);
  }, [dispatch]);

  const handleElementContextMenu = useCallback((element: DisplayElement, event?: React.MouseEvent) => {
    setPropertiesPanelOpen(true);
    const selectedIds = stateRef.current.selectedElementIds;
    if (selectedIds.length > 1 && selectedIds.includes(element.id)) {
      const selectedElements = selectedIds.map((id) => getElementById(documentRef.current, id)).filter(Boolean) as DisplayElement[];
      const isHomogeneousSelection = selectedElements.length === selectedIds.length
        && selectedElements.every((selected) => selected.type === element.type);
      batchEditElementIdsRef.current = isHomogeneousSelection ? [...selectedIds] : [];
      setPropertiesPanelOpen(isHomogeneousSelection);
      const allLocked = selectedElements.length > 0 && selectedElements.every((el) => isElementLocked(el));
      setContextMenu({
        x: event?.clientX ?? 100,
        y: event?.clientY ?? 100,
        elementId: element.id,
        elementIds: selectedIds,
        showGroup: true,
        showUngroup: false,
        isLocked: allLocked,
      });
      return;
    }
    batchEditElementIdsRef.current = [];
    if (element.type === GROUP_TYPE) {
      dispatch({ type: 'SELECT', elementId: element.id });
      setContextMenu({
        x: event?.clientX ?? 100,
        y: event?.clientY ?? 100,
        elementId: element.id,
        elementIds: [element.id],
        showGroup: false,
        showUngroup: true,
        isLocked: isElementLocked(element),
      });
      return;
    }
    dispatch({ type: 'SELECT', elementId: element.id });
    setContextMenu({
      x: event?.clientX ?? 100,
      y: event?.clientY ?? 100,
      elementId: element.id,
      elementIds: [element.id],
      showGroup: false,
      showUngroup: false,
      isLocked: isElementLocked(element),
      showProgrammingEdit: element.type === PROGRAMMING_TYPE,
    });
    setOptionsElementId(element.id);
    setOptionsTrendId(null);
  }, [dispatch]);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) {
      return [];
    }
    const items: ContextMenuItem[] = [];
    if (contextMenu.showGroup) {
      items.push({
        id: 'group',
        label: 'Agrupar Símbolos',
        testId: 'context-menu-group',
        onClick: handleGroupSelected,
      });
    }
    if (contextMenu.showUngroup) {
      items.push({
        id: 'ungroup',
        label: 'Desagrupar Símbolos',
        testId: 'context-menu-ungroup',
        onClick: handleUngroupSelected,
      });
    }
    const targets = contextMenu.elementIds && contextMenu.elementIds.length > 0
      ? contextMenu.elementIds
      : (contextMenu.elementId ? [contextMenu.elementId] : []);
    if (contextMenu.showProgrammingEdit && targets.length === 1 && onProgrammingEdit) {
      items.push({
        id: 'edit-programming',
        label: 'Editar Programming',
        testId: 'context-menu-edit-programming',
        onClick: () => {
          onProgrammingEdit(targets[0]);
          setContextMenu(null);
        },
      });
    }
    if (targets.length > 0) {
      const source = targets.length === 1 ? getElementById(documentRef.current, targets[0]) : undefined;
      const bindings = source ? getElementPiBindings(source) : [];
      if (source && bindings.length > 0) {
        items.push({
          id: 'change-symbol',
          label: 'Trocar símbolo para',
          testId: 'context-menu-change-symbol',
          onClick: () => undefined,
          submenu: symbolConversionTargets.filter((target) => target.type !== source.type).map((target) => ({
            id: `change-symbol-${target.type}`,
            label: target.label,
            onClick: () => handleSymbolConversion(source.id, target.type),
          })),
        });
      }
      const isLocked = Boolean(contextMenu.isLocked);
      items.push({
        id: isLocked ? 'unlock' : 'lock',
        label: isLocked ? (targets.length > 1 ? 'Desbloquear Seleção' : 'Desbloquear') : (targets.length > 1 ? 'Bloquear Seleção' : 'Bloquear'),
        testId: isLocked ? 'context-menu-unlock' : 'context-menu-lock',
        onClick: () => handleToggleLock(targets, !isLocked),
      });
    }
    return items;
  }, [contextMenu, handleGroupSelected, handleSymbolConversion, handleToggleLock, handleUngroupSelected, onProgrammingEdit]);
  const optionsTrend = optionsTrendId
    ? (getElementById(displayDocument, optionsTrendId) as TrendElement | undefined)
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
  const handleTrendLegendWidthChange = useCallback((elementId: string, legendWidth: number) => {
    commitDocument(updateTrendVisualOptions(documentRef.current, elementId, { legendWidth }));
  }, [commitDocument]);

  const handleDeleteSelectedElement = useCallback(() => {
    if (mode !== 'edit') {
      return;
    }
    const selectedIds = stateRef.current.selectedElementIds;
    if (selectedIds.length === 0) {
      return;
    }
    const currentDocument = documentRef.current;
    const idsToDelete = new Set(selectedIds.filter((id) => currentDocument.elements.some((element) => element.id === id)));
    if (idsToDelete.size === 0) {
      dispatch({ type: 'CLEAR_SELECTION' });
      return;
    }
    commitDocument({
      ...currentDocument,
      elements: currentDocument.elements.filter((element) => !idsToDelete.has(element.id)),
    });
  }, [commitDocument, dispatch, mode]);

  const handleCopySelectedElements = useCallback(() => {
    if (mode !== 'edit') {
      return;
    }
    const selectedIds = new Set(stateRef.current.selectedElementIds);
    const selectedElements = documentRef.current.elements.filter((element) => selectedIds.has(element.id));
    if (selectedElements.length === 0) {
      return;
    }
    copiedElementsRef.current = selectedElements.map((element) => JSON.parse(JSON.stringify(element)) as DisplayElement);
    pasteCountRef.current = 0;
  }, [mode]);

  const handlePasteElements = useCallback(() => {
    if (mode !== 'edit' || copiedElementsRef.current.length === 0) {
      return;
    }
    const currentDocument = documentRef.current;
    const existingIds = new Set(currentDocument.elements.map((element) => element.id));
    const offset = 16 * (pasteCountRef.current + 1);
    const pastedElements = copiedElementsRef.current.map((element) => {
      let id = generateId();
      while (existingIds.has(id)) {
        id = generateId();
      }
      existingIds.add(id);
      return {
        ...element,
        id,
        x: Math.max(0, Math.min(element.x + offset, Math.max(0, currentDocument.surface.width - element.width))),
        y: Math.max(0, Math.min(element.y + offset, Math.max(0, currentDocument.surface.height - element.height))),
        properties: JSON.parse(JSON.stringify(element.properties)),
      } as DisplayElement;
    });
    pasteCountRef.current += 1;
    if (commitDocument({ ...currentDocument, elements: [...currentDocument.elements, ...pastedElements] })) {
      dispatch({ type: 'SELECT_MANY', elementIds: pastedElements.map((element) => element.id) });
    }
  }, [commitDocument, dispatch, mode]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target)) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'c' && mode === 'edit') {
      event.preventDefault();
      handleCopySelectedElements();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'v' && mode === 'edit') {
      event.preventDefault();
      handlePasteElements();
      return;
    }
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
  }, [handleCopySelectedElements, handleDeleteSelectedElement, handlePasteElements, handleRedo, handleUndo, mode]);

  useEffect(() => {
    const handleGlobalHistoryShortcut = (event: KeyboardEvent) => {
      // An undo can replace the currently focused SVG element. Once that
      // element unmounts, the next shortcut originates from document.body and
      // no longer bubbles through the editor container. Handle that case at
      // window level while leaving text fields and already handled events
      // untouched.
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }
      // Events originating inside the editor are handled by the React
      // capture handler below. Avoid processing them twice (capture + bubble).
      if (event.target instanceof Node && editorContainerRef.current?.contains(event.target)) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) {
        return;
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };

    // Capture the event before canvas children (including imported PI Vision
    // symbols) can stop propagation. Those symbols may own the focused node
    // and otherwise prevent the editor's history shortcut from being seen.
    window.addEventListener('keydown', handleGlobalHistoryShortcut, true);
    return () => window.removeEventListener('keydown', handleGlobalHistoryShortcut, true);
  }, [handleRedo, handleUndo]);

  useEffect(() => {
    if (state.selectedElementId && !getElementById(displayDocument, state.selectedElementId)) {
      dispatch({ type: 'CLEAR_SELECTION' });
    }
  }, [dispatch, displayDocument, state.selectedElementId]);

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

  const handleViewportWheelZoom = useCallback((viewport: SurfaceViewport) => {
    setSurfaceZoom(viewport.zoom);
    setSurfaceViewCenter(viewport.viewCenter);
  }, []);

  const handleZoomFit = useCallback(() => {
    const elements = documentRef.current.elements;
    const surface = documentRef.current.surface;
    const wrapper = surfaceWrapperRef.current;
    const bounds = elements.length > 0 ? getContentBounds(elements, surface) : getCanvasBounds(surface, elements);
    if (elements.length === 0 && (!bounds.width || !bounds.height)) {
      setSurfaceZoom(1);
      setSurfaceViewCenter({ x: surface.width / 2, y: surface.height / 2 });
      return;
    }
    const availableWidth = Math.max(1, (wrapper?.clientWidth || surface.width) - 16);
    const availableHeight = Math.max(1, (wrapper?.clientHeight || surface.height) - 16);
    const scaleX = availableWidth / bounds.width;
    const scaleY = availableHeight / bounds.height;
    const zoom = Math.max(DISPLAY_ZOOM_MIN, Math.min(DISPLAY_ZOOM_MAX, Math.min(scaleX, scaleY)));
    setSurfaceZoom(Number(zoom.toFixed(2)));
    setSurfaceViewCenter({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    if (wrapper) {
      setTimeout(() => {
        if (wrapper) {
          wrapper.scrollLeft = Math.max(0, (wrapper.scrollWidth - wrapper.clientWidth) / 2);
          wrapper.scrollTop = Math.max(0, (wrapper.scrollHeight - wrapper.clientHeight) / 2);
        }
      }, 10);
    }
  }, []);

  useEffect(() => {
    const current = trendPopupRef.current;
    if (!current) {
      return;
    }
    const element = displayDocument.elements.find((candidate) => candidate.id === current.element.id);
    if (!element) {
      return;
    }
    const trendElement = createTrendElementForElement(element);
    if (trendElement) {
      handleTrendOpen(trendElement, current.seriesStates, current.cursors);
    }
  }, [displayDocument.elements, handleTrendOpen, trendRefreshKey]);

  return (
    <div ref={editorContainerRef} className={styles.container} data-testid="display-editor" onKeyDownCapture={handleEditorKeyDown}>
      <div className={styles.header}>
        <div className={styles.headerPrimary}>
          <div className={styles.displayLabel}>
            <span className={styles.displayLabelPrefix}>Display:</span>
            {editingDisplayName && mode === 'edit' ? (
              <input
                className={styles.displayNameInput}
                value={displayNameDraft}
                autoFocus
                aria-label="Nome do Display"
                data-testid="display-editor-name-input"
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                onBlur={commitDisplayName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitDisplayName();
                  if (event.key === 'Escape') {
                    setDisplayNameDraft(documentRef.current.name);
                    setEditingDisplayName(false);
                  }
                }}
              />
            ) : (
              <span
                className={styles.title}
                data-testid="display-editor-name"
                onDoubleClick={() => {
                  if (mode === 'edit') {
                    setDisplayNameDraft(displayDocument.name);
                    setEditingDisplayName(true);
                  }
                }}
                title={mode === 'edit' ? 'Clique duas vezes para renomear' : undefined}
              >
                {displayDocument.name}
              </span>
            )}
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
                <div className={styles.shapeControl}>
                  <button type="button" title="Inserir retângulo" aria-label="Inserir retângulo" className={styles.shapeMainButton} data-testid="display-insert-rectangle" onClick={() => handleInsertRectangle('rectangle')}><ShapeIcon shape="rectangle" /></button>
                  <button type="button" title="Mais formas geométricas" aria-label="Mais formas geométricas" aria-haspopup="menu" aria-expanded={shapeMenuOpen} className={styles.shapeMenuButton} data-testid="display-shape-menu-toggle" onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setShapeMenuPosition({ left: rect.left, top: rect.bottom + 5 });
                    setShapeMenuOpen((open) => !open);
                  }}><ChevronDownIcon /></button>
                  {shapeMenuOpen && shapeMenuPosition && createPortal(<div className={styles.shapeMenu} style={shapeMenuPosition} role="menu" aria-label="Formas geométricas">
                    <ShapeMenuItem shape="rectangle" label="Retângulo" onClick={handleInsertRectangle} />
                    <ShapeMenuItem shape="ellipse" label="Elipse" onClick={handleInsertRectangle} />
                    <ShapeMenuItem shape="line" label="Linha" onClick={handleInsertRectangle} />
                    <ShapeMenuItem shape="arc" label="Arco" onClick={handleInsertRectangle} />
                    <ShapeMenuItem shape="pentagon" label="Pentágono" onClick={handleInsertRectangle} />
                    <ShapeMenuItem shape="triangle" label="Triângulo" onClick={handleInsertRectangle} />
                  </div>, document.querySelector('[data-testid="pims-vision-home"]') ?? document.body)}
                </div>
                <button type="button" title="Inserir texto" aria-label="Inserir texto" className={styles.iconButton} data-testid="display-insert-text" onClick={handleInsertText}><TextIcon /></button>
                <button type="button" title="Inserir imagem" aria-label="Inserir imagem" className={styles.iconButton} data-testid="display-insert-image" onClick={() => imageInputRef.current?.click()}><ImageIcon /></button>
                <input ref={imageInputRef} type="file" accept="image/*" data-testid="display-image-input" className={styles.fileInput} onChange={handleImageFile} />
                <button type="button" title="Arrastar como Value" aria-label="Arrastar como Value" className={dropSymbolType === 'value' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-value" aria-pressed={dropSymbolType === 'value'} onClick={() => onDropSymbolTypeChange?.('value')}><ValueIcon /></button>
                <button type="button" title="Arrastar como Gauge" aria-label="Arrastar como Gauge" className={dropSymbolType === 'gauge' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-gauge" aria-pressed={dropSymbolType === 'gauge'} onClick={() => onDropSymbolTypeChange?.('gauge')}><GaugeIcon /></button>
                <button type="button" title="Arrastar como Barra" aria-label="Arrastar como Barra" className={dropSymbolType === 'bar' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-bar" aria-pressed={dropSymbolType === 'bar'} onClick={() => onDropSymbolTypeChange?.('bar')}><BarGaugeIcon /></button>
                <button type="button" title="Arrastar como Gráfico de Barras" aria-label="Arrastar como Gráfico de Barras" className={dropSymbolType === 'bar-chart' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-bar-chart" aria-pressed={dropSymbolType === 'bar-chart'} onClick={() => onDropSymbolTypeChange?.('bar-chart')}><BarChartIcon /></button>
                <button type="button" title="Arrastar como Trend" aria-label="Arrastar como Trend" className={dropSymbolType === 'trend' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-trend" aria-pressed={dropSymbolType === 'trend'} onClick={() => onDropSymbolTypeChange?.('trend')}><TrendIcon /></button>
                <button type="button" title="Arrastar como Tabela" aria-label="Arrastar como Tabela" className={dropSymbolType === 'table' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-table" aria-pressed={dropSymbolType === 'table'} onClick={() => onDropSymbolTypeChange?.('table')}>▦</button>
                <button type="button" title="Arrastar como XY Plot" aria-label="Arrastar como XY Plot" className={dropSymbolType === 'xy-plot' ? styles.symbolModeButtonActive : styles.symbolModeButton} data-testid="display-insert-xy-plot" aria-pressed={dropSymbolType === 'xy-plot'} onClick={() => onDropSymbolTypeChange?.('xy-plot')}>XY</button>
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
            <button
              type="button"
              title="Configurações da Tela / Plano de Fundo"
              aria-label="Configurações da Tela"
              className={!state.selectedElementId && propertiesPanelOpen ? styles.symbolModeButtonActive : styles.iconButton}
              data-testid="display-canvas-settings"
              onClick={() => {
                dispatch({ type: 'SELECT', elementId: null });
                setPropertiesPanelOpen(true);
              }}
            >
              <CanvasIcon />
            </button>
            <div className={styles.exportControl}>
              <button type="button" title={exporting ? 'Exportando dados PI...' : 'Exportar Display'} aria-label="Exportar Display" className={styles.iconButton} data-testid="display-export" disabled={exporting} aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((open) => !open)}>
                <ExportIcon />
              </button>
              {exportMenuOpen && <div className={styles.exportMenu} data-testid="display-export-format" role="menu" aria-label="Formato de exportação">
                {exporting ? <span>Exportando dados PI...</span> : <><span>Exportar como</span>
                  <button type="button" role="menuitem" data-testid="display-export-format-json" onClick={() => void handleExport('json')}>JSON — Configuração</button>
                  <button type="button" role="menuitem" data-testid="display-export-format-csv" onClick={() => void handleExport('csv')}>CSV — Dados</button>
                  <button type="button" role="menuitem" data-testid="display-export-format-xml" onClick={() => void handleExport('xml')}>XML — Dados</button></>}
              </div>}
            </div>
            <button type="button" title="Importar Display" aria-label="Importar Display" className={styles.iconButton} data-testid="display-import" disabled={!onChange} onClick={() => importInputRef.current?.click()}>
              <ImportIcon />
            </button>
            <input ref={importInputRef} type="file" accept="application/json,.json,.pims-vision.json" data-testid="display-import-input" className={styles.fileInput} onChange={handleImportFile} />
            <button type="button" title="Importar do PI Vision" aria-label="Importar do PI Vision" className={styles.iconButton} data-testid="display-import-pivision" disabled={!onChange} onClick={() => setPiVisionImportOpen(true)}>
              <PiVisionImportIcon />
            </button>
          </div>
        </div>
      </div>
      {importError && <div className={styles.importError} role="alert" data-testid="display-import-error">{importError}</div>}
      {piVisionImportOpen && (
        <PiVisionImportDialog
          onImport={handlePiVisionImport}
          onClose={() => setPiVisionImportOpen(false)}
        />
      )}
      <div className={styles.workspace}>
        <div
          className={`${styles.surfaceWrapper} ${displayDocument.elements.length === 0 ? styles.surfaceWrapperEmpty : ''}`}
          ref={surfaceWrapperRef}
          data-testid="display-editor-surface-wrapper"
          onScroll={handleSurfaceScroll}
          onContextMenu={(e) => {
            if (mode === 'edit') {
              e.preventDefault();
              handleSurfaceContextMenu(e);
            }
          }}
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
            onDoubleClick={handleDoubleClick}
            onStartDrag={handleStartDrag}
            onStartResize={handleStartResize}
            onPointerMove={handlePointerMove}
            onPointerEnd={handlePointerEnd}
            alignmentGuides={alignmentGuides}
            loadValue={loadValue}
            loadPiPointDatabaseLimits={loadPiPointDatabaseLimits}
            loadValues={loadValues}
            loadTrend={loadTrend}
            trendRefreshKey={trendRefreshKey}
            trendTimeRange={trendTimeRange}
            onTrendOpen={handleTrendOpen}
            onTrendContextMenu={handleTrendContextMenu}
            onTrendLegendContextMenu={handleTrendLegendInfo}
            onElementContextMenu={handleElementContextMenu}
            onLibrarySymbolContextMenu={handleLibrarySymbolContextMenu}
            onTableColumnsChange={handleTableColumnsChange}
            onTrendLegendWidthChange={handleTrendLegendWidthChange}
            zoom={surfaceZoom}
            viewCenter={surfaceViewCenter}
            minZoom={DISPLAY_ZOOM_MIN}
            maxZoom={DISPLAY_ZOOM_MAX}
            wheelZoomFactor={1 + DISPLAY_ZOOM_STEP}
            onViewportWheelZoom={handleViewportWheelZoom}
          />
          {displayDocument.elements.length === 0 && (
            <div className={styles.emptyState} data-testid="display-empty-state">
              <BarChartIcon />
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
            pointName={selectedValue.properties.binding?.pointName ?? ''}
            binding={selectedValue.properties.binding}
            loadDigitalStates={loadDigitalStates}
            onChange={handleValueVisualChange}
            multistate={selectedValue.properties.multistate}
            onMultistateChange={handleMultistateChange}
            backgroundMultistate={selectedValue.properties.backgroundMultistate}
            onBackgroundMultistateChange={handleBackgroundMultistateChange}
            linkUrl={typeof selectedValue.properties.linkUrl === 'string' ? selectedValue.properties.linkUrl : undefined}
            onLinkChange={handleLinkChange}
            openInNewTab={selectedValue.properties.openInNewTab !== false}
            onOpenInNewTabChange={handleLinkOpenInNewTabChange}
          />
        )}
        {mode === 'view' && trendPointInfo && <PiPointInfoPanel {...trendPointInfo} onClose={() => setTrendPointInfo(null)} />}
        {selectedGauge && (
          <ScalePropertiesPanel kind="Gauge" pointName={selectedGauge.properties.binding?.pointName} binding={selectedGauge.properties.binding} loadDigitalStates={loadDigitalStates} {...getGaugeOptions(selectedGauge.properties)} linkUrl={typeof selectedGauge.properties.linkUrl === 'string' ? selectedGauge.properties.linkUrl : undefined} openInNewTab={selectedGauge.properties.openInNewTab !== false} onLinkChange={handleLinkChange} onOpenInNewTabChange={handleLinkOpenInNewTabChange} onChange={handleGaugeChange} multistate={selectedGauge.properties.multistate} onMultistateChange={handleMultistateChange} />
        )}
        {selectedBar && (
          <ScalePropertiesPanel kind="Bar" pointName={selectedBar.properties.binding?.pointName} binding={selectedBar.properties.binding} loadDigitalStates={loadDigitalStates} {...getBarOptions(selectedBar.properties)} linkUrl={typeof selectedBar.properties.linkUrl === 'string' ? selectedBar.properties.linkUrl : undefined} openInNewTab={selectedBar.properties.openInNewTab !== false} onLinkChange={handleLinkChange} onOpenInNewTabChange={handleLinkOpenInNewTabChange} onChange={handleBarChange} multistate={selectedBar.properties.multistate} onMultistateChange={handleMultistateChange} />
        )}
        {selectedBarChart && (
          <BarChartPropertiesPanel
            element={selectedBarChart}
            onChange={handleBarChartChange}
            onVisualChange={handleBarChartVisualChange}
            onRemoveItem={(index) => commitDocument(removeBarChartItem(documentRef.current, selectedBarChart.id, index))}
            onMoveItem={(index, offset) => commitDocument(moveBarChartItem(documentRef.current, selectedBarChart.id, index, offset))}
          />
        )}
        {selectedTable && <TablePropertiesPanel properties={selectedTable.properties} onChange={handleTableChange} onRemoveItem={(index) => commitDocument(removeTableItem(documentRef.current, selectedTable.id, index))} onMoveItem={(index, offset) => commitDocument(moveTableItem(documentRef.current, selectedTable.id, index, offset))} onExport={(format) => void handleTableExport(selectedTable, format)} exporting={exporting} />}
        {selectedXYPlot && <XYPlotPropertiesPanel element={selectedXYPlot} onChange={handleXYPlotChange} onRemoveY={handleXYPlotRemoveY} onMoveY={handleXYPlotMoveY} />}
        {selectedSqlTable && <SqlTablePropertiesPanel properties={selectedSqlTable.properties} onChange={handleSqlTableChange} />}
        {selectedRectangle && (
          <RectanglePropertiesPanel
            fill={selectedRectangle.properties.fill ?? DEFAULT_RECTANGLE_PROPERTIES.fill}
            stroke={selectedRectangle.properties.stroke ?? DEFAULT_RECTANGLE_PROPERTIES.stroke}
            shape={selectedRectangle.properties.shape ?? 'rectangle'}
            rotation={selectedRectangle.properties.rotation}
            pointName={isPiPointBinding(selectedRectangle.properties.binding) ? selectedRectangle.properties.binding.pointName : undefined}
            calculationName={displayDocument.calculations?.find((c) => c.id === selectedRectangle.properties.calculationId)?.name}
            calculationId={selectedRectangle.properties.calculationId}
            binding={isPiPointBinding(selectedRectangle.properties.binding) ? selectedRectangle.properties.binding : undefined}
            loadDigitalStates={loadDigitalStates}
            linkUrl={typeof selectedRectangle.properties.linkUrl === 'string' ? selectedRectangle.properties.linkUrl : undefined}
            openInNewTab={selectedRectangle.properties.openInNewTab !== false}
            onLinkChange={handleLinkChange}
            onOpenInNewTabChange={handleLinkOpenInNewTabChange}
            multistate={selectedRectangle.properties.multistate}
            onChange={handleRectangleChange}
            onMultistateChange={handleMultistateChange}
          />
        )}
        {selectedText && (
          <TextPropertiesPanel
            properties={selectedText.properties}
            selectedPiPoint={selectedPiPoint}
            pointName={isPiPointBinding(selectedText.properties.binding) ? selectedText.properties.binding.pointName : undefined}
            calculationName={displayDocument.calculations?.find((c) => c.id === selectedText.properties.calculationId)?.name}
            binding={isPiPointBinding(selectedText.properties.binding) ? selectedText.properties.binding : undefined}
            loadDigitalStates={loadDigitalStates}
            onChange={handleTextChange}
            multistate={selectedText.properties.multistate}
            onMultistateChange={handleMultistateChange}
            backgroundMultistate={selectedText.properties.backgroundMultistate}
            onBackgroundMultistateChange={handleBackgroundMultistateChange}
          />
        )}
        {selectedImage && <ImagePropertiesPanel properties={selectedImage.properties} onChange={handleImageChange} />}
        {selectedLibrarySymbol && (
          <LibrarySymbolPropertiesPanel
            properties={selectedLibrarySymbol.properties}
            selectedPiPoint={selectedPiPoint}
            calculationName={displayDocument.calculations?.find((c) => c.id === selectedLibrarySymbol.properties.calculationId)?.name}
            loadDigitalStates={loadDigitalStates}
            onChange={handleLibrarySymbolChange}
            onMultistateChange={handleMultistateChange}
          />
        )}
        {propertiesOpen && state.selectedElementId && !selectedValue && !selectedGauge && !selectedBar && !selectedBarChart && !selectedTable && !selectedXYPlot && !selectedSqlTable && !selectedRectangle && !selectedImage && !selectedLibrarySymbol && !selectedText && !selectedTrend && !selectedProgramming && !optionsTrend && <LinkPropertiesPanel value={(displayDocument.elements.find((element) => element.id === state.selectedElementId)?.properties as { linkUrl?: string } | undefined)?.linkUrl} openInNewTab={(displayDocument.elements.find((element) => element.id === state.selectedElementId)?.properties as { openInNewTab?: boolean } | undefined)?.openInNewTab !== false} onChange={handleLinkChange} onOpenInNewTabChange={handleLinkOpenInNewTabChange} />}
        {optionsTrend && <TrendPropertiesPanel element={optionsTrend} onVisualChange={handleTrendVisualChange} onSeriesChange={handleTrendSeriesChange} onSeriesRemove={handleTrendSeriesRemove} />}
        {mode === 'edit' && propertiesPanelOpen && !state.selectedElementId && (
          <CanvasPropertiesPanel
            surface={displayDocument.surface}
            onChange={handleSurfaceChange}
            onClose={() => setPropertiesPanelOpen(false)}
          />
        )}
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
          pointInfo={trendPointInfo ? { ...trendPointInfo, onClose: () => setTrendPointInfo(null) } : undefined}
          onSeriesContextMenu={handleTrendLegendInfo}
          onClose={handleTrendPopupClose}
        />
      )}
      {contextMenu && contextMenuItems.length > 0 && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
      {pendingSymbolConversion && (
        <div className={styles.symbolConversionOverlay} role="dialog" aria-modal="true" aria-label="Selecionar PI Point">
          <div className={styles.symbolConversionDialog}>
            <h3>Qual item de dados deve ser utilizado?</h3>
            <p>O símbolo de destino aceita somente uma PI Point.</p>
            {pendingSymbolConversion.bindings.map((binding, index) => (
              <label key={`${binding.dataSourceUid}-${binding.webId ?? binding.pointName}-${index}`} className={styles.symbolConversionOption}>
                <input type="radio" name="symbol-conversion-binding" checked={pendingSymbolConversion.selectedIndex === index}
                  onChange={() => setPendingSymbolConversion((current) => current ? { ...current, selectedIndex: index } : current)} />
                {binding.pointName}
              </label>
            ))}
            <div className={styles.symbolConversionActions}>
              <button type="button" onClick={() => setPendingSymbolConversion(null)}>Cancelar</button>
              <button type="button" className={styles.primaryButton} onClick={() => applySymbolConversion(pendingSymbolConversion.elementId, pendingSymbolConversion.targetType, [pendingSymbolConversion.bindings[pendingSymbolConversion.selectedIndex]])}>Converter</button>
            </div>
          </div>
        </div>
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

function downloadExport(content: string, format: DisplayExportFileFormat, name: string, mimeType?: string): void {
  const types: Record<DisplayExportFileFormat, string> = { json: 'application/json;charset=utf-8', csv: 'text/csv;charset=utf-8', xml: 'application/xml;charset=utf-8' };
  const objectUrl = URL.createObjectURL(new Blob([content], { type: mimeType ?? types[format] }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = getDisplayExportFileName(name, format);
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName?.toLowerCase();
  // The hidden file input used by the import button keeps focus after an
  // import. It is not an editable field, so history shortcuts must still be
  // handled there. Preserve native undo/redo in actual text controls.
  const inputType = tagName === 'input' ? (element as HTMLInputElement).type?.toLowerCase() : undefined;
  return (tagName === 'input' && inputType !== 'file' && inputType !== 'button' && inputType !== 'submit')
    || tagName === 'textarea'
    || tagName === 'select'
    || element.isContentEditable;
}

function getDropPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  _document: DisplayDocument,
): Point | undefined {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return undefined;
  }
  const bounds = svg.getBoundingClientRect?.();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) {
    return undefined;
  }
  // Use the displayed SVG rectangle rather than getScreenCTM(). In Grafana,
  // the editor surface can be inside a scrolled/zoomed container and some
  // browsers keep a stale CTM during HTML drag events. That made the preview
  // (and the inserted element) appear far away from the pointer.
  const values = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const [viewBoxX = 0, viewBoxY = 0, viewBoxWidth = Number(svg.getAttribute('width')) || bounds.width, viewBoxHeight = Number(svg.getAttribute('height')) || bounds.height] = values;
  if (!(viewBoxWidth > 0) || !(viewBoxHeight > 0)) return undefined;
  const scale = Math.min(bounds.width / viewBoxWidth, bounds.height / viewBoxHeight);
  const renderedWidth = viewBoxWidth * scale;
  const renderedHeight = viewBoxHeight * scale;
  const offsetX = bounds.left + (bounds.width - renderedWidth) / 2;
  const offsetY = bounds.top + (bounds.height - renderedHeight) / 2;
  return {
    x: viewBoxX + (clientX - offsetX) / scale,
    y: viewBoxY + (clientY - offsetY) / scale,
  };
}

function getSvgViewport(svg: SVGSVGElement) {
  const bounds = svg.getBoundingClientRect();
  const viewBoxValues = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [viewBoxX = 0, viewBoxY = 0, viewBoxWidth = Number(svg.getAttribute('width')) || bounds.width, viewBoxHeight = Number(svg.getAttribute('height')) || bounds.height] = viewBoxValues;
  const scale = viewBoxWidth > 0 && viewBoxHeight > 0
    ? Math.min(bounds.width / viewBoxWidth, bounds.height / viewBoxHeight)
    : 1;
  const width = viewBoxWidth * scale;
  const height = viewBoxHeight * scale;
  return {
    left: bounds.left + (bounds.width - width) / 2 - viewBoxX * scale,
    top: bounds.top + (bounds.height - height) / 2 - viewBoxY * scale,
    width,
    height,
    scale,
  };
}

function positionElementAt<T extends ElementGeometry>(
  element: T,
  point: Point,
  _document: DisplayDocument,
): T {
  return {
    ...element,
    // Keep the element centred below the pointer. The canvas expands to
    // include elements outside the original surface, so clamping to the
    // configured surface size would move a drop made in the expanded area.
    x: Math.round(point.x - element.width / 2),
    y: Math.round(point.y - element.height / 2),
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
  barChartAtClientPoint?: BarChartElement,
  allowBarChartTarget = true,
): PiPointDragPreview {
  const binding = createPiPointBinding(pointResult);
  const point = binding ? getDropPoint(svg, clientX, clientY, document) : undefined;
  const prototype = binding ? createDropPreviewElement(symbolType, binding, document) : undefined;
  const targetTrend = allowTrendTarget
    ? trendAtClientPoint ?? (point ? findTrendAtPoint(document, point) : undefined)
    : undefined;
  const targetBarChart = allowBarChartTarget
    ? barChartAtClientPoint ?? (point ? findBarChartAtPoint(document, point) : undefined)
    : undefined;
  // The drop handler clamps the element to the surface bounds, so every
  // pointer position inside the display is a valid placement.
  const valid = !!binding && !!prototype && (!!point || !!targetTrend || !!targetBarChart);

  if (!valid || !prototype) {
    return createInvalidDragPreview(wrapper, clientX, clientY, label, symbolType);
  }

  const wrapperBounds = wrapper.getBoundingClientRect();
  const viewport = getSvgViewport(svg);
  if (targetTrend) {
    const trendLeft = viewport.left - wrapperBounds.left + wrapper.scrollLeft + targetTrend.x * viewport.scale;
    const trendTop = viewport.top - wrapperBounds.top + wrapper.scrollTop + targetTrend.y * viewport.scale;
    const trendWidth = targetTrend.width * viewport.scale;
    const trendHeight = targetTrend.height * viewport.scale;
    const width = Math.min(320, Math.max(1, trendWidth - 12));
    const height = Math.min(64, Math.max(1, trendHeight - 12));
    const pointerLeft = clientX - wrapperBounds.left + wrapper.scrollLeft - width / 2;
    const pointerTop = clientY - wrapperBounds.top + wrapper.scrollTop - height / 2;
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
  if (targetBarChart) {
    const barChartLeft = viewport.left - wrapperBounds.left + wrapper.scrollLeft + targetBarChart.x * viewport.scale;
    const barChartTop = viewport.top - wrapperBounds.top + wrapper.scrollTop + targetBarChart.y * viewport.scale;
    const barChartWidth = targetBarChart.width * viewport.scale;
    const barChartHeight = targetBarChart.height * viewport.scale;
    const width = Math.min(320, Math.max(1, barChartWidth - 12));
    const height = Math.min(64, Math.max(1, barChartHeight - 12));
    const pointerLeft = clientX - wrapperBounds.left + wrapper.scrollLeft - width / 2;
    const pointerTop = clientY - wrapperBounds.top + wrapper.scrollTop - height / 2;
    return {
      left: Math.max(barChartLeft + 6, Math.min(pointerLeft, barChartLeft + barChartWidth - width - 6)),
      top: Math.max(barChartTop + 6, Math.min(pointerTop, barChartTop + barChartHeight - height - 6)),
      width,
      height,
      valid: true,
      label,
      symbolType: 'bar-chart',
      targetTrend: false,
      targetBarChart: true,
      targetBarChartId: targetBarChart.id,
    };
  }
  const positioned = positionElementAt(prototype, point!, document);
  return {
    left: viewport.left - wrapperBounds.left + wrapper.scrollLeft + positioned.x * viewport.scale,
    top: viewport.top - wrapperBounds.top + wrapper.scrollTop + positioned.y * viewport.scale,
    width: positioned.width * viewport.scale,
    height: positioned.height * viewport.scale,
    valid: true,
    label,
    symbolType,
    targetTrend: false,
  };
}

function createCalculationDragPreview(
  svg: SVGSVGElement,
  wrapper: HTMLDivElement,
  clientX: number,
  clientY: number,
  document: DisplayDocument,
  symbolType: PiPointDropSymbolType,
  targetTrend?: TrendElement,
  targetLibrarySymbol?: LibrarySymbolElement,
  targetShape?: RectangleElement,
): PiPointDragPreview | undefined {
  const point = getDropPoint(svg, clientX, clientY, document);
  if (!point) {
    return undefined;
  }
  if (targetLibrarySymbol) {
    const wrapperBounds = wrapper.getBoundingClientRect();
    const viewport = getSvgViewport(svg);
    return {
      left: viewport.left - wrapperBounds.left + wrapper.scrollLeft + targetLibrarySymbol.x * viewport.scale,
      top: viewport.top - wrapperBounds.top + wrapper.scrollTop + targetLibrarySymbol.y * viewport.scale,
      width: targetLibrarySymbol.width * viewport.scale,
      height: targetLibrarySymbol.height * viewport.scale,
      valid: true,
      label: 'Vincular ao símbolo',
      symbolType,
      targetTrend: false,
    };
  }
  if (targetShape) {
    const wrapperBounds = wrapper.getBoundingClientRect();
    const viewport = getSvgViewport(svg);
    return {
      left: viewport.left - wrapperBounds.left + wrapper.scrollLeft + targetShape.x * viewport.scale,
      top: viewport.top - wrapperBounds.top + wrapper.scrollTop + targetShape.y * viewport.scale,
      width: targetShape.width * viewport.scale,
      height: targetShape.height * viewport.scale,
      valid: true,
      label: 'Vincular à forma',
      symbolType,
      targetTrend: false,
    };
  }
  if (symbolType === 'trend' && targetTrend) {
    const wrapperBounds = wrapper.getBoundingClientRect();
    const viewport = getSvgViewport(svg);
    return {
      left: viewport.left - wrapperBounds.left + wrapper.scrollLeft + targetTrend.x * viewport.scale,
      top: viewport.top - wrapperBounds.top + wrapper.scrollTop + targetTrend.y * viewport.scale,
      width: targetTrend.width * viewport.scale,
      height: targetTrend.height * viewport.scale,
      valid: true,
      label: 'Cálculo',
      symbolType,
      targetTrend: true,
      targetTrendId: targetTrend.id,
    };
  }
  const prototype = createCalculationDropPreviewElement(symbolType, document);
  const wrapperBounds = wrapper.getBoundingClientRect();
  const viewport = getSvgViewport(svg);
  const positioned = positionElementAt(prototype, point, document);
  return {
    left: viewport.left - wrapperBounds.left + wrapper.scrollLeft + positioned.x * viewport.scale,
    top: viewport.top - wrapperBounds.top + wrapper.scrollTop + positioned.y * viewport.scale,
    width: positioned.width * viewport.scale,
    height: positioned.height * viewport.scale,
    valid: true,
    label: 'Cálculo',
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

function resolveTextDropTarget(
  document: DisplayDocument,
  eventTarget: EventTarget | null,
  point: Point | undefined,
): TextElement | undefined {
  const textNode = eventTarget instanceof Element
    ? eventTarget.closest('[data-element-id][data-element-type="text"]')
    : null;
  const elementId = textNode?.getAttribute('data-element-id');
  if (elementId) {
    const element = document.elements.find((candidate) => candidate.id === elementId && candidate.type === TEXT_TYPE);
    if (element) {
      return element as TextElement;
    }
  }
  if (!point) {
    return undefined;
  }
  const topmostElement = [...document.elements].reverse().find((element) => (
    element.type === TEXT_TYPE
      && point.x >= element.x
      && point.x <= element.x + element.width
      && point.y >= element.y
      && point.y <= element.y + element.height
  ));
  return topmostElement as TextElement | undefined;
}

function resolveLibrarySymbolDropTarget(
  document: DisplayDocument,
  eventTarget: EventTarget | null,
  point: Point | undefined,
): LibrarySymbolElement | undefined {
  const symbolNode = eventTarget instanceof Element
    ? eventTarget.closest('[data-element-id][data-element-type="library-symbol"]')
    : null;
  const elementId = symbolNode?.getAttribute('data-element-id');
  if (elementId) {
    const element = document.elements.find((candidate) => candidate.id === elementId && candidate.type === 'library-symbol');
    if (element) {
      return element as LibrarySymbolElement;
    }
  }
  if (!point) {
    return undefined;
  }
  const topmostElement = [...document.elements].reverse().find((element) => (
    element.type === 'library-symbol'
      && point.x >= element.x
      && point.x <= element.x + element.width
      && point.y >= element.y
      && point.y <= element.y + element.height
  ));
  return topmostElement as LibrarySymbolElement | undefined;
}

function resolveTableDropTarget(
  document: DisplayDocument,
  eventTarget: EventTarget | null,
  point: Point | undefined,
): TableElement | undefined {
  const tableNode = eventTarget instanceof Element
    ? eventTarget.closest('[data-element-id][data-element-type="table"]')
    : null;
  const elementId = tableNode?.getAttribute('data-element-id');
  if (elementId) {
    const element = document.elements.find((candidate) => candidate.id === elementId && candidate.type === TABLE_TYPE);
    if (element) return element as TableElement;
  }
  if (!point) return undefined;
  const element = [...document.elements].reverse().find((candidate) => candidate.type === TABLE_TYPE && point.x >= candidate.x && point.x <= candidate.x + candidate.width && point.y >= candidate.y && point.y <= candidate.y + candidate.height);
  return element as TableElement | undefined;
}

function resolveXYPlotDropTarget(document: DisplayDocument, eventTarget: EventTarget | null, point: Point | undefined): XYPlotElement | undefined {
  const xyNode = eventTarget instanceof Element ? eventTarget.closest('[data-element-id][data-element-type="xy-plot"]') : null;
  const elementId = xyNode?.getAttribute('data-element-id');
  if (elementId) {
    const element = document.elements.find((candidate) => candidate.id === elementId && candidate.type === XY_PLOT_TYPE);
    if (element) return element as XYPlotElement;
  }
  if (!point) return undefined;
  return [...document.elements].reverse().find((candidate) => candidate.type === XY_PLOT_TYPE && point.x >= candidate.x && point.x <= candidate.x + candidate.width && point.y >= candidate.y && point.y <= candidate.y + candidate.height) as XYPlotElement | undefined;
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
    ?? (point ? findTrendAtPoint(document, point) : undefined);
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

function resolveBarChartDropTarget(
  document: DisplayDocument,
  eventTarget: EventTarget | null,
  clientX: number,
  clientY: number,
  point: Point | undefined,
): BarChartElement | undefined {
  return findBarChartFromEventTarget(eventTarget, document)
    ?? findBarChartAtClientPoint(clientX, clientY, document)
    ?? (point ? findBarChartAtPoint(document, point) : undefined);
}

function findBarChartFromEventTarget(
  eventTarget: EventTarget | null,
  displayDocument: DisplayDocument,
): BarChartElement | undefined {
  const node = eventTarget instanceof Element
    ? eventTarget.closest('[data-element-id][data-element-type="bar-chart"]')
    : null;
  const elementId = node?.getAttribute('data-element-id');
  if (!elementId) {
    return undefined;
  }
  const element = displayDocument.elements.find((candidate) => (
    candidate.id === elementId && candidate.type === BAR_CHART_TYPE
  ));
  return element as BarChartElement | undefined;
}

function findBarChartAtClientPoint(
  clientX: number,
  clientY: number,
  displayDocument: DisplayDocument,
): BarChartElement | undefined {
  const hit = globalThis.document.elementFromPoint?.(clientX, clientY);
  const node = hit instanceof Element
    ? hit.closest('[data-element-id][data-element-type="bar-chart"]')
    : null;
  const elementId = node?.getAttribute('data-element-id');
  if (!elementId) {
    return undefined;
  }
  const element = displayDocument.elements.find((candidate) => (
    candidate.id === elementId && candidate.type === BAR_CHART_TYPE
  ));
  return element as BarChartElement | undefined;
}

function findBarChartAtPoint(document: DisplayDocument, point: Point): BarChartElement | undefined {
  const topmostElement = [...document.elements].reverse().find((element) => (
    point.x >= element.x
    && point.x <= element.x + element.width
    && point.y >= element.y
    && point.y <= element.y + element.height
  ));
  return topmostElement?.type === BAR_CHART_TYPE ? topmostElement as BarChartElement : undefined;
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
  const x = Number.isFinite(clientX) ? clientX - wrapperBounds.left + wrapper.scrollLeft : wrapper.scrollLeft;
  const y = Number.isFinite(clientY) ? clientY - wrapperBounds.top + wrapper.scrollTop : wrapper.scrollTop;
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
    case 'bar-chart':
      return createBarChart({ item: { binding }, surface: document.surface });
    case 'value':
      return createValue(options);
    case 'table':
      return createTable({ item: { binding }, surface: document.surface });
    case 'xy-plot':
      return createXYPlot({ xBinding: binding, surface: document.surface });
  }
}

function createCalculationDropPreviewElement(
  symbolType: PiPointDropSymbolType,
  document: DisplayDocument,
): ElementGeometry {
  const options = {
    calculationId: '__preview__',
    surface: document.surface,
  };
  switch (symbolType) {
    case 'trend':
      return createTrend(options);
    case 'gauge':
      return createGauge(options);
    case 'bar':
      return createBar(options);
    case 'bar-chart':
      return createBar(options);
    case 'value':
      return createValue(options);
    case 'table':
      return createBar(options);
    case 'xy-plot':
      return createBar(options);
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
  displayNameInput: css`
    min-width: 120px;
    max-width: 360px;
    padding: 4px 7px;
    border: 1px solid var(--accent, #d6339a);
    border-radius: 4px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg, #0d1622);
    font: inherit;
  `,
  modeControls: css`
    display: flex;
    gap: 2px;
    margin-left: ${theme.spacing(1)};
  `,
  modeButton: css`
    display: inline-flex;
    /* A large imported SVG must start at the scroll origin. Centering it
       creates negative overflow, which native scrollbars cannot reach. The
       SVG's auto margins still center displays that fit in the workspace. */
    align-items: flex-start;
    justify-content: flex-start;
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
  shapeControl: css`
    position: relative;
    display: inline-flex;
    height: 42px;
  `,
  shapeMainButton: css`
    display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 42px; padding: 0;
    border: 1px solid var(--border-color); border-right: 0; border-radius: 8px 0 0 8px;
    background: var(--button-bg); color: var(--text-secondary); cursor: pointer;
    &:hover { color: var(--text-primary); background: var(--button-hover); }
  `,
  shapeMenuButton: css`
    display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 42px; padding: 0;
    border: 1px solid var(--border-color); border-radius: 0 8px 8px 0;
    background: var(--button-bg); color: var(--text-secondary); cursor: pointer;
    &:hover { color: var(--text-primary); background: var(--button-hover); }
  `,
  shapeMenu: css`
    position: fixed; z-index: 1000;
    display: flex; flex-direction: column; min-width: 142px; padding: 5px;
    border: 1px solid var(--border-color, #607086); border-radius: 5px; background: var(--panel-bg, #111923);
    box-shadow: 0 8px 20px rgba(0, 0, 0, .42);
    button { display:flex; align-items:center; gap:9px; min-height:30px; padding:4px 7px; border:0; border-radius:3px; background:transparent; color:var(--text-primary, #f1f2f5); cursor:pointer; font-size:11px; text-align:left; }
    button:hover { background:var(--button-hover, #223146); }
    svg { width:21px; height:21px; color:var(--text-secondary, #aeb3bf); }
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
  exportControl: css`position:relative; display:flex;`,
  exportMenu: css`
    position:absolute;
    z-index:20;
    right:0;
    top:calc(100% + 6px);
    display:flex;
    flex-direction:column;
    min-width:132px;
    padding:8px;
    border:1px solid var(--border-color);
    border-radius:5px;
    background:var(--panel-bg);
    box-shadow:0 8px 20px rgba(0, 0, 0, 0.28);
    span { padding:2px 5px 6px; color:var(--text-secondary); font-size:10px; }
    button { min-height:28px; padding:3px 6px; border:0; border-radius:3px; background:transparent; color:var(--text-primary); text-align:left; cursor:pointer; font-size:11px; }
    button:hover { background:var(--button-hover); }
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
    color: var(--danger);
    border-bottom: 1px solid var(--border-subtle);
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
    /* Do not let an imported PI Vision SVG's intrinsic width push the
       properties panel outside the editor. The SVG remains scrollable inside
       this flex item when it is larger than the available space. */
    flex: 1 1 0;
    width: 0;
    min-width: 0;
    min-height: 0;
    /* Keep the full display reachable when its surface is larger than the
       available editor area. The SVG supplies the intrinsic minimum size;
       these scrollbars only appear when they are actually needed. */
    overflow: auto;
    /* Imported PI Vision symbols can paint labels/strokes outside their
       declared geometry. Reserve an actual scrollable tail so the native
       bars continue past the document edge and reveal that overflow. */
    padding: 16px 240px 240px 16px;
    scroll-padding-right: 240px;
    scroll-padding-bottom: 240px;
    box-sizing: border-box;
    background-color: var(--canvas-bg);
    background-image: radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px);
    background-size: 16px 16px;
    border-top: 1px solid var(--border-subtle);

    & > svg {
      max-width: none;
      max-height: none;
      margin: auto;
      flex-shrink: 0;
      outline: none;
      border: none;
    }

    @media (max-width: 760px) {
      flex: 0 0 auto;
      width: 100%;
      width: 100%;
      min-height: min(62vh, 560px);
    }
  `,
  surfaceWrapperEmpty: css`
    overflow: hidden !important;
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
  symbolConversionOverlay: css`
    position: fixed;
    inset: 0;
    z-index: 10001;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
  `,
  symbolConversionDialog: css`
    width: min(390px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: ${theme.spacing(2)};
    background: ${theme.colors.background.primary};
    color: ${theme.colors.text.primary};
    border: 1px solid ${theme.colors.border.strong};
    border-radius: ${theme.shape.borderRadius(2)};
    box-shadow: ${theme.shadows.z3};
    h3 { margin: 0 0 ${theme.spacing(0.5)}; font-size: ${theme.typography.h4.fontSize}; }
    p { margin: 0 0 ${theme.spacing(1.5)}; color: ${theme.colors.text.secondary}; }
  `,
  symbolConversionOption: css`
    display: flex; align-items: center; gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.75)} 0; cursor: pointer;
  `,
  symbolConversionActions: css`
    display: flex; justify-content: flex-end; gap: ${theme.spacing(1)}; margin-top: ${theme.spacing(2)};
    button { border: 1px solid ${theme.colors.border.medium}; border-radius: ${theme.shape.borderRadius(1)}; padding: ${theme.spacing(0.75, 1.25)}; background: transparent; color: ${theme.colors.text.primary}; cursor: pointer; }
  `,
  primaryButton: css`
    background: ${theme.colors.primary.main} !important; color: ${theme.colors.primary.contrastText} !important; border-color: ${theme.colors.primary.main} !important;
  `,
  workspace: css`
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    align-items: stretch;

    /* Keep long property panels inside the editor viewport. Their own
       overflow-y handles all controls instead of letting the flex row grow
       beyond the visible area. */
    & > aside,
    & > section {
      min-height: 0;
      height: 100%;
      max-height: none;
    }

    @media (max-width: 760px) {
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;

      & > aside,
      & > section {
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
      return <BarGaugeIcon />;
    case 'bar-chart':
      return <BarChartIcon />;
    case 'value':
      return <ValueIcon />;
    case 'table':
      return <span aria-hidden="true">▦</span>;
    case 'xy-plot':
      return <span aria-hidden="true">XY</span>;
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

function ShapeMenuItem({ shape, label, onClick }: { shape: GeometricShape; label: string; onClick: (shape: GeometricShape) => void }) {
  return <button type="button" role="menuitem" data-testid={`display-insert-shape-${shape}`} onClick={() => onClick(shape)}><ShapeIcon shape={shape} /><span>{label}</span></button>;
}

function ShapeIcon({ shape }: { shape: GeometricShape }) {
  const props = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true as const };
  if (shape === 'ellipse') return <svg viewBox="0 0 24 24" {...props}><ellipse cx="12" cy="12" rx="8" ry="5.5" /></svg>;
  if (shape === 'line') return <svg viewBox="0 0 24 24" {...props}><path d="m5 5 14 14" /></svg>;
  if (shape === 'arc') return <svg viewBox="0 0 24 24" {...props}><path d="M5 5a14 14 0 0 1 14 14" /></svg>;
  if (shape === 'pentagon') return <svg viewBox="0 0 24 24" {...props}><path d="m12 3 8 5.8-3 9.2H7L4 8.8z" /></svg>;
  if (shape === 'triangle') return <svg viewBox="0 0 24 24" {...props}><path d="m12 4 8 15H4z" /></svg>;
  return <svg viewBox="0 0 24 24" {...props}><rect x="4" y="6" width="16" height="12" /></svg>;
}

function ChevronDownIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>;
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

function BarGaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="4" width="6" height="16" rx="1" />
      <rect x="4.5" y="11" width="3" height="7.5" fill="currentColor" stroke="none" />
      <rect x="11" y="8" width="10" height="7" rx="1" />
      <rect x="12.5" y="9.5" width="5" height="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 19V9M10 19V5M15 19v-7M20 19V3" />
      <path d="M3 20h19" />
    </svg>
  );
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

function PiVisionImportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 13v6h14v-6" />
      <path d="M12 15V8m-4 7 4 4 4-4" />
      <text x="7" y="7" fontSize="6" fontWeight="700" fill="currentColor" stroke="none" fontFamily="monospace">PI</text>
    </svg>
  );
}

function CanvasIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 5.5H14.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="3.5" r="1" fill="currentColor" />
      <circle cx="7" cy="3.5" r="1" fill="currentColor" />
    </svg>
  );
}
