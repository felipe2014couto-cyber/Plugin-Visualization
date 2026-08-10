import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { DisplayDocument } from '../../displayDocument';
import { appendDisplayElement, createRectangle } from '../../createRectangle';
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
  TREND_TYPE,
  type TrendElement,
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
import { createPiPointBinding, isPiPointBinding, type PiPointBinding } from '../../../pi/piPointBinding';
import type { PiPointSearchResult, PiPointValue } from '../../../pi/piDataSource';
import { PI_POINT_DRAG_MIME, parsePiPointDragData } from '../../../pi/piPointDrag';
import { DisplaySurface } from './DisplaySurface';
import { ValuePropertiesPanel } from './ValuePropertiesPanel';
import { ScalePropertiesPanel } from './ScalePropertiesPanel';
import type { LoadCurrentValues } from '../../runtime/valueRuntime';
import type { LoadTrendSeries } from '../../runtime/trendRuntime';
import type { DisplayTimeRange } from '../../../time/timeRange';
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
  loadValues?: LoadCurrentValues;
  loadTrend?: LoadTrendSeries;
  loadRecordedTrend?: LoadTrendSeries;
  dropSymbolType?: PiPointDropSymbolType;
  trendRefreshKey?: string;
  trendTimeRange?: DisplayTimeRange;
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

export function DisplayEditor({
  document: displayDocument,
  onChange,
  onModeChange,
  selectedPiPoint,
  loadValue,
  loadValues,
  loadTrend,
  loadRecordedTrend,
  dropSymbolType = 'value',
  trendRefreshKey,
  trendTimeRange,
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
  const [, refreshHistory] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [piPointDragPreview, setPiPointDragPreview] = useState<PiPointDragPreview | null>(null);

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

  const handleStartDrag = useCallback(
    (elementId: string, pointer: Point) => {
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

    publishDocument(updateElementGeometry(documentRef.current, interaction.elementId, newGeometry));
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
    const rectangle = createRectangle({
      surface: currentDocument.surface,
      existingIds: currentDocument.elements.map((element) => element.id),
    });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendDisplayElement(currentDocument, rectangle));
    dispatch({ type: 'SELECT', elementId: rectangle.id });
  }, [commitDocument, dispatch]);

  const handleInsertValue = useCallback(() => {
    if (!selectedPiPoint) {
      return;
    }
    const binding = createPiPointBinding(selectedPiPoint);
    if (!binding) {
      return;
    }

    const currentDocument = documentRef.current;
    const value = createValue({
      binding,
      surface: currentDocument.surface,
      existingIds: currentDocument.elements.map((element) => element.id),
    });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendValue(currentDocument, value));
    dispatch({ type: 'SELECT', elementId: value.id });
  }, [commitDocument, dispatch, selectedPiPoint]);

  const handleInsertTrend = useCallback(() => {
    if (!selectedPiPoint) {
      return;
    }
    const binding = createPiPointBinding(selectedPiPoint);
    if (!binding) {
      return;
    }

    const currentDocument = documentRef.current;
    const trend = createTrend({
      binding,
      surface: currentDocument.surface,
      existingIds: currentDocument.elements.map((element) => element.id),
    });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendTrend(currentDocument, trend));
    dispatch({ type: 'SELECT', elementId: trend.id });
  }, [commitDocument, dispatch, selectedPiPoint]);

  const handleAddPiPointToSelectedTrend = useCallback(() => {
    const binding = selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined;
    const selectedElementId = stateRef.current.selectedElementId;
    if (!binding || !selectedElementId || !onChangeRef.current) {
      return;
    }
    const selectedTrend = documentRef.current.elements.find((element) => (
      element.id === selectedElementId && element.type === TREND_TYPE
    ));
    if (!selectedTrend) {
      return;
    }
    commitDocument(addTrendSeries(documentRef.current, selectedTrend.id, binding));
  }, [commitDocument, selectedPiPoint]);

  const handleInsertGauge = useCallback(() => {
    const binding = selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined;
    if (selectedPiPoint && !binding) {
      return;
    }
    const currentDocument = documentRef.current;
    const gauge = createGauge({ binding, surface: currentDocument.surface, existingIds: currentDocument.elements.map((element) => element.id) });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendGauge(currentDocument, gauge));
    dispatch({ type: 'SELECT', elementId: gauge.id });
  }, [commitDocument, dispatch, selectedPiPoint]);

  const handleInsertBar = useCallback(() => {
    const binding = selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined;
    if (selectedPiPoint && !binding) {
      return;
    }
    const currentDocument = documentRef.current;
    const bar = createBar({ binding, surface: currentDocument.surface, existingIds: currentDocument.elements.map((element) => element.id) });
    if (!onChangeRef.current) {
      return;
    }
    commitDocument(appendBar(currentDocument, bar));
    dispatch({ type: 'SELECT', elementId: bar.id });
  }, [commitDocument, dispatch, selectedPiPoint]);

  const handlePiPointDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (mode !== 'edit' || !onChangeRef.current || !Array.from(event.dataTransfer.types).includes(PI_POINT_DRAG_MIME)) {
      return;
    }
    event.preventDefault();
    const pointResult = parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)) ?? selectedPiPoint;
    const svg = event.currentTarget.querySelector('svg');
    const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
    const targetTrend = resolveTrendDropTarget(
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
    const pointResult = parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)) ?? selectedPiPoint;
    const binding = pointResult ? createPiPointBinding(pointResult) : undefined;
    const svg = event.currentTarget.querySelector('svg');
    const point = svg ? getDropPoint(svg, event.clientX, event.clientY, documentRef.current) : undefined;
    const currentDocument = documentRef.current;
    const targetTrend = resolveTrendDropTarget(
      currentDocument,
      event.target,
      event.clientX,
      event.clientY,
      point,
    );
    if (!binding || (!point && !targetTrend)) {
      return;
    }
    event.preventDefault();

    if (targetTrend) {
      commitDocument(addTrendSeries(currentDocument, targetTrend.id, binding));
      dispatch({ type: 'SELECT', elementId: targetTrend.id });
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

  const selectedTrend = mode === 'edit' && state.selectedElementId
    ? displayDocument.elements.find((element) => (
      element.id === state.selectedElementId && element.type === TREND_TYPE
    )) as TrendElement | undefined
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
  const handleGaugeChange = useCallback((patch: Parameters<typeof updateGaugeOptions>[2]) => {
    commitDocument(updateGaugeOptions(documentRef.current, stateRef.current.selectedElementId ?? '', patch));
  }, [commitDocument]);
  const handleBarChange = useCallback((patch: Parameters<typeof updateBarOptions>[2]) => {
    commitDocument(updateBarOptions(documentRef.current, stateRef.current.selectedElementId ?? '', patch));
  }, [commitDocument]);

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
          <div className={styles.transferControls} data-testid="display-transfer-controls">
            <button type="button" title="Exportar Display" aria-label="Exportar Display" className={styles.iconButton} data-testid="display-export" onClick={handleExport}>
              <ExportIcon />
            </button>
            <button type="button" title="Importar Display" aria-label="Importar Display" className={styles.iconButton} data-testid="display-import" disabled={!onChange} onClick={() => importInputRef.current?.click()}>
              <ImportIcon />
            </button>
            <input ref={importInputRef} type="file" accept="application/json,.json,.pims-vision.json" data-testid="display-import-input" className={styles.fileInput} onChange={handleImportFile} />
          </div>
        </div>
        {mode === 'edit' && showToolbar && (
          <div className={styles.toolbar} data-testid="display-editor-toolbar">
            <div className={styles.toolbarGroup} aria-label="Histórico">
              <button type="button" title="Desfazer" className={styles.iconButton} data-testid="display-undo" aria-label="Desfazer" disabled={!hasUndo(historyRef.current)} onClick={handleUndo}><UndoIcon /></button>
              <button type="button" title="Refazer" className={styles.iconButton} data-testid="display-redo" aria-label="Refazer" disabled={!hasRedo(historyRef.current)} onClick={handleRedo}><RedoIcon /></button>
            </div>
            <span className={styles.toolbarDivider} aria-hidden="true" />
            <div className={styles.toolbarGroup} aria-label="Símbolos">
              <button
                type="button"
                title="Adicionar tag à Trend selecionada"
                aria-label="Adicionar tag à Trend selecionada"
                className={styles.addTrendSeriesButton}
                data-testid="display-add-tag-to-selected-trend"
                disabled={!selectedTrend || !createPiPointBinding(selectedPiPoint ?? {})}
                onClick={handleAddPiPointToSelectedTrend}
              ><AddTagIcon /><span>Adicionar tag</span></button>
              <button type="button" title="Inserir retângulo" aria-label="Inserir retângulo" className={styles.iconButton} data-testid="display-insert-rectangle" onClick={handleInsertRectangle}><RectangleIcon /></button>
              <button type="button" title="Inserir Value" aria-label="Inserir Value" className={styles.iconButton} data-testid="display-insert-value" disabled={!createPiPointBinding(selectedPiPoint ?? {})} onClick={handleInsertValue}><ValueIcon /></button>
              <button type="button" title="Inserir Gauge" aria-label="Inserir Gauge" className={styles.iconButton} data-testid="display-insert-gauge" onClick={handleInsertGauge}><GaugeIcon /></button>
              <button type="button" title="Inserir Barra" aria-label="Inserir Barra" className={styles.iconButton} data-testid="display-insert-bar" onClick={handleInsertBar}><BarIcon /></button>
              <button type="button" title="Inserir Trend" aria-label="Inserir Trend" className={styles.iconButton} data-testid="display-insert-trend" disabled={!createPiPointBinding(selectedPiPoint ?? {})} onClick={handleInsertTrend}><TrendIcon /></button>
            </div>
          </div>
        )}
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
            onSelect={handleSelect}
            onStartDrag={handleStartDrag}
            onStartResize={handleStartResize}
            onPointerMove={handlePointerMove}
            onPointerEnd={handlePointerEnd}
            loadValue={loadValue}
            loadValues={loadValues}
            loadTrend={loadTrend}
            loadRecordedTrend={loadRecordedTrend}
            trendRefreshKey={trendRefreshKey}
            trendTimeRange={trendTimeRange}
          />
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
      </div>
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
): PiPointDragPreview {
  const binding = createPiPointBinding(pointResult);
  const point = binding ? getDropPoint(svg, clientX, clientY, document) : undefined;
  const prototype = binding ? createDropPreviewElement(symbolType, binding, document) : undefined;
  const targetTrend = trendAtClientPoint ?? (point ? findTrendAtPoint(document, point) : undefined);
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
  `,
  header: css`
    display: flex;
    flex-direction: column;
    flex: 0 0 76px;
    min-height: 76px;
    border-bottom: 1px solid #1f334a;
    background: #314a67;
  `,
  headerPrimary: css`
    flex: 0 0 38px;
    height: 38px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1.25)};
    padding: 0 ${theme.spacing(1.5)};
    min-width: 0;
    color: #f1f4f8;
    background: #314a67;
  `,
  displayLabel: css`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 36%;
  `,
  displayLabelPrefix: css`
    color: #e2e8ef;
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
    width: 32px;
    height: 30px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: #dbe4ee;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  `,
  modeButtonActive: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 30px;
    padding: 0;
    border: 1px solid #e5a03d;
    border-radius: 0;
    background: #3c5c7e;
    color: #ffffff;
    cursor: pointer;
  `,
  toolbar: css`
    flex: 0 0 38px;
    height: 38px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    overflow-x: auto;
    padding: 0 ${theme.spacing(1.5)};
    background: #405a73;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
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
    height: 30px;
    flex: 0 0 auto;
    padding: 0 9px;
    border: 1px solid rgba(110, 159, 255, 0.72);
    border-radius: 0;
    background: rgba(51, 91, 135, 0.46);
    color: #e8f1fb;
    cursor: pointer;
    font-size: 12px;

    &:hover:not(:disabled) {
      background: rgba(70, 120, 175, 0.7);
      border-color: #9bc2ff;
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
    background: rgba(222, 232, 241, 0.36);
  `,
  transferControls: css`
    display: flex;
    gap: 3px;
    margin-left: auto;
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
    color: #ffffff;
    font-size: 13px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  iconButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 30px;
    flex: 0 0 32px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: #e2e9f0;
    cursor: pointer;

    &:disabled {
      cursor: default;
      opacity: 0.35;
    }

    &:hover:not(:disabled) {
      border-color: rgba(255, 255, 255, 0.52);
      background: rgba(255, 255, 255, 0.11);
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
    background: #1f1f1f;

    & > svg {
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
    }
  `,
  surfaceWrapperDragOver: css`
    box-shadow: inset 0 0 0 3px #e59b37;
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

function AddTagIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 12.4 11.4 4H20v8.6L11.6 21 3 12.4Z" /><circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" /><path d="M18 15v6M15 18h6" /></svg>;
}

function RedoIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 7 5 5-5 5" /><path d="M19 12h-8a6 6 0 0 0-6 6" /></svg>;
}

function RectangleIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="6" width="16" height="12" /><path d="M7 9h10M7 15h10" opacity="0.45" /></svg>;
}

function ValueIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" /><path d="M8 9h8M8 12h8M8 15h5" /></svg>;
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
