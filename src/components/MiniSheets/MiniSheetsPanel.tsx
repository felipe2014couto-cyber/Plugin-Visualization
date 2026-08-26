import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  searchPiPointsWithStatus,
  getPiPointCurrentValue,
  getPiTrendsRecordedHistoryForRange,
  getPiTrendsPreviewForRange,
  type PiPointSearchResult,
} from '../../pi/piDataSource';
import { createPiPointBinding, type PiPointBinding } from '../../pi/piPointBinding';
import {
  colIndexToLetter,
  formatCellAddress,
  parseCellAddress,
  parseRangeAddresses,
  parseFormula,
  evaluateMathExpression,
  evaluateAggregate,
  resolveParameter,
  type CellCoord,
} from './miniSheetFormula';
import { parsePiTime, formatDateTime } from './miniSheetTime';
import { PiDataLinkToolbar, type PiDataLinkFunctionType } from './PiDataLinkToolbar';
import { PiDataLinkFunctionDialog } from './PiDataLinkFunctionDialog';
import { MiniSheetsSipDialog } from './MiniSheetsSipDialog';
import type { OracleQueryResponse } from '../SqlQuery/oracleApi';
import {
  SheetRange,
  formatRangeAddress,
  isCellInsideRanges,
  isColumnSelected,
  isRowSelected,
  normalizeRange,
  rangeFromCells,
  rangeFromColumns,
  rangeFromRows,
  rangeSelectAll,
} from './miniSheetRange';
import {
  CellFormat,
  ClipboardCell,
  MiniSheetClipboard,
  calculateAutofillCells,
  formatDisplayNumber,
  matrixToTsv,
  shiftFormulaReferences,
} from './miniSheetOperations';

import {
  MiniSheetsDocument,
  deserializeMiniSheets,
  serializeMiniSheets,
} from './miniSheetsDocument';

import {
  MiniSheetsHistory,
  createMiniSheetsHistory,
  commitMiniSheetsHistory,
  undoMiniSheetsHistory,
  redoMiniSheetsHistory,
  canUndoMiniSheetsHistory,
  canRedoMiniSheetsHistory,
} from './miniSheetsHistory';

export interface SipOriginInfo {
  sql: string;
  maxRows?: number;
  targetCell: string;
  includeHeaders?: boolean;
  originCoord: CellCoord;
}

export interface CellData {
  rawValue: string; // The formula or raw entered string, e.g. '=PICurrVal("TAG")'
  displayValue: string; // The computed result to show
  spilledFrom?: string; // If this cell is populated by a spill from another cell address (e.g. 'A1')
  spillTargetAddresses?: string[]; // If this cell generated a spill across other cell addresses
  format?: CellFormat; // Formatting: bold, italic, textColor, backgroundColor, horizontalAlign, decimalPlaces
  sipOrigin?: SipOriginInfo;
}

const TOTAL_COLS = 20; // A to T
const TOTAL_ROWS = 100_000; // Limite máximo de linhas
const INITIAL_VISIBLE_ROWS = 50;

function filterPiDataPoints<T extends { value: number | string }>(points: T[], expression?: string): T[] {
  const normalized = expression?.trim();
  if (!normalized) {
    return points;
  }
  const match = /^(?:value|valor)?\s*(>=|<=|<>|!=|==|=|>|<)\s*(-?\d+(?:[.,]\d+)?)$/i.exec(normalized);
  if (!match) {
    return points;
  }
  const expected = Number(match[2].replace(',', '.'));
  return points.filter((point) => {
    const value = Number(point.value);
    if (!Number.isFinite(value)) {
      return false;
    }
    switch (match[1]) {
      case '>': return value > expected;
      case '>=': return value >= expected;
      case '<': return value < expected;
      case '<=': return value <= expected;
      case '=': case '==': return value === expected;
      case '<>': case '!=': return value !== expected;
      default: return true;
    }
  });
}

type DragMode = 'cells' | 'cols' | 'rows' | 'autofill' | 'formula';

export interface MiniSheetsPanelProps {
  dataSourceSrv?: any;
  initialDocument?: MiniSheetsDocument;
  onChange?: (document: MiniSheetsDocument) => void;
  onOpenFunctionDialog?: (type: PiDataLinkFunctionType, formula: string, targetCell: string) => void;
  dataLinkMenuHostId?: string;
  dataLinkMenuActive?: boolean;
}

export interface PiDataLinkInfo {
  functionType: PiDataLinkFunctionType;
  formula?: string;
  targetCell: string;
  originCoord: CellCoord;
  sipQuery?: {
    sql: string;
    maxRows?: number;
    includeHeaders?: boolean;
  };
}

function getPiDataLinkInfoForCell(
  cellCoord: CellCoord,
  cellsMap: Map<string, CellData>
): PiDataLinkInfo | null {
  let cell = cellsMap.get(`${cellCoord.col},${cellCoord.row}`);
  let effectiveCoord = cellCoord;

  // If selecting the top of a column that is empty, inspect down the column for DataLink/SIP data
  if (!cell) {
    for (let r = 0; r < 200; r++) {
      const candidate = cellsMap.get(`${cellCoord.col},${r}`);
      if (candidate && (candidate.sipOrigin || candidate.spilledFrom || candidate.rawValue?.startsWith('='))) {
        cell = candidate;
        effectiveCoord = { col: cellCoord.col, row: r };
        break;
      }
    }
  }

  if (!cell) {
    return null;
  }

  let originCoord = effectiveCoord;
  let originCell = cell;
  if (cell.spilledFrom) {
    const parsedSpill = parseCellAddress(cell.spilledFrom);
    if (parsedSpill) {
      const parent = cellsMap.get(`${parsedSpill.col},${parsedSpill.row}`);
      if (parent) {
        originCoord = parsedSpill;
        originCell = parent;
      }
    }
  }

  // 1. Check SIP origin
  const sip = originCell.sipOrigin || cell.sipOrigin;
  if (sip) {
    return {
      functionType: 'SIPQuery',
      targetCell: sip.targetCell,
      originCoord: sip.originCoord || originCoord,
      sipQuery: {
        sql: sip.sql,
        maxRows: sip.maxRows,
        includeHeaders: sip.includeHeaders,
      },
    };
  }

  const raw = originCell.rawValue?.trim() ?? '';
  if (!raw.startsWith('=')) {
    return null;
  }
  const parsed = parseFormula(raw);
  if (typeof parsed !== 'object' || !('type' in parsed) || parsed.type === 'error') {
    return null;
  }
  let functionType: PiDataLinkFunctionType | null = null;
  if (parsed.type === 'pi_curr_val') functionType = 'PICurrVal';
  else if (parsed.type === 'pi_arc_val') functionType = 'PIArcVal';
  else if (parsed.type === 'pi_comp_dat') functionType = 'PICompDat';
  else if (parsed.type === 'pi_samp_dat') functionType = 'PISampDat';
  else if (parsed.type === 'pi_time_dat') functionType = 'PITimeDat';
  else if (parsed.type === 'pi_adv_calc_val') functionType = 'PIAdvCalcVal';
  else if (parsed.type === 'pi_time_filter') functionType = 'PITimeFilter';

  if (!functionType) {
    return null;
  }
  return {
    functionType,
    formula: raw,
    targetCell: formatCellAddress(originCoord),
    originCoord,
  };
}

export function MiniSheetsPanel({
  dataSourceSrv,
  initialDocument,
  onChange,
  onOpenFunctionDialog,
  dataLinkMenuHostId,
  dataLinkMenuActive = false,
}: MiniSheetsPanelProps) {
  const styles = useStyles2(getStyles);

  // Selection state
  const [activeCell, setActiveCell] = useState<CellCoord>({ col: 0, row: 0 });
  const [anchorCell, setAnchorCell] = useState<CellCoord>({ col: 0, row: 0 });
  const anchorCellRef = useRef<CellCoord>({ col: 0, row: 0 });
  anchorCellRef.current = anchorCell;

  const [ranges, setRanges] = useState<SheetRange[]>([
    { startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
  ]);

  const [cells, setCells] = useState<Map<string, CellData>>(() => {
    const deserialized = deserializeMiniSheets(initialDocument);
    return deserialized.cells;
  });
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS);
  const [history, setHistory] = useState<MiniSheetsHistory>(() =>
    createMiniSheetsHistory(initialDocument)
  );
  const historyRef = useRef(history);
  historyRef.current = history;
  const [formulaBarText, setFormulaBarText] = useState('');
  const [editingCellCoord, setEditingCellCoord] = useState<CellCoord | null>(null);
  const [editingCellText, setEditingCellText] = useState('');
  const [formulaEditMode, setFormulaEditMode] = useState(false);
  const [formulaTargetCell, setFormulaTargetCell] = useState<CellCoord | null>(null);
  const [formulaReferenceRange, setFormulaReferenceRange] = useState<SheetRange | null>(null);
  const formulaTargetRef = useRef<CellCoord | null>(null);
  const formulaSessionRef = useRef(false);
  const formulaCursorRef = useRef({ start: 0, end: 0 });
  const formulaPointerRef = useRef(false);
  const formulaPointerHandledRef = useRef(false);
  const formulaRangeAnchorRef = useRef<CellCoord | null>(null);
  const formulaBarInputRef = useRef<HTMLInputElement>(null);
  const inlineFormulaInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [activeDataLinkDialog, setActiveDataLinkDialog] = useState<PiDataLinkFunctionType | null>(null);
  const [dataLinkInitialFormula, setDataLinkInitialFormula] = useState<string | undefined>(undefined);
  const [dataLinkTargetCell, setDataLinkTargetCell] = useState<string | undefined>(undefined);
  const [sipSessionId, setSipSessionId] = useState<string | null>(null);
  const [sipSql, setSipSql] = useState<string | undefined>(undefined);
  const [sipMaxRows, setSipMaxRows] = useState<number | undefined>(undefined);
  const [sipIncludeHeaders, setSipIncludeHeaders] = useState<boolean | undefined>(undefined);
  const lastAutoOpenedOriginKeyRef = useRef<string | null>(null);
  const [dataLinkMenuHost, setDataLinkMenuHost] = useState<HTMLElement | null>(null);

  // Auto-open or sync PiDataLink / SIP configuration dialog when selecting a cell with calculation/spill/SIP
  useEffect(() => {
    const piInfo = getPiDataLinkInfoForCell(activeCell, cells);
    if (piInfo) {
      const originKey = `${piInfo.originCoord.col},${piInfo.originCoord.row}`;
      if (lastAutoOpenedOriginKeyRef.current !== originKey) {
        lastAutoOpenedOriginKeyRef.current = originKey;
        setActiveDataLinkDialog(piInfo.functionType);
        if (piInfo.functionType === 'SIPQuery' && piInfo.sipQuery) {
          if (piInfo.sipQuery.sql) setSipSql(piInfo.sipQuery.sql);
          if (piInfo.sipQuery.maxRows) setSipMaxRows(piInfo.sipQuery.maxRows);
          if (piInfo.sipQuery.includeHeaders !== undefined) setSipIncludeHeaders(piInfo.sipQuery.includeHeaders);
          setDataLinkTargetCell(piInfo.targetCell);
        } else {
          setDataLinkInitialFormula(piInfo.formula);
          setDataLinkTargetCell(piInfo.targetCell);
        }
      }
    } else {
      lastAutoOpenedOriginKeyRef.current = null;
    }
  }, [activeCell, cells]);

  useEffect(() => {
    setDataLinkMenuHost(dataLinkMenuActive && dataLinkMenuHostId
      ? globalThis.document?.getElementById(dataLinkMenuHostId) ?? null
      : null);
  }, [dataLinkMenuActive, dataLinkMenuHostId]);

  // Internal clipboard buffer
  const [internalClipboard, setInternalClipboard] = useState<MiniSheetClipboard | null>(null);

  // Autofill state
  const [autofillRange, setAutofillRange] = useState<SheetRange | null>(null);

  // Column widths state (column index -> width in px)
  const DEFAULT_COL_WIDTH = 100;
  const MIN_COL_WIDTH = 40;
  const [colWidths, setColWidths] = useState<Map<number, number>>(() => {
    const deserialized = deserializeMiniSheets(initialDocument);
    return deserialized.colWidths;
  });

  // Column resizing ref
  const resizingColRef = useRef<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmittedDocRef = useRef<MiniSheetsDocument | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mantém a grade inicialmente compacta, expandindo-a em blocos quando uma
  // fórmula, colagem ou documento carregado utiliza linhas além das visíveis.
  useEffect(() => {
    let highestRow = -1;
    cells.forEach((_cell, key) => {
      const [, row] = key.split(',').map(Number);
      if (Number.isInteger(row)) {
        highestRow = Math.max(highestRow, row);
      }
    });
    const requiredRow = Math.max(highestRow, activeCell.row);
    if (requiredRow < visibleRows) {
      return;
    }
    const requiredRows = Math.min(TOTAL_ROWS, Math.ceil((requiredRow + 1) / INITIAL_VISIBLE_ROWS) * INITIAL_VISIBLE_ROWS);
    setVisibleRows((current) => Math.max(current, requiredRows));
  }, [activeCell.row, cells, visibleRows]);

  const handleAddRow = useCallback(() => {
    setVisibleRows((current) => Math.min(TOTAL_ROWS, current + 1));
  }, []);

  // Emit updated MiniSheetsDocument when cells or colWidths change
  const notifyDocumentChange = useCallback(() => {
    if (resizingColRef.current) {
      return;
    }
    if (onChangeRef.current) {
      const doc = serializeMiniSheets(cellsRef.current, colWidthsRef.current, TOTAL_COLS, TOTAL_ROWS);
      lastEmittedDocRef.current = doc;
      onChangeRef.current(doc);
    }
  }, []);

  const getColWidth = useCallback((colIndex: number): number => {
    return colWidths.get(colIndex) ?? DEFAULT_COL_WIDTH;
  }, [colWidths]);

  // Handle Column Resize Pointer Down
  const handleColResizePointerDown = (colIndex: number, e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const currentWidth = getColWidth(colIndex);
    const startX = e.clientX ?? (e as any).pageX ?? 0;
    resizingColRef.current = {
      colIndex,
      startX,
      startWidth: currentWidth,
    };
    if ((e as React.PointerEvent).pointerId !== undefined && (e.target as HTMLElement).setPointerCapture) {
      try {
        (e.target as HTMLElement).setPointerCapture((e as React.PointerEvent).pointerId);
      } catch {}
    }
  };

  // Pointer drag tracking
  const dragModeRef = useRef<DragMode | null>(null);
  const dragAnchorRef = useRef<{ col: number; row: number } | null>(null);
  const isAppendingRangeRef = useRef<boolean>(false);
  const baseRangesRef = useRef<SheetRange[]>([]);

  const activeKey = `${activeCell.col},${activeCell.row}`;
  const addressLabel = ranges.length > 0
    ? formatRangeAddress(ranges[ranges.length - 1], TOTAL_COLS, visibleRows)
    : formatCellAddress(activeCell);

  const beginFormulaEdit = useCallback((initialText?: string, target: CellCoord = activeCell) => {
    const text = initialText ?? formulaBarText;
    formulaTargetRef.current = target;
    formulaSessionRef.current = text.trimStart().startsWith('=');
    setFormulaTargetCell(target);
    setFormulaEditMode(text.trimStart().startsWith('='));
    setFormulaReferenceRange(null);
  }, [activeCell, formulaBarText]);

  const insertFormulaReference = useCallback((range: SheetRange) => {
    const target = formulaTargetRef.current ?? activeCell;
    const reference = formatRangeAddress(range, TOTAL_COLS, TOTAL_ROWS);
    const source = editingCellCoord && editingCellCoord.col === target.col && editingCellCoord.row === target.row
      ? editingCellText
      : formulaBarText;
    const cursor = formulaCursorRef.current;
    const start = Math.max(0, Math.min(cursor.start, source.length));
    const end = Math.max(start, Math.min(cursor.end, source.length));
    const next = `${source.slice(0, start)}${reference}${source.slice(end)}`;
    const nextCursor = start + reference.length;
    formulaCursorRef.current = { start: nextCursor, end: nextCursor };
    setFormulaEditMode(true);
    setFormulaReferenceRange(range);
    setFormulaBarText(next);
    if (editingCellCoord && editingCellCoord.col === target.col && editingCellCoord.row === target.row) {
      setEditingCellText(next);
    }
    setTimeout(() => {
      if (!formulaSessionRef.current) return;
      const input = editingCellCoord && editingCellCoord.col === target.col && editingCellCoord.row === target.row
        ? inlineFormulaInputRef.current
        : formulaBarInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }, [activeCell, editingCellCoord, editingCellText, formulaBarText]);

  // Sync formula bar when active cell changes (unless currently editing formula bar)
  useEffect(() => {
    const currentCell = cells.get(activeKey);
    setFormulaBarText(currentCell?.rawValue ?? '');
  }, [activeKey, cells]);



  /**
   * Helper to resolve a PI Point by name using existing searchPiPointsWithStatus with timeout safety
   */
  const resolvePiPointBindingByName = useCallback(
    async (pointName: string): Promise<PiPointBinding | null> => {
      const cleanName = pointName.trim();
      if (!cleanName) {
        return null;
      }
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('PI search timeout')), 5000)
        );
        const searchPromise = async (): Promise<PiPointBinding | null> => {
          const response = await searchPiPointsWithStatus(cleanName, dataSourceSrv);
          const results = response.results ?? [];
          if (results.length === 0) {
            return createPiPointBinding({ name: cleanName, path: cleanName, dataSourceUid: '' }) ?? null;
          }
          const exact = results.find(
            (p: PiPointSearchResult) => p.name.trim().toLowerCase() === cleanName.toLowerCase(),
          );
          const target = exact ?? results[0];
          return createPiPointBinding(target) ?? null;
        };
        return await Promise.race([searchPromise(), timeoutPromise]);
      } catch (err) {
        return createPiPointBinding({ name: cleanName, path: cleanName, dataSourceUid: '' }) ?? null;
      }
    },
    [dataSourceSrv],
  );

  /**
   * Evaluates all dependencies or regular math/aggregate formulas.
   */
  const evaluateStaticFormulas = useCallback((currentMap: Map<string, CellData>) => {
    const nextMap = new Map(currentMap);
    const getCellValue = (coord: CellCoord): number | string | undefined => {
      const cell = nextMap.get(`${coord.col},${coord.row}`);
      return cell?.displayValue;
    };

    let changed = false;
    // Iterate over all entries in the map
    nextMap.forEach((cellData, key) => {
      if (cellData.spilledFrom) {
        return;
      }
      const raw = cellData.rawValue?.trim() ?? '';
      if (raw.startsWith('=')) {
        const parsed = parseFormula(raw);
        if (typeof parsed === 'object' && 'type' in parsed) {
          if (parsed.type === 'math_expression') {
            const res = evaluateMathExpression(parsed.expression, getCellValue, TOTAL_COLS, TOTAL_ROWS);
            const newDisplay = res.status === 'success' ? String(res.value) : res.error;
            if (newDisplay !== cellData.displayValue) {
              nextMap.set(key, { ...cellData, displayValue: newDisplay });
              changed = true;
            }
          } else if (parsed.type === 'aggregate') {
            const res = evaluateAggregate(parsed.func, parsed.referencedCells, getCellValue, TOTAL_COLS, TOTAL_ROWS);
            const newDisplay = res.status === 'success' ? String(res.value) : res.error;
            if (newDisplay !== cellData.displayValue) {
              nextMap.set(key, { ...cellData, displayValue: newDisplay });
              changed = true;
            }
          }
        }
      }
    });

    return { nextMap, changed };
  }, []);

  /**
   * Calculates a single cell and updates state, handling PI and Spill logic.
   */
  const computeCell = useCallback(
    async (coord: CellCoord, rawValue: string, baseMap?: Map<string, CellData>) => {
      const key = `${coord.col},${coord.row}`;
      const address = formatCellAddress(coord);
      const trimmed = rawValue.trim();

      const next = new Map(baseMap ?? cellsRef.current);
      const prevCell = next.get(key);
      if (prevCell?.spillTargetAddresses) {
        prevCell.spillTargetAddresses.forEach((targetAddr) => {
          const c = parseCellAddress(targetAddr);
          if (c) {
            const targetKey = `${c.col},${c.row}`;
            const tCell = next.get(targetKey);
            if (tCell?.spilledFrom === address) {
              next.delete(targetKey);
            }
          }
        });
      }

      let finalMapToCommit: Map<string, CellData>;
      if (!trimmed) {
        const existing = next.get(key);
        if (existing?.format) {
          next.set(key, { rawValue: '', displayValue: '', format: existing.format });
        } else {
          next.delete(key);
        }
        finalMapToCommit = evaluateStaticFormulas(next).nextMap;
      } else {
        const existing = next.get(key);
        next.set(key, {
          rawValue,
          displayValue: 'Carregando...',
          format: existing?.format,
        });
        finalMapToCommit = evaluateStaticFormulas(next).nextMap;
      }

      setCells(finalMapToCommit);
      cellsRef.current = finalMapToCommit;
      commitStateToHistory(finalMapToCommit);

      if (!trimmed) {
        return;
      }

      const parsed = parseFormula(rawValue);

      // Handle simple literals
      if (parsed.type === 'literal_number') {
        setCells((prev) => {
          const next = new Map(prev);
          const existing = next.get(key);
          next.set(key, { rawValue, displayValue: String(parsed.value), format: existing?.format });
          return evaluateStaticFormulas(next).nextMap;
        });
        return;
      }

      if (parsed.type === 'literal_string') {
        setCells((prev) => {
          const next = new Map(prev);
          const existing = next.get(key);
          next.set(key, { rawValue, displayValue: parsed.value, format: existing?.format });
          return evaluateStaticFormulas(next).nextMap;
        });
        return;
      }

      if (parsed.type === 'error') {
        setCells((prev) => {
          const next = new Map(prev);
          const existing = next.get(key);
          next.set(key, { rawValue, displayValue: parsed.error, format: existing?.format });
          return next;
        });
        return;
      }

      if (parsed.type === 'math_expression' || parsed.type === 'aggregate') {
        setCells((prev) => {
          const next = new Map(prev);
          const existing = next.get(key);
          next.set(key, { rawValue, displayValue: 'Carregando...', format: existing?.format });
          return evaluateStaticFormulas(next).nextMap;
        });
        return;
      }

      const getCellString = (c: CellCoord) => {
        const k = `${c.col},${c.row}`;
        return cellsRef.current.get(k)?.displayValue ?? cellsRef.current.get(k)?.rawValue;
      };

      // Handle PI Formulas
      if (parsed.type === 'pi_curr_val') {
        try {
          const resolvedTag = resolveParameter(parsed.tag, getCellString);
          const binding = await resolvePiPointBindingByName(resolvedTag);
          if (!binding) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: '#PI!', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const valResult = await getPiPointCurrentValue(binding, dataSourceSrv);
          let display = '#PI!';
          if (valResult && valResult.value !== undefined && valResult.value !== null) {
            display = String(valResult.value);
          }
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            const timestampPosition = parsed.timestampPosition ?? 'none';
            const hasTimestamp = timestampPosition !== 'none' && Boolean(valResult?.timestamp);
            const timestampMs = valResult?.timestamp ? Date.parse(valResult.timestamp) : NaN;
            const timestampDisplay = hasTimestamp
              ? Number.isFinite(timestampMs)
                ? formatDateTime(timestampMs)
                : String(valResult?.timestamp)
              : '';

            if (hasTimestamp && display !== '#PI!') {
              const spillCoord = timestampPosition === 'left'
                ? { col: coord.col + 1, row: coord.row }
                : { col: coord.col, row: coord.row + 1 };
              const spillKey = `${spillCoord.col},${spillCoord.row}`;
              const spillCell = next.get(spillKey);
              const outsideGrid = spillCoord.col >= TOTAL_COLS || spillCoord.row >= TOTAL_ROWS;
              const occupied = Boolean(spillCell && (spillCell.rawValue || spillCell.spilledFrom));

              if (outsideGrid || occupied) {
                next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
                return evaluateStaticFormulas(next).nextMap;
              }

              next.set(key, {
                rawValue,
                displayValue: timestampDisplay,
                spillTargetAddresses: [formatCellAddress(spillCoord)],
                format: existing?.format,
              });
              next.set(spillKey, {
                rawValue: '',
                displayValue: display,
                spilledFrom: address,
              });
            } else {
              next.set(key, { rawValue, displayValue: display, format: existing?.format });
            }
            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            next.set(key, { rawValue, displayValue: '#PI!', format: existing?.format });
            return evaluateStaticFormulas(next).nextMap;
          });
        }
        return;
      }

      if (parsed.type === 'pi_arc_val') {
        try {
          const resolvedTag = resolveParameter(parsed.tag, getCellString);
          const resolvedTime = resolveParameter(parsed.timeExpression, getCellString);
          const binding = await resolvePiPointBindingByName(resolvedTag);
          const targetTime = parsePiTime(resolvedTime);
          if (!binding || targetTime === undefined) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: targetTime === undefined ? '#FORMULA!' : '#PI!', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          // Use recorded history in a window around target time
          const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
          let results = await getPiTrendsRecordedHistoryForRange(
            [binding],
            { from: targetTime - 3600_000, to: targetTime + 3600_000 },
            dataSourceSrv
          );
          let result = results[bindingKey];

          if (!result || result.status !== 'success' || !result.series || result.series.points.length === 0) {
            results = await getPiTrendsRecordedHistoryForRange(
              [binding],
              { from: targetTime - 24 * 3600_000, to: targetTime + 60_000 },
              dataSourceSrv
            );
            result = results[bindingKey];
          }

          let display = '#PI!';
          let resultTimestamp: number | undefined = targetTime;
          const recoveryMode = (parsed.mode ?? 'interpolated').toLowerCase();

          if (result && result.status === 'success' && result.series && result.series.points.length > 0) {
            const points = [...result.series.points].sort((a, b) => a.time - b.time);

            if (recoveryMode === 'exact') {
              const exactPt = points.find((p) => Math.abs(p.time - targetTime) < 1000);
              if (exactPt && exactPt.value !== undefined && exactPt.value !== null) {
                display = String(exactPt.value);
                resultTimestamp = exactPt.time;
              }
            } else if (recoveryMode === 'at or before') {
              const beforePts = points.filter((p) => p.time <= targetTime);
              const lastBefore = beforePts.length > 0 ? beforePts[beforePts.length - 1] : points[0];
              if (lastBefore && lastBefore.value !== undefined && lastBefore.value !== null) {
                display = String(lastBefore.value);
                resultTimestamp = lastBefore.time;
              }
            } else if (recoveryMode === 'at or after') {
              const afterPts = points.filter((p) => p.time >= targetTime);
              const firstAfter = afterPts.length > 0 ? afterPts[0] : points[points.length - 1];
              if (firstAfter && firstAfter.value !== undefined && firstAfter.value !== null) {
                display = String(firstAfter.value);
                resultTimestamp = firstAfter.time;
              }
            } else {
              // Interpolated (default)
              const exactPt = points.find((p) => p.time === targetTime);
              if (exactPt && exactPt.value !== undefined && exactPt.value !== null) {
                display = String(exactPt.value);
                resultTimestamp = targetTime;
              } else {
                let pBefore: { time: number; value: number } | undefined;
                let pAfter: { time: number; value: number } | undefined;
                for (const p of points) {
                  if (p.time <= targetTime) {
                    pBefore = p;
                  }
                  if (p.time >= targetTime && !pAfter) {
                    pAfter = p;
                  }
                }

                if (pBefore && pAfter && pBefore.time !== pAfter.time) {
                  const fraction = (targetTime - pBefore.time) / (pAfter.time - pBefore.time);
                  const interpolatedVal = pBefore.value + (pAfter.value - pBefore.value) * fraction;
                  display = String(interpolatedVal);
                } else if (pBefore) {
                  display = String(pBefore.value);
                } else if (pAfter) {
                  display = String(pAfter.value);
                } else {
                  display = String(points[points.length - 1].value);
                }
                resultTimestamp = targetTime;
              }
            }
          }

          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            const timestampPosition = parsed.timestampPosition ?? 'none';
            if (timestampPosition !== 'none' && resultTimestamp !== undefined && display !== '#PI!') {
              const spillCoord = timestampPosition === 'left'
                ? { col: coord.col + 1, row: coord.row }
                : { col: coord.col, row: coord.row + 1 };
              const spillCell = next.get(`${spillCoord.col},${spillCoord.row}`);
              if (spillCoord.col >= TOTAL_COLS || spillCoord.row >= TOTAL_ROWS || Boolean(spillCell && (spillCell.rawValue || spillCell.spilledFrom))) {
                next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
                return evaluateStaticFormulas(next).nextMap;
              }
              next.set(key, { rawValue, displayValue: formatDateTime(resultTimestamp), spillTargetAddresses: [formatCellAddress(spillCoord)], format: existing?.format });
              next.set(`${spillCoord.col},${spillCoord.row}`, { rawValue: '', displayValue: display, spilledFrom: address });
            } else {
              next.set(key, { rawValue, displayValue: display, format: existing?.format });
            }
            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            next.set(key, { rawValue, displayValue: '#PI!', format: existing?.format });
            return evaluateStaticFormulas(next).nextMap;
          });
        }
        return;
      }

      if (parsed.type === 'pi_comp_dat' || parsed.type === 'pi_samp_dat') {
        try {
          const resolvedTag = resolveParameter(parsed.tag, getCellString);
          const resolvedStart = resolveParameter(parsed.startTime, getCellString);
          const resolvedEnd = resolveParameter(parsed.endTime, getCellString);
          const binding = await resolvePiPointBindingByName(resolvedTag);
          const fromTime = parsePiTime(resolvedStart);
          const toTime = parsePiTime(resolvedEnd);

          if (!binding || fromTime === undefined || toTime === undefined || fromTime >= toTime) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, {
                rawValue,
                displayValue: fromTime === undefined || toTime === undefined ? '#FORMULA!' : '#PI!',
                format: existing?.format,
              });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const range = { from: fromTime, to: toTime };
          let points: Array<{ time: number; value: number | string }> = [];

          if (parsed.type === 'pi_comp_dat') {
            const results = await getPiTrendsRecordedHistoryForRange([binding], range, dataSourceSrv);
            const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
            const res = results[bindingKey];
            if (res && res.status === 'success' && res.series) {
              const limit = parsed.maxCount ?? 500;
              points = res.series.points.slice(0, Math.min(limit, 500));
            }
          } else {
            const results = await getPiTrendsPreviewForRange([binding], range, dataSourceSrv);
            const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
            const res = results[bindingKey];
            if (res && res.status === 'success' && res.series) {
              points = res.series.points.slice(0, 500);
            }
          }

          points = filterPiDataPoints(points, parsed.options?.filterExpression);
          if (parsed.type === 'pi_comp_dat' && parsed.reverseTime) {
            points = [...points].reverse();
          }

          if (points.length === 0) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: 'Sem dados', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const showTs = parsed.showTimestamp !== false;
          const rowOrientation = parsed.options?.orientation === 'row';
          const neededEndCol = coord.col + (rowOrientation ? points.length - 1 : (showTs ? 1 : 0));
          const neededEndRow = coord.row + (rowOrientation ? (showTs ? 1 : 0) : points.length - 1);

          if (neededEndCol >= TOTAL_COLS || neededEndRow >= TOTAL_ROWS) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
              return next;
            });
            return;
          }

          let hasCollision = false;
          setCells((prev) => {
            for (let r = coord.row; r <= neededEndRow; r++) {
              for (let c = coord.col; c <= neededEndCol; c++) {
                if (r === coord.row && c === coord.col) {
                  continue;
                }
                const existing = prev.get(`${c},${r}`);
                if (existing && !existing.spilledFrom && (existing.rawValue?.trim() || existing.displayValue?.trim())) {
                  hasCollision = true;
                  break;
                }
              }
              if (hasCollision) break;
            }

            const next = new Map(prev);
            const existingOrigin = next.get(key);
            if (hasCollision) {
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existingOrigin?.format });
              return next;
            }

            const spillTargets: string[] = [];
            const writeCell = (target: CellCoord, displayValue: string) => {
              const targetKey = `${target.col},${target.row}`;
              const origin = target.col === coord.col && target.row === coord.row;
              if (!origin) {
                spillTargets.push(formatCellAddress(target));
              }
              next.set(targetKey, origin
                ? { rawValue, displayValue, spillTargetAddresses: [], format: existingOrigin?.format }
                : { rawValue: '', displayValue, spilledFrom: address });
            };

            points.forEach((point, index) => {
              const base = rowOrientation
                ? { col: coord.col + index, row: coord.row }
                : { col: coord.col, row: coord.row + index };
              if (showTs) {
                writeCell(base, formatDateTime(point.time));
                writeCell(rowOrientation
                  ? { col: base.col, row: base.row + 1 }
                  : { col: base.col + 1, row: base.row }, String(point.value));
              } else {
                writeCell(base, String(point.value));
              }
            });

            const originCell = next.get(key);
            if (originCell) {
              originCell.spillTargetAddresses = spillTargets;
            }

            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            next.set(key, { rawValue, displayValue: '#PI!', format: existing?.format });
            return evaluateStaticFormulas(next).nextMap;
          });
        }
        return;
      }

      if (parsed.type === 'pi_time_dat') {
        try {
          const resolvedTag = resolveParameter(parsed.tag, getCellString);
          const binding = await resolvePiPointBindingByName(resolvedTag);
          const rangeAddresses = parseRangeAddresses(parsed.timestampsRange);
          if (!binding || rangeAddresses.length === 0) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: rangeAddresses.length === 0 ? '#REF!' : '#PI!', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const timestampsWithRow: Array<{ time: number; rowIdx: number }> = [];
          rangeAddresses.forEach((c, idx) => {
            const tStr = getCellString(c);
            if (tStr) {
              const t = parsePiTime(tStr);
              if (t !== undefined) {
                timestampsWithRow.push({ time: t, rowIdx: idx });
              }
            }
          });

          if (timestampsWithRow.length === 0) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: 'Sem dados', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const minTime = Math.min(...timestampsWithRow.map((t) => t.time));
          const maxTime = Math.max(...timestampsWithRow.map((t) => t.time));
          const range = { from: minTime - 60_000, to: maxTime + 60_000 };

          const results = parsed.mode === 'Actual'
            ? await getPiTrendsRecordedHistoryForRange([binding], range, dataSourceSrv)
            : await getPiTrendsPreviewForRange([binding], range, dataSourceSrv);
          const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
          const res = results[bindingKey];
          const pts = (res && res.status === 'success' && res.series) ? res.series.points : [];

          const timedPoints: Array<{ time: number; value: number | string }> = timestampsWithRow.map((item) => {
            if (pts.length === 0) return { time: item.time, value: '#PI!' };
            let closest = pts[0];
            let minDiff = Math.abs(pts[0].time - item.time);
            for (let i = 1; i < pts.length; i++) {
              const diff = Math.abs(pts[i].time - item.time);
              if (diff < minDiff) {
                minDiff = diff;
                closest = pts[i];
              }
            }
            return { time: item.time, value: closest.value };
          });

          const timedRowOrientation = parsed.options?.orientation === 'row';
          const neededEndRow = coord.row + (timedRowOrientation ? 0 : timedPoints.length - 1);
          const neededEndCol = coord.col + (timedRowOrientation ? timedPoints.length - 1 : 0);
          if (neededEndRow >= TOTAL_ROWS || neededEndCol >= TOTAL_COLS) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
              return next;
            });
            return;
          }

          let hasCollision = false;
          setCells((prev) => {
            for (let index = 1; index < timedPoints.length; index++) {
              const target = timedRowOrientation
                ? { col: coord.col + index, row: coord.row }
                : { col: coord.col, row: coord.row + index };
              const existing = prev.get(`${target.col},${target.row}`);
              if (existing && !existing.spilledFrom && (existing.rawValue?.trim() || existing.displayValue?.trim())) {
                hasCollision = true;
                break;
              }
            }
            const next = new Map(prev);
            const existingOrigin = next.get(key);
            if (hasCollision) {
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existingOrigin?.format });
              return next;
            }

            const spillTargets: string[] = [];
            const firstPt = timedPoints[0];
            next.set(key, {
              rawValue,
              displayValue: String(firstPt.value),
              spillTargetAddresses: [],
              format: existingOrigin?.format,
            });

            for (let i = 1; i < timedPoints.length; i++) {
              const pt = timedPoints[i];
              const tCoord = timedRowOrientation
                ? { col: coord.col + i, row: coord.row }
                : { col: coord.col, row: coord.row + i };
              const tKey = `${tCoord.col},${tCoord.row}`;
              const tAddr = formatCellAddress(tCoord);
              spillTargets.push(tAddr);
              next.set(tKey, {
                rawValue: '',
                displayValue: String(pt.value),
                spilledFrom: address,
              });
            }

            const originCell = next.get(key);
            if (originCell) {
              originCell.spillTargetAddresses = spillTargets;
            }
            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            next.set(key, { rawValue, displayValue: '#PI!', format: existing?.format });
            return evaluateStaticFormulas(next).nextMap;
          });
        }
        return;
      }

      if (parsed.type === 'pi_adv_calc_val') {
        try {
          const resolvedTag = resolveParameter(parsed.tag, getCellString);
          const resolvedStart = resolveParameter(parsed.startTime, getCellString);
          const resolvedEnd = resolveParameter(parsed.endTime, getCellString);
          const resolvedCalc = resolveParameter(parsed.calculation, getCellString) || 'Average';
          const resolvedInt = parsed.interval ? resolveParameter(parsed.interval, getCellString) : undefined;
          const conversionFactor = Number.isFinite(parsed.conversionFactor) ? (parsed.conversionFactor as number) : 1;

          const binding = await resolvePiPointBindingByName(resolvedTag);
          const fromTime = parsePiTime(resolvedStart);
          const toTime = parsePiTime(resolvedEnd);

          if (!binding || fromTime === undefined || toTime === undefined || fromTime >= toTime) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: fromTime === undefined || toTime === undefined ? '#FORMULA!' : '#PI!', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const computeSummary = (pts: Array<{ time: number; value: number | string }>): number | string => {
            const numPts = pts.map((p) => Number(p.value)).filter((v) => !isNaN(v));
            if (numPts.length === 0) return 'Sem dados';
            const calcType = resolvedCalc.toLowerCase();
            if (calcType.includes('min')) return Math.min(...numPts);
            if (calcType.includes('max')) return Math.max(...numPts);
            if (calcType.includes('tot')) return numPts.reduce((a, b) => a + b, 0);
            if (calcType.includes('count')) return numPts.length;
            if (calcType.includes('range')) return Math.max(...numPts) - Math.min(...numPts);
            if (calcType.includes('std')) {
              const mean = numPts.reduce((a, b) => a + b, 0) / numPts.length;
              const variance = numPts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numPts.length;
              return Math.sqrt(variance);
            }
            return numPts.reduce((a, b) => a + b, 0) / numPts.length;
          };

          const range = { from: fromTime, to: toTime };
          const results = await getPiTrendsRecordedHistoryForRange([binding], range, dataSourceSrv);
          const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
          const res = results[bindingKey];
          const allPoints = filterPiDataPoints(
            (res && res.status === 'success' && res.series) ? res.series.points : [],
            parsed.options?.filterExpression,
          );

          if (!resolvedInt || resolvedInt.trim() === '') {
            const rawSummary = computeSummary(allPoints);
            const summaryVal = typeof rawSummary === 'number' ? rawSummary * conversionFactor : rawSummary;
            const formattedVal = typeof summaryVal === 'number' ? summaryVal.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : String(summaryVal);
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: formattedVal, format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          let stepMs = 3600_000;
          const intMatch = /^(\d+)\s*([a-zA-Z]+)$/.exec(resolvedInt.trim());
          if (intMatch) {
            const num = parseInt(intMatch[1], 10);
            const u = intMatch[2].toLowerCase();
            if (u.startsWith('s')) stepMs = num * 1000;
            else if (u.startsWith('m')) stepMs = num * 60_000;
            else if (u.startsWith('h')) stepMs = num * 3600_000;
            else if (u.startsWith('d')) stepMs = num * 86400_000;
          }

          const intervalItems: Array<{ time: number; value: number | string }> = [];
          for (let cur = fromTime; cur < toTime; cur += stepMs) {
            const nextStep = Math.min(cur + stepMs, toTime);
            const stepPts = allPoints.filter((p) => p.time >= cur && p.time < nextStep);
            const rawValue = computeSummary(stepPts);
            const val = typeof rawValue === 'number' ? rawValue * conversionFactor : rawValue;
            intervalItems.push({
              time: cur,
              value: typeof val === 'number' ? val.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : String(val),
            });
            if (intervalItems.length >= 500) break;
          }

          if (intervalItems.length === 0) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: 'Sem dados', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const calcRowOrientation = parsed.options?.orientation === 'row';
          const neededEndCol = coord.col + (calcRowOrientation ? intervalItems.length - 1 : 1);
          const neededEndRow = coord.row + (calcRowOrientation ? 1 : intervalItems.length - 1);
          if (neededEndCol >= TOTAL_COLS || neededEndRow >= TOTAL_ROWS) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
              return next;
            });
            return;
          }

          let hasCollision = false;
          setCells((prev) => {
            for (let r = coord.row; r <= neededEndRow; r++) {
              for (let c = coord.col; c <= neededEndCol; c++) {
                if (r === coord.row && c === coord.col) continue;
                const existing = prev.get(`${c},${r}`);
                if (existing && !existing.spilledFrom && (existing.rawValue?.trim() || existing.displayValue?.trim())) {
                  hasCollision = true;
                  break;
                }
              }
              if (hasCollision) break;
            }
            const next = new Map(prev);
            const existingOrigin = next.get(key);
            if (hasCollision) {
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existingOrigin?.format });
              return next;
            }

            const spillTargets: string[] = [];
            const writeCell = (target: CellCoord, displayValue: string) => {
              const origin = target.col === coord.col && target.row === coord.row;
              if (!origin) {
                spillTargets.push(formatCellAddress(target));
              }
              next.set(`${target.col},${target.row}`, origin
                ? { rawValue, displayValue, spillTargetAddresses: [], format: existingOrigin?.format }
                : { rawValue: '', displayValue, spilledFrom: address });
            };
            intervalItems.forEach((item, index) => {
              const timeCoord = calcRowOrientation
                ? { col: coord.col + index, row: coord.row }
                : { col: coord.col, row: coord.row + index };
              const valueCoord = calcRowOrientation
                ? { col: timeCoord.col, row: timeCoord.row + 1 }
                : { col: timeCoord.col + 1, row: timeCoord.row };
              writeCell(timeCoord, formatDateTime(item.time));
              writeCell(valueCoord, String(item.value));
            });

            const originCell = next.get(key);
            if (originCell) originCell.spillTargetAddresses = spillTargets;
            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            next.set(key, { rawValue, displayValue: '#PI!', format: existing?.format });
            return evaluateStaticFormulas(next).nextMap;
          });
        }
        return;
      }

      if (parsed.type === 'pi_time_filter') {
        try {
          const resolvedExpr = resolveParameter(parsed.expression, getCellString);
          const resolvedStart = resolveParameter(parsed.startTime, getCellString);
          const resolvedEnd = resolveParameter(parsed.endTime, getCellString);
          const resolvedUnit = (resolveParameter(parsed.unit, getCellString) || 'hours').toLowerCase();

          const exprMatch = /^\s*['"]?([^'">=<!]+)['"]?\s*([><!=]=?|<>)\s*([0-9.-]+)\s*$/.exec(resolvedExpr);
          if (!exprMatch) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: '#FORMULA!', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const tagName = exprMatch[1].trim();
          const operator = exprMatch[2].trim();
          const threshold = parseFloat(exprMatch[3]);

          const binding = await resolvePiPointBindingByName(tagName);
          const fromTime = parsePiTime(resolvedStart);
          const toTime = parsePiTime(resolvedEnd);

          if (!binding || fromTime === undefined || toTime === undefined || fromTime >= toTime) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: fromTime === undefined || toTime === undefined ? '#FORMULA!' : '#PI!', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          const range = { from: fromTime, to: toTime };
          const results = await getPiTrendsRecordedHistoryForRange([binding], range, dataSourceSrv);
          const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
          const res = results[bindingKey];
          const points = (res && res.status === 'success' && res.series) ? res.series.points : [];

          const evaluateCondition = (val: number) => {
            switch (operator) {
              case '>': return val > threshold;
              case '>=': return val >= threshold;
              case '<': return val < threshold;
              case '<=': return val <= threshold;
              case '=': case '==': return val === threshold;
              case '<>': case '!=': return val !== threshold;
              default: return false;
            }
          };

          let trueDurationMs = 0;
          for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            const nextTime = i < points.length - 1 ? points[i + 1].time : toTime;
            const segDuration = Math.max(0, Math.min(nextTime, toTime) - Math.max(pt.time, fromTime));
            const numVal = Number(pt.value);
            if (!isNaN(numVal) && evaluateCondition(numVal)) {
              trueDurationMs += segDuration;
            }
          }

          let displayResult = '';
          const totalPeriodMs = toTime - fromTime;
          if (resolvedUnit.includes('percent') || resolvedUnit.includes('%')) {
            const pct = totalPeriodMs > 0 ? (trueDurationMs / totalPeriodMs) * 100 : 0;
            displayResult = `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
          } else if (resolvedUnit.startsWith('s')) {
            const sec = trueDurationMs / 1000;
            displayResult = `${sec.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`;
          } else if (resolvedUnit.startsWith('m')) {
            const min = trueDurationMs / 60_000;
            displayResult = `${min.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} min`;
          } else if (resolvedUnit.startsWith('d')) {
            const days = trueDurationMs / 86400_000;
            displayResult = `${days.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} d`;
          } else {
            const hrs = trueDurationMs / 3600_000;
            displayResult = `${hrs.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`;
          }

          const outputValues = [displayResult];
          if (parsed.showStartTime) {
            outputValues.push(formatDateTime(fromTime));
          }
          if (parsed.showEndTime) {
            outputValues.push(formatDateTime(toTime));
          }
          if (parsed.showPercentValid) {
            const valid = points.filter((point) => Number.isFinite(Number(point.value))).length;
            outputValues.push(`${(points.length ? valid / points.length * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
          }
          const rowOrientation = parsed.options?.orientation === 'row';
          const outputEndCol = coord.col + (rowOrientation ? outputValues.length - 1 : 0);
          const outputEndRow = coord.row + (rowOrientation ? 0 : outputValues.length - 1);
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            if (outputEndCol >= TOTAL_COLS || outputEndRow >= TOTAL_ROWS) {
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
              return next;
            }
            const spillTargets: string[] = [];
            for (let index = 0; index < outputValues.length; index++) {
              const target = rowOrientation
                ? { col: coord.col + index, row: coord.row }
                : { col: coord.col, row: coord.row + index };
              const targetKey = `${target.col},${target.row}`;
              if (index > 0) {
                const occupied = prev.get(targetKey);
                if (occupied && !occupied.spilledFrom && (occupied.rawValue?.trim() || occupied.displayValue?.trim())) {
                  next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
                  return next;
                }
                spillTargets.push(formatCellAddress(target));
              }
              next.set(targetKey, index === 0
                ? { rawValue, displayValue: outputValues[index], spillTargetAddresses: [], format: existing?.format }
                : { rawValue: '', displayValue: outputValues[index], spilledFrom: address });
            }
            const origin = next.get(key);
            if (origin) {
              origin.spillTargetAddresses = spillTargets;
            }
            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            next.set(key, { rawValue, displayValue: '#PI!', format: existing?.format });
            return evaluateStaticFormulas(next).nextMap;
          });
        }
        return;
      }
    },
    [dataSourceSrv, evaluateStaticFormulas, resolvePiPointBindingByName],
  );

  /**
   * Recalculates all cells (manual refresh)
   */
  const handleRecalculate = useCallback(async () => {
    setStatusMessage('Recalculando...');
    const currentCells = Array.from(cellsRef.current.entries());

    for (const [key, cell] of currentCells) {
      if (cell.spilledFrom) {
        continue;
      }
      const coord = parseCellAddress(formatCellAddress({
        col: parseInt(key.split(',')[0], 10),
        row: parseInt(key.split(',')[1], 10),
      }));
      if (coord && cell.rawValue) {
        await computeCell(coord, cell.rawValue);
      }
    }
    setStatusMessage('');
  }, [computeCell]);

  // Notify parent on cells or colWidths update
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    notifyDocumentChange();
  }, [cells, colWidths, notifyDocumentChange]);

  const recomputeAllFormulas = useCallback(
    (cellMap: Map<string, CellData>) => {
      const evaluated = evaluateStaticFormulas(cellMap).nextMap;
      setCells(evaluated);
      cellsRef.current = evaluated;
      const currentCells = Array.from(evaluated.entries());
      for (const [key, cell] of currentCells) {
        if (cell.spilledFrom) continue;
        const [colStr, rowStr] = key.split(',');
        const col = parseInt(colStr, 10);
        const row = parseInt(rowStr, 10);
        if (!isNaN(col) && !isNaN(row) && cell.rawValue && cell.rawValue.trim().startsWith('=')) {
          computeCell({ col, row }, cell.rawValue, evaluated);
        }
      }
    },
    [computeCell, evaluateStaticFormulas],
  );

  const commitStateToHistory = useCallback(
    (nextCellsMap: Map<string, CellData>, nextColWidthsMap?: Map<number, number>) => {
      const doc = serializeMiniSheets(
        nextCellsMap,
        nextColWidthsMap ?? colWidthsRef.current,
        TOTAL_COLS,
        TOTAL_ROWS
      );
      setHistory((prev) => commitMiniSheetsHistory(prev, doc));
      lastEmittedDocRef.current = doc;
      initialDocRef.current = doc;
      onChangeRef.current?.(doc);
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (!canUndoMiniSheetsHistory(historyRef.current)) {
      return;
    }
    const next = undoMiniSheetsHistory(historyRef.current);
    setHistory(next);
    const deserialized = deserializeMiniSheets(next.present);
    setColWidths(deserialized.colWidths);
    recomputeAllFormulas(deserialized.cells);
    const doc = serializeMiniSheets(deserialized.cells, deserialized.colWidths, TOTAL_COLS, TOTAL_ROWS);
    lastEmittedDocRef.current = doc;
    initialDocRef.current = doc;
    onChangeRef.current?.(doc);
    const activeKeyStr = `${activeCell.col},${activeCell.row}`;
    setFormulaBarText(deserialized.cells.get(activeKeyStr)?.rawValue ?? '');
  }, [activeCell.col, activeCell.row, recomputeAllFormulas]);

  const handleRedo = useCallback(() => {
    if (!canRedoMiniSheetsHistory(historyRef.current)) {
      return;
    }
    const next = redoMiniSheetsHistory(historyRef.current);
    setHistory(next);
    const deserialized = deserializeMiniSheets(next.present);
    setColWidths(deserialized.colWidths);
    recomputeAllFormulas(deserialized.cells);
    const doc = serializeMiniSheets(deserialized.cells, deserialized.colWidths, TOTAL_COLS, TOTAL_ROWS);
    lastEmittedDocRef.current = doc;
    initialDocRef.current = doc;
    onChangeRef.current?.(doc);
    const activeKeyStr = `${activeCell.col},${activeCell.row}`;
    setFormulaBarText(deserialized.cells.get(activeKeyStr)?.rawValue ?? '');
  }, [activeCell.col, activeCell.row, recomputeAllFormulas]);

  const editingCellCoordRef = useRef(editingCellCoord);
  editingCellCoordRef.current = editingCellCoord;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
        return;
      }
      if (editingCellCoordRef.current) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (isCtrlOrCmd && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleRedo, handleUndo]);

  // Sync state if initialDocument changes externally (e.g. loading a saved dashboard)
  const initialDocRef = useRef(initialDocument);
  useEffect(() => {
    if (
      initialDocument &&
      initialDocument !== lastEmittedDocRef.current &&
      initialDocument !== initialDocRef.current
    ) {
      initialDocRef.current = initialDocument;
      lastEmittedDocRef.current = initialDocument;
      setHistory(createMiniSheetsHistory(initialDocument));
      const deserialized = deserializeMiniSheets(initialDocument);
      setCells(deserialized.cells);
      setColWidths(deserialized.colWidths);
      recomputeAllFormulas(deserialized.cells);
    }
  }, [initialDocument, recomputeAllFormulas]);

  // Recalculate static formulas and formulas on initial load
  const hasInitializedFormulasRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedFormulasRef.current) {
      hasInitializedFormulasRef.current = true;
      recomputeAllFormulas(cellsRef.current);
    }
  }, [recomputeAllFormulas]);

  /**
   * DELETE / CLEAR CONTENTS: Clears cell contents across all selected ranges.
   * Cleans whole spill tree if a spilled cell or origin cell is inside range.
   */
  const handleDeleteSelected = useCallback(() => {
    const next = new Map(cellsRef.current);
    const spilledOriginsToClear = new Set<string>();

    // Identify cells to clear and spill origins
    ranges.forEach((range) => {
      const norm = normalizeRange(range);
      for (let r = norm.top; r <= norm.bottom; r++) {
        for (let c = norm.left; c <= norm.right; c++) {
          const key = `${c},${r}`;
          const cell = next.get(key);
          if (cell) {
            if (cell.spilledFrom) {
              spilledOriginsToClear.add(cell.spilledFrom);
            }
            if (cell.spillTargetAddresses && cell.spillTargetAddresses.length > 0) {
              spilledOriginsToClear.add(formatCellAddress({ col: c, row: r }));
            }
          }
        }
      }
    });

    // Clear full spill trees
    spilledOriginsToClear.forEach((originAddr) => {
      const originCoord = parseCellAddress(originAddr);
      if (originCoord) {
        const oKey = `${originCoord.col},${originCoord.row}`;
        const oCell = next.get(oKey);
        if (oCell?.spillTargetAddresses) {
          oCell.spillTargetAddresses.forEach((tAddr) => {
            const tc = parseCellAddress(tAddr);
            if (tc) {
              const tKey = `${tc.col},${tc.row}`;
              const tCell = next.get(tKey);
              if (tCell?.spilledFrom === originAddr) {
                next.delete(tKey);
              }
            }
          });
        }
        if (oCell) {
          next.delete(oKey);
        }
      }
    });

    // Clear directly selected cells (completely removing values and custom formats, returning cell to default)
    ranges.forEach((range) => {
      const norm = normalizeRange(range);
      for (let r = norm.top; r <= norm.bottom; r++) {
        for (let c = norm.left; c <= norm.right; c++) {
          const key = `${c},${r}`;
          next.delete(key);
        }
      }
    });

    const finalMap = evaluateStaticFormulas(next).nextMap;
    setCells(finalMap);
    commitStateToHistory(finalMap);
  }, [commitStateToHistory, evaluateStaticFormulas, ranges]);

  /**
   * COPY: Copies the primary range matrix into internal clipboard & OS clipboard (TSV).
   */
  const handleCopySelected = useCallback(() => {
    if (ranges.length === 0) {
      return;
    }
    const primary = ranges[ranges.length - 1];
    const norm = normalizeRange(primary);
    const matrix: ClipboardCell[][] = [];

    for (let r = norm.top; r <= norm.bottom; r++) {
      const rowList: ClipboardCell[] = [];
      for (let c = norm.left; c <= norm.right; c++) {
        const cell = cellsRef.current.get(`${c},${r}`);
        rowList.push({
          rawValue: cell?.rawValue ?? '',
          displayValue: cell?.displayValue ?? '',
          format: cell?.format ? { ...cell.format } : undefined,
        });
      }
      matrix.push(rowList);
    }

    const clipObj: MiniSheetClipboard = {
      rows: norm.bottom - norm.top + 1,
      cols: norm.right - norm.left + 1,
      matrix,
      sourceOrigin: { col: norm.left, row: norm.top },
    };
    setInternalClipboard(clipObj);

    // Try system clipboard
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        const tsv = matrixToTsv(matrix);
        navigator.clipboard.writeText(tsv).catch(() => {});
      }
    } catch {}
  }, [ranges]);

  /** Pastes a matrix starting at the active cell. */
  const pasteMatrix = useCallback((matrix: ClipboardCell[][], sourceOrigin?: CellCoord) => {
    if (matrix.length === 0) {
      return;
    }
    const startCol = activeCell.col;
    const startRow = activeCell.row;

    const baseDeltaCol = sourceOrigin ? startCol - sourceOrigin.col : 0;
    const baseDeltaRow = sourceOrigin ? startRow - sourceOrigin.row : 0;

    const next = new Map(cellsRef.current);
    matrix.forEach((rowCells, rIdx) => {
      const targetRow = startRow + rIdx;
      if (targetRow >= TOTAL_ROWS) {
        return;
      }
      rowCells.forEach((cell, cIdx) => {
        const targetCol = startCol + cIdx;
        if (targetCol >= TOTAL_COLS) {
          return;
        }
        const targetKey = `${targetCol},${targetRow}`;
        const deltaCol = baseDeltaCol;
        const deltaRow = baseDeltaRow;

        const rawValue = cell.rawValue.startsWith('=')
          ? shiftFormulaReferences(cell.rawValue, deltaCol, deltaRow, TOTAL_COLS, TOTAL_ROWS)
          : cell.rawValue;

        next.set(targetKey, {
          rawValue,
          displayValue: rawValue.startsWith('=') ? 'Carregando...' : cell.displayValue,
          format: cell.format ? { ...cell.format } : undefined,
        });
      });
    });

    const finalMap = evaluateStaticFormulas(next).nextMap;
    setCells(finalMap);
    commitStateToHistory(finalMap);

    // Recompute pasted formulas
    matrix.forEach((rowCells, rIdx) => {
      const targetRow = startRow + rIdx;
      if (targetRow >= TOTAL_ROWS) return;
      rowCells.forEach((cell, cIdx) => {
        const targetCol = startCol + cIdx;
        if (targetCol >= TOTAL_COLS) return;
        const deltaCol = baseDeltaCol;
        const deltaRow = baseDeltaRow;
        const rawValue = cell.rawValue.startsWith('=')
          ? shiftFormulaReferences(cell.rawValue, deltaCol, deltaRow, TOTAL_COLS, TOTAL_ROWS)
          : cell.rawValue;
        if (rawValue.startsWith('=')) {
          computeCell({ col: targetCol, row: targetRow }, rawValue);
        }
      });
    });
  }, [activeCell.col, activeCell.row, commitStateToHistory, computeCell, evaluateStaticFormulas]);

  /** PASTE: supports both the internal buffer and text copied from Excel/Sheets. */
  const handlePasteSelected = useCallback(() => {
    if (internalClipboard?.matrix.length) {
      pasteMatrix(internalClipboard.matrix, internalClipboard.sourceOrigin);
    }
  }, [internalClipboard, pasteMatrix]);

  const handleExternalPaste = useCallback((e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement | null;
    const targetTag = target?.tagName?.toLowerCase();
    if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || target?.isContentEditable) {
      return;
    }
    if (editingCellCoord) {
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    e.preventDefault();
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    const matrix: ClipboardCell[][] = lines.map((line) => line.split('\t').map((value) => ({
      rawValue: value,
      displayValue: value,
    })));
    pasteMatrix(matrix);
  }, [editingCellCoord, pasteMatrix]);

  /**
   * FORMATTING: Applies partial CellFormat to all cells across all selected ranges.
   */
  const handleApplyFormat = useCallback((formatPatch: Partial<CellFormat>) => {
    const next = new Map(cellsRef.current);
    ranges.forEach((range) => {
      const norm = normalizeRange(range);
      for (let r = norm.top; r <= norm.bottom; r++) {
        for (let c = norm.left; c <= norm.right; c++) {
          const key = `${c},${r}`;
          const existing = next.get(key) ?? { rawValue: '', displayValue: '' };
          next.set(key, {
            ...existing,
            format: {
              ...existing.format,
              ...formatPatch,
            },
          });
        }
      }
    });
    const finalMap = evaluateStaticFormulas(next).nextMap;
    setCells(finalMap);
    commitStateToHistory(finalMap);
  }, [commitStateToHistory, evaluateStaticFormulas, ranges]);

  /**
   * COLUMN AUTO-FIT: Auto-sizes the column width on double click based on its widest cell content.
   */
  const handleColAutoFit = useCallback((colIndex: number, e?: React.MouseEvent | React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const colHeaderLetter = colIndexToLetter(colIndex);
    let maxContentWidth = colHeaderLetter.length * 12 + 36;

    for (let r = 0; r < TOTAL_ROWS; r++) {
      const cell = cellsRef.current.get(`${colIndex},${r}`);
      if (cell) {
        const text = formatDisplayNumber(cell.displayValue ?? cell.rawValue ?? '', cell.format?.decimalPlaces, cell.format?.scientific).trim();
        if (text) {
          const charWidth = cell.format?.bold ? 9.5 : 8.0;
          const estimatedWidth = Math.ceil(text.length * charWidth + 28);
          if (estimatedWidth > maxContentWidth) {
            maxContentWidth = estimatedWidth;
          }
        }
      }
    }

    const autoWidth = Math.max(MIN_COL_WIDTH, Math.min(600, maxContentWidth));
    const nextWidths = new Map(colWidthsRef.current);
    nextWidths.set(colIndex, autoWidth);
    setColWidths(nextWidths);
    colWidthsRef.current = nextWidths;
    commitStateToHistory(cellsRef.current, nextWidths);
    notifyDocumentChange();
  }, [commitStateToHistory, notifyDocumentChange]);

  // Pointer event handlers for Cell Selection & Dragging
  const handleCellPointerDown = (col: number, row: number, e: React.PointerEvent) => {
    if (formulaEditMode && formulaSessionRef.current && formulaTargetRef.current) {
      e.preventDefault();
      e.stopPropagation();
      formulaPointerRef.current = true;
      formulaPointerHandledRef.current = false;
      formulaRangeAnchorRef.current = { col, row };
      dragModeRef.current = 'formula';
      setFormulaReferenceRange(rangeFromCells({ col, row }, { col, row }));
      return;
    }
    if (editingCellCoord) {
      if (editingCellCoord.col !== col || editingCellCoord.row !== row) {
        handleCellEditSubmit(editingCellCoord.col, editingCellCoord.row, editingCellText);
      } else {
        return;
      }
    }
    containerRef.current?.focus();
    const isMulti = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift) {
      const currentAnchor = anchorCellRef.current;
      const newRange = rangeFromCells(currentAnchor, { col, row });
      setRanges((prev) => {
        if (prev.length <= 1) {
          return [newRange];
        }
        return [...prev.slice(0, prev.length - 1), newRange];
      });
      return;
    }

    if (isMulti) {
      dragModeRef.current = 'cells';
      dragAnchorRef.current = { col, row };
      isAppendingRangeRef.current = true;
      baseRangesRef.current = ranges;
      setActiveCell({ col, row });
      setAnchorCell({ col, row });
      setRanges([...ranges, rangeFromCells({ col, row }, { col, row })]);
    } else {
      dragModeRef.current = 'cells';
      dragAnchorRef.current = { col, row };
      isAppendingRangeRef.current = false;
      baseRangesRef.current = [];
      setActiveCell({ col, row });
      setAnchorCell({ col, row });
      setRanges([rangeFromCells({ col, row }, { col, row })]);
    }
  };

  const handleCellPointerEnter = (col: number, row: number, e?: React.PointerEvent | React.MouseEvent) => {
    if (e && e.buttons === 0) {
      dragModeRef.current = null;
      dragAnchorRef.current = null;
      isAppendingRangeRef.current = false;
      setAutofillRange(null);
      return;
    }

    if (dragModeRef.current === 'formula' && formulaRangeAnchorRef.current) {
      setFormulaReferenceRange(rangeFromCells(formulaRangeAnchorRef.current, { col, row }));
      return;
    }

    // Autofill Drag
    if (dragModeRef.current === 'autofill' && ranges.length > 0) {
      const primary = normalizeRange(ranges[ranges.length - 1]);
      const dx = col - primary.right;
      const dy = row - primary.bottom;

      let target: SheetRange;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal fill
        target = {
          startCol: Math.min(primary.left, col),
          startRow: primary.top,
          endCol: Math.max(primary.right, col),
          endRow: primary.bottom,
        };
      } else {
        // Vertical fill
        target = {
          startCol: primary.left,
          startRow: Math.min(primary.top, row),
          endCol: primary.right,
          endRow: Math.max(primary.bottom, row),
        };
      }
      setAutofillRange(target);
      return;
    }

    if (dragModeRef.current !== 'cells' || !dragAnchorRef.current) {
      return;
    }
    const currentRange = rangeFromCells(dragAnchorRef.current, { col, row });
    if (isAppendingRangeRef.current) {
      setRanges([...baseRangesRef.current, currentRange]);
    } else {
      setRanges([currentRange]);
    }
  };

  const handleCellPointerUp = (col: number, row: number, e: React.PointerEvent) => {
    if (!formulaEditMode || !formulaSessionRef.current || !formulaTargetRef.current || !formulaPointerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const range = formulaReferenceRange ?? rangeFromCells({ col, row }, { col, row });
    formulaPointerRef.current = false;
    formulaPointerHandledRef.current = true;
    dragModeRef.current = null;
    formulaRangeAnchorRef.current = null;
    insertFormulaReference(range);
  };

  const handleCellClick = (col: number, row: number, e: React.MouseEvent) => {
    if (formulaEditMode && formulaPointerHandledRef.current) {
      formulaPointerHandledRef.current = false;
      return;
    }
    if (formulaEditMode && formulaSessionRef.current && formulaTargetRef.current) {
      e.preventDefault();
      e.stopPropagation();
      insertFormulaReference(rangeFromCells({ col, row }, { col, row }));
      return;
    }
    handleCellPointerDown(col, row, e as unknown as React.PointerEvent);
  };

  // Fill Handle Pointer Down
  const handleFillHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (ranges.length === 0) return;
    dragModeRef.current = 'autofill';
    const primary = ranges[ranges.length - 1];
    setAutofillRange(primary);
  };

  // Commit Autofill on Pointer Up
  const commitAutofill = useCallback(() => {
    if (!autofillRange || ranges.length === 0) {
      return;
    }
    const source = ranges[ranges.length - 1];
    const generated = calculateAutofillCells(
      source,
      autofillRange,
      (c, r) => cellsRef.current.get(`${c},${r}`),
      TOTAL_COLS,
      TOTAL_ROWS
    );

    if (generated.length > 0) {
      const next = new Map(cellsRef.current);
      generated.forEach((gen) => {
        const key = `${gen.col},${gen.row}`;
        next.set(key, {
          rawValue: gen.rawValue,
          displayValue: gen.displayValue,
          format: gen.format,
        });
      });
      const finalMap = evaluateStaticFormulas(next).nextMap;
      setCells(finalMap);
      commitStateToHistory(finalMap);

      // Compute formulas for generated cells
      generated.forEach((gen) => {
        if (gen.rawValue.startsWith('=')) {
          computeCell({ col: gen.col, row: gen.row }, gen.rawValue);
        }
      });

      // Expand selection to include autofilled range
      setRanges([autofillRange]);
    }

    setAutofillRange(null);
  }, [autofillRange, computeCell, evaluateStaticFormulas, ranges]);

  // Global pointer/mouse move & up for column resizing, selection, or autofill drag
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent | MouseEvent) => {
      if (resizingColRef.current) {
        const currentX = e.clientX ?? (e as any).pageX ?? (e as any).screenX ?? 0;
        const deltaX = currentX - resizingColRef.current.startX;
        const newWidth = Math.max(MIN_COL_WIDTH, resizingColRef.current.startWidth + deltaX);
        const colIdx = resizingColRef.current.colIndex;
        setColWidths((prev) => {
          if (prev.get(colIdx) === newWidth) {
            return prev;
          }
          const next = new Map(prev);
          next.set(colIdx, newWidth);
          return next;
        });
      }
    };

    const handleGlobalDragEnd = () => {
      const wasResizing = Boolean(resizingColRef.current);
      if (resizingColRef.current) {
        resizingColRef.current = null;
      }
      if (dragModeRef.current === 'autofill') {
        commitAutofill();
      }
      dragModeRef.current = null;
      dragAnchorRef.current = null;
      isAppendingRangeRef.current = false;
      setAutofillRange(null);
      if (wasResizing) {
        commitStateToHistory(cellsRef.current, colWidthsRef.current);
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('mousemove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalDragEnd);
    window.addEventListener('mouseup', handleGlobalDragEnd);
    window.addEventListener('blur', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('mousemove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalDragEnd);
      window.removeEventListener('mouseup', handleGlobalDragEnd);
      window.removeEventListener('blur', handleGlobalDragEnd);
    };
  }, [commitAutofill]);

  // Column Header selection
  const handleColHeaderPointerDown = (colIndex: number, e: React.PointerEvent) => {
    setEditingCellCoord(null);
    const isMulti = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift) {
      const currentAnchor = anchorCellRef.current;
      const newRange = rangeFromColumns(currentAnchor.col, colIndex, visibleRows);
      setRanges((prev) => {
        if (prev.length <= 1) {
          return [newRange];
        }
        return [...prev.slice(0, prev.length - 1), newRange];
      });
      return;
    }

    const colRange = rangeFromColumns(colIndex, colIndex, visibleRows);
    if (isMulti) {
      dragModeRef.current = 'cols';
      dragAnchorRef.current = { col: colIndex, row: 0 };
      isAppendingRangeRef.current = true;
      baseRangesRef.current = ranges;
      setActiveCell({ col: colIndex, row: 0 });
      setAnchorCell({ col: colIndex, row: 0 });
      setRanges([...ranges, colRange]);
    } else {
      dragModeRef.current = 'cols';
      dragAnchorRef.current = { col: colIndex, row: 0 };
      isAppendingRangeRef.current = false;
      baseRangesRef.current = [];
      setActiveCell({ col: colIndex, row: 0 });
      setAnchorCell({ col: colIndex, row: 0 });
      setRanges([colRange]);
    }
  };

  const handleColHeaderPointerEnter = (colIndex: number, e?: React.PointerEvent | React.MouseEvent) => {
    if (e && e.buttons === 0) {
      dragModeRef.current = null;
      dragAnchorRef.current = null;
      isAppendingRangeRef.current = false;
      return;
    }
    if (dragModeRef.current !== 'cols' || !dragAnchorRef.current) {
      return;
    }
    const currentRange = rangeFromColumns(dragAnchorRef.current.col, colIndex, visibleRows);
    if (isAppendingRangeRef.current) {
      setRanges([...baseRangesRef.current, currentRange]);
    } else {
      setRanges([currentRange]);
    }
  };

  // Row Header selection
  const handleRowHeaderPointerDown = (rowIndex: number, e: React.PointerEvent) => {
    setEditingCellCoord(null);
    const isMulti = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift) {
      const currentAnchor = anchorCellRef.current;
      const newRange = rangeFromRows(currentAnchor.row, rowIndex, TOTAL_COLS);
      setRanges((prev) => {
        if (prev.length <= 1) {
          return [newRange];
        }
        return [...prev.slice(0, prev.length - 1), newRange];
      });
      return;
    }

    const rowRange = rangeFromRows(rowIndex, rowIndex, TOTAL_COLS);
    if (isMulti) {
      dragModeRef.current = 'rows';
      dragAnchorRef.current = { col: 0, row: rowIndex };
      isAppendingRangeRef.current = true;
      baseRangesRef.current = ranges;
      setActiveCell({ col: 0, row: rowIndex });
      setAnchorCell({ col: 0, row: rowIndex });
      setRanges([...ranges, rowRange]);
    } else {
      dragModeRef.current = 'rows';
      dragAnchorRef.current = { col: 0, row: rowIndex };
      isAppendingRangeRef.current = false;
      baseRangesRef.current = [];
      setActiveCell({ col: 0, row: rowIndex });
      setAnchorCell({ col: 0, row: rowIndex });
      setRanges([rowRange]);
    }
  };

  const handleRowHeaderPointerEnter = (rowIndex: number, e?: React.PointerEvent | React.MouseEvent) => {
    if (e && e.buttons === 0) {
      dragModeRef.current = null;
      dragAnchorRef.current = null;
      isAppendingRangeRef.current = false;
      return;
    }
    if (dragModeRef.current !== 'rows' || !dragAnchorRef.current) {
      return;
    }
    const currentRange = rangeFromRows(dragAnchorRef.current.row, rowIndex, TOTAL_COLS);
    if (isAppendingRangeRef.current) {
      setRanges([...baseRangesRef.current, currentRange]);
    } else {
      setRanges([currentRange]);
    }
  };

  // Select all corner
  const handleSelectAll = () => {
    setEditingCellCoord(null);
    setActiveCell({ col: 0, row: 0 });
    setAnchorCell({ col: 0, row: 0 });
    setRanges([rangeSelectAll(TOTAL_COLS, visibleRows)]);
  };

  const handleCellDoubleClick = (col: number, row: number) => {
    const key = `${col},${row}`;
    const cell = cells.get(key);
    setActiveCell({ col, row });
    setAnchorCell({ col, row });
    setRanges([rangeFromCells({ col, row }, { col, row })]);
    setEditingCellCoord({ col, row });
    setEditingCellText(cell?.rawValue ?? '');
  };

  const handleFormulaBarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = formulaTargetRef.current ?? activeCell;
    setFormulaEditMode(false);
    formulaSessionRef.current = false;
    setFormulaReferenceRange(null);
    formulaTargetRef.current = null;
    setFormulaTargetCell(null);
    computeCell(target, formulaBarText);
  };

  const handleCellEditSubmit = (
    col: number,
    row: number,
    text: string,
    moveDirection?: 'down' | 'right'
  ) => {
    setEditingCellCoord(null);
    const target = formulaTargetRef.current;
    if (target && target.col === col && target.row === row) {
      setFormulaEditMode(false);
      formulaSessionRef.current = false;
      setFormulaReferenceRange(null);
      formulaTargetRef.current = null;
      setFormulaTargetCell(null);
    }
    computeCell({ col, row }, text);
    if (moveDirection === 'down') {
      const nextRow = Math.min(TOTAL_ROWS - 1, row + 1);
      const nextCoord = { col, row: nextRow };
      setActiveCell(nextCoord);
      setAnchorCell(nextCoord);
      setRanges([rangeFromCells(nextCoord, nextCoord)]);
    } else if (moveDirection === 'right') {
      const nextCol = Math.min(TOTAL_COLS - 1, col + 1);
      const nextCoord = { col: nextCol, row };
      setActiveCell(nextCoord);
      setAnchorCell(nextCoord);
      setRanges([rangeFromCells(nextCoord, nextCoord)]);
    }
    setTimeout(() => {
      containerRef.current?.focus();
    }, 0);
  };

  // Keyboard Shortcuts (Delete, Backspace, Ctrl+C, Ctrl+V, Direct Typing, Navigation)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Only capture shortcuts when NOT editing cell inline or formula bar input
    if (editingCellCoord) {
      return;
    }
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
      return;
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handleDeleteSelected();
      return;
    }

    if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }

    if (isCtrlOrCmd && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      handleCopySelected();
      return;
    }

    if (isCtrlOrCmd && (e.key === 'v' || e.key === 'V')) {
      // When a cell was copied inside Mini-Sheets, preserve formulas and
      // formatting through the internal clipboard. Otherwise let the browser
      // dispatch its native paste event so Excel/Google Sheets text reaches
      // handleExternalPaste through text/plain.
      if (internalClipboard?.matrix.length) {
        e.preventDefault();
        handlePasteSelected();
      }
      return;
    }

    if (e.key === 'F2' || e.key === 'Enter') {
      e.preventDefault();
      const cell = cells.get(activeKey);
      setEditingCellCoord(activeCell);
      setEditingCellText(cell?.rawValue ?? '');
      if (cell?.rawValue?.trimStart().startsWith('=')) {
        formulaTargetRef.current = activeCell;
        setFormulaTargetCell(activeCell);
        setFormulaEditMode(true);
        formulaSessionRef.current = true;
        formulaCursorRef.current = { start: cell.rawValue.length, end: cell.rawValue.length };
      }
      return;
    }

    // Arrow navigation when not editing
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newRow = Math.max(0, activeCell.row - 1);
      const nextCoord = { col: activeCell.col, row: newRow };
      setActiveCell(nextCoord);
      setAnchorCell(nextCoord);
      setRanges([rangeFromCells(nextCoord, nextCoord)]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newRow = Math.min(TOTAL_ROWS - 1, activeCell.row + 1);
      const nextCoord = { col: activeCell.col, row: newRow };
      setActiveCell(nextCoord);
      setAnchorCell(nextCoord);
      setRanges([rangeFromCells(nextCoord, nextCoord)]);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const newCol = Math.max(0, activeCell.col - 1);
      const nextCoord = { col: newCol, row: activeCell.row };
      setActiveCell(nextCoord);
      setAnchorCell(nextCoord);
      setRanges([rangeFromCells(nextCoord, nextCoord)]);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const newCol = Math.min(TOTAL_COLS - 1, activeCell.col + 1);
      const nextCoord = { col: newCol, row: activeCell.row };
      setActiveCell(nextCoord);
      setAnchorCell(nextCoord);
      setRanges([rangeFromCells(nextCoord, nextCoord)]);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const delta = e.shiftKey ? -1 : 1;
      const newCol = Math.max(0, Math.min(TOTAL_COLS - 1, activeCell.col + delta));
      const nextCoord = { col: newCol, row: activeCell.row };
      setActiveCell(nextCoord);
      setAnchorCell(nextCoord);
      setRanges([rangeFromCells(nextCoord, nextCoord)]);
      return;
    }

    // Single character typing on selected cell -> start editing immediately with typed character!
    if (e.key.length === 1 && !isCtrlOrCmd && e.key !== 'Escape') {
      e.preventDefault();
      setEditingCellCoord(activeCell);
      setEditingCellText(e.key);
      if (e.key === '=') {
        formulaTargetRef.current = activeCell;
        setFormulaTargetCell(activeCell);
        setFormulaEditMode(true);
        formulaSessionRef.current = true;
        formulaCursorRef.current = { start: 1, end: 1 };
      } else {
        setFormulaEditMode(false);
        formulaSessionRef.current = false;
      }
      return;
    }
  };

  // Active cell format status for toolbar highlights
  const activeCellData = cells.get(activeKey);
  const activeFormat = activeCellData?.format ?? {};

  // Primary Range bounds for Fill Handle
  const primaryRange = ranges.length > 0 ? normalizeRange(ranges[ranges.length - 1]) : null;
  const handleSipInsert = useCallback(
    (
      result: OracleQueryResponse,
      targetAddress: string,
      includeHeaders: boolean,
      querySql?: string,
      queryMaxRows?: number
    ) => {
      const targetRange = parseRangeAddresses(targetAddress);
      const startCoord = targetRange[0] ?? parseCellAddress(targetAddress) ?? activeCell;
      const startCol = startCoord.col;
      const startRow = startCoord.row;

      if (!result.rows || result.rows.length === 0) {
        return;
      }

      const cols = Object.keys(result.rows[0]);
      if (cols.length === 0) {
        return;
      }

      const effectiveSql = querySql || sipSql || '';
      const effectiveMaxRows = queryMaxRows || sipMaxRows || 200;
      const sipOriginMeta: SipOriginInfo = {
        sql: effectiveSql,
        maxRows: effectiveMaxRows,
        targetCell: formatCellAddress(startCoord),
        includeHeaders,
        originCoord: startCoord,
      };

      const originAddress = formatCellAddress(startCoord);
      const next = new Map(cellsRef.current);
      let currentRow = startRow;

      // Header row
      if (includeHeaders && currentRow < TOTAL_ROWS) {
        cols.forEach((colName, cIdx) => {
          const col = startCol + cIdx;
          if (col < TOTAL_COLS) {
            const key = `${col},${currentRow}`;
            const isOrigin = col === startCol && currentRow === startRow;
            next.set(key, {
              rawValue: String(colName),
              displayValue: String(colName),
              format: { bold: true },
              sipOrigin: sipOriginMeta,
              spilledFrom: isOrigin ? undefined : originAddress,
            });
          }
        });
        currentRow++;
      }

      // Data rows
      result.rows.forEach((rowObj) => {
        if (currentRow < TOTAL_ROWS) {
          cols.forEach((colName, cIdx) => {
            const col = startCol + cIdx;
            if (col < TOTAL_COLS) {
              const key = `${col},${currentRow}`;
              const val = rowObj[colName];
              let strVal = '';
              if (val !== null && val !== undefined) {
                strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
              }
              const isOrigin = !includeHeaders && col === startCol && currentRow === startRow;
              next.set(key, {
                rawValue: strVal,
                displayValue: strVal,
                sipOrigin: sipOriginMeta,
                spilledFrom: isOrigin ? undefined : originAddress,
              });
            }
          });
          currentRow++;
        }
      });

      const finalMap = evaluateStaticFormulas(next).nextMap;
      setCells(finalMap);
      cellsRef.current = finalMap;
      commitStateToHistory(finalMap);

      setActiveCell(startCoord);
      setRanges([rangeFromCells(startCoord, startCoord)]);
    },
    [activeCell, commitStateToHistory, evaluateStaticFormulas, sipSql, sipMaxRows]
  );

  const dataLinkMenu = (
    <div
      onKeyDown={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      <PiDataLinkToolbar
        activeFunction={activeDataLinkDialog}
        onOpenFunction={(type) => {
          if (activeDataLinkDialog === type) {
            setActiveDataLinkDialog(null);
            setDataLinkInitialFormula(undefined);
            setDataLinkTargetCell(undefined);
            return;
          }
          const piInfo = getPiDataLinkInfoForCell(activeCell, cells);
          if (piInfo && piInfo.functionType === type) {
            setActiveDataLinkDialog(type);
            setDataLinkInitialFormula(piInfo.formula);
            setDataLinkTargetCell(piInfo.targetCell);
            lastAutoOpenedOriginKeyRef.current = `${piInfo.originCoord.col},${piInfo.originCoord.row}`;
          } else {
            setActiveDataLinkDialog(type);
            setDataLinkInitialFormula(undefined);
            setDataLinkTargetCell(formatCellAddress(activeCell));
          }
        }}
      />
      {activeDataLinkDialog === 'SIPQuery' ? (
        <MiniSheetsSipDialog
          embedded
          initialTargetCell={dataLinkTargetCell || formatCellAddress(activeCell)}
          currentSelectionAddress={ranges.length > 0 ? formatRangeAddress(ranges[ranges.length - 1], TOTAL_COLS, TOTAL_ROWS) : undefined}
          sessionId={sipSessionId}
          onSessionIdChange={setSipSessionId}
          sql={sipSql}
          onSqlChange={setSipSql}
          maxRows={sipMaxRows}
          onMaxRowsChange={setSipMaxRows}
          includeHeaders={sipIncludeHeaders}
          onIncludeHeadersChange={setSipIncludeHeaders}
          onExecuteInsert={handleSipInsert}
          onClose={() => {
            setActiveDataLinkDialog(null);
            setDataLinkInitialFormula(undefined);
            setDataLinkTargetCell(undefined);
            lastAutoOpenedOriginKeyRef.current = null;
          }}
        />
      ) : activeDataLinkDialog ? (
        <PiDataLinkFunctionDialog
          embedded
          functionType={activeDataLinkDialog}
          initialFormula={dataLinkInitialFormula}
          initialTargetCell={dataLinkTargetCell || formatCellAddress(activeCell)}
          currentSelectionAddress={ranges.length > 0 ? formatRangeAddress(ranges[ranges.length - 1], TOTAL_COLS, TOTAL_ROWS) : undefined}
          onInsert={(formula, targetAddress) => {
            const targetRange = parseRangeAddresses(targetAddress);
            const coord = targetRange[0] ?? parseCellAddress(targetAddress) ?? activeCell;
            setActiveCell(coord);
            setRanges([
              targetRange.length > 1
                ? rangeFromCells(targetRange[0], targetRange[targetRange.length - 1])
                : rangeFromCells(coord, coord),
            ]);
            computeCell(coord, formula);
            setFormulaBarText(formula);
            setDataLinkInitialFormula(formula);
            setDataLinkTargetCell(formatCellAddress(coord));
            lastAutoOpenedOriginKeyRef.current = `${coord.col},${coord.row}`;
          }}
          onClose={() => {
            setActiveDataLinkDialog(null);
            setDataLinkInitialFormula(undefined);
            setDataLinkTargetCell(undefined);
            lastAutoOpenedOriginKeyRef.current = null;
          }}
        />
      ) : null}
    </div>
  );

  return (
    <section
      ref={containerRef}
      className={styles.container}
      data-testid="mini-sheets-panel"
      aria-label="Mini-Sheets"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPaste={handleExternalPaste}
    >
      {dataLinkMenuHost ? createPortal(dataLinkMenu, dataLinkMenuHost) : !dataLinkMenuHostId ? dataLinkMenu : null}

      {/* Header / Toolbar */}
      <div className={styles.topToolbar}>
        <div className={styles.titleRow}>
          <GridIcon />
          <h2>Sheets</h2>
        </div>

        {/* Formatting Toolbar */}
        <div className={styles.formattingToolbar} data-testid="mini-sheets-formatting-toolbar">
          {/* Undo */}
          <button
            type="button"
            className={styles.formatButton}
            data-testid="mini-sheets-undo"
            title="Desfazer (Ctrl+Z)"
            disabled={!canUndoMiniSheetsHistory(history)}
            onClick={handleUndo}
          >
            <UndoIcon />
          </button>

          {/* Redo */}
          <button
            type="button"
            className={styles.formatButton}
            data-testid="mini-sheets-redo"
            title="Refazer (Ctrl+Y)"
            disabled={!canRedoMiniSheetsHistory(history)}
            onClick={handleRedo}
          >
            <RedoIcon />
          </button>

          <div className={styles.toolbarDivider} />

          {/* Bold */}
          <button
            type="button"
            className={`${styles.formatButton} ${activeFormat.bold ? styles.formatButtonActive : ''}`}
            data-testid="mini-sheets-format-bold"
            title="Negrito (Ctrl+B)"
            onClick={() => handleApplyFormat({ bold: !activeFormat.bold })}
          >
            <strong>B</strong>
          </button>

          {/* Italic */}
          <button
            type="button"
            className={`${styles.formatButton} ${activeFormat.italic ? styles.formatButtonActive : ''}`}
            data-testid="mini-sheets-format-italic"
            title="Itálico (Ctrl+I)"
            onClick={() => handleApplyFormat({ italic: !activeFormat.italic })}
          >
            <em>I</em>
          </button>

          <div className={styles.toolbarDivider} />

          {/* Text Color */}
          <label className={styles.colorPickerLabel} title="Cor do texto">
            <span style={{ borderBottom: `3px solid ${activeFormat.textColor || 'var(--text-primary)'}` }}>A</span>
            <input
              type="color"
              className={styles.colorInput}
              data-testid="mini-sheets-format-text-color"
              value={activeFormat.textColor || '#e5e7eb'}
              onChange={(e) => handleApplyFormat({ textColor: e.target.value })}
            />
          </label>

          {/* Background Color */}
          <label className={styles.colorPickerLabel} title="Cor de fundo da célula">
            <FillColorIcon />
            <input
              type="color"
              className={styles.colorInput}
              data-testid="mini-sheets-format-bg-color"
              value={activeFormat.backgroundColor || '#1f2937'}
              onChange={(e) => handleApplyFormat({ backgroundColor: e.target.value })}
            />
          </label>

          <div className={styles.toolbarDivider} />

          {/* Alignment */}
          <button
            type="button"
            className={`${styles.formatButton} ${activeFormat.horizontalAlign === 'left' ? styles.formatButtonActive : ''}`}
            data-testid="mini-sheets-format-align-left"
            title="Alinhar à esquerda"
            onClick={() => handleApplyFormat({ horizontalAlign: 'left' })}
          >
            <AlignLeftIcon />
          </button>
          <button
            type="button"
            className={`${styles.formatButton} ${activeFormat.horizontalAlign === 'center' ? styles.formatButtonActive : ''}`}
            data-testid="mini-sheets-format-align-center"
            title="Centralizar"
            onClick={() => handleApplyFormat({ horizontalAlign: 'center' })}
          >
            <AlignCenterIcon />
          </button>
          <button
            type="button"
            className={`${styles.formatButton} ${activeFormat.horizontalAlign === 'right' ? styles.formatButtonActive : ''}`}
            data-testid="mini-sheets-format-align-right"
            title="Alinhar à direita"
            onClick={() => handleApplyFormat({ horizontalAlign: 'right' })}
          >
            <AlignRightIcon />
          </button>

          <div className={styles.toolbarDivider} />

          {/* Decimal Places */}
          <select
            className={styles.decimalSelect}
            data-testid="mini-sheets-format-decimals"
            title="Casas decimais"
            value={activeFormat.decimalPlaces ?? 'auto'}
            onChange={(e) => {
              const val = e.target.value;
              handleApplyFormat({ decimalPlaces: val === 'auto' ? 'auto' : parseInt(val, 10) });
            }}
          >
            <option value="auto">Auto</option>
            <option value="0">.0</option>
            <option value="1">.1</option>
            <option value="2">.2</option>
            <option value="3">.3</option>
            <option value="4">.4</option>
          </select>

          {/* Notação Científica / Exponencial */}
          <button
            type="button"
            className={`${styles.formatButton} ${activeFormat.scientific ? styles.formatButtonActive : ''}`}
            data-testid="mini-sheets-format-scientific"
            title={activeFormat.scientific ? 'Desativar notação exponencial / científica' : 'Ativar notação exponencial / científica (ex: 9.52E-05)'}
            onClick={() => handleApplyFormat({ scientific: !activeFormat.scientific })}
            style={{ fontWeight: 600, fontSize: '11px', minWidth: '34px', letterSpacing: '0.5px' }}
          >
            <span>EXP</span>
          </button>
        </div>

        <button
          type="button"
          className={styles.recalculateButton}
          data-testid="mini-sheets-recalculate"
          onClick={handleRecalculate}
          title="Recalcular todas as fórmulas PI"
        >
          <RefreshIcon />
          <span>Recalcular</span>
        </button>
        <button
          type="button"
          className={styles.recalculateButton}
          data-testid="mini-sheets-add-row"
          onClick={handleAddRow}
          disabled={visibleRows >= TOTAL_ROWS}
          title={visibleRows >= TOTAL_ROWS ? 'Limite máximo de linhas atingido' : 'Adicionar uma linha'}
        >
          <span>+ Linha</span>
        </button>
      </div>

      {/* Formula Bar and Active Cell Box */}
      <div className={styles.formulaBarRow}>
        <div className={styles.activeCellBox} data-testid="mini-sheets-active-cell" title="Endereço da seleção">
          {addressLabel}
        </div>
        <form className={styles.formulaForm} onSubmit={handleFormulaBarSubmit}>
          <span className={styles.fxSymbol}>fx</span>
          <input
            ref={formulaBarInputRef}
            className={styles.formulaInput}
            data-testid="mini-sheets-formula-input"
            value={formulaBarText}
            placeholder="Digite um texto, número ou fórmula (ex: =PICurrVal(&quot;TAG&quot;))"
            onFocus={(e) => {
              formulaCursorRef.current = { start: e.currentTarget.selectionStart ?? e.currentTarget.value.length, end: e.currentTarget.selectionEnd ?? e.currentTarget.value.length };
              if (e.currentTarget.value.trimStart().startsWith('=')) beginFormulaEdit(e.currentTarget.value);
            }}
            onSelect={(e) => {
              formulaCursorRef.current = { start: e.currentTarget.selectionStart ?? e.currentTarget.value.length, end: e.currentTarget.selectionEnd ?? e.currentTarget.value.length };
            }}
            onChange={(e) => {
              const value = e.target.value;
              formulaCursorRef.current = { start: e.target.selectionStart ?? value.length, end: e.target.selectionEnd ?? value.length };
              setFormulaBarText(value);
              if (value.trimStart().startsWith('=')) {
                beginFormulaEdit(value);
              } else {
                setFormulaEditMode(false);
                formulaSessionRef.current = false;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setFormulaEditMode(false);
                formulaSessionRef.current = false;
                setFormulaReferenceRange(null);
                formulaTargetRef.current = null;
                setFormulaTargetCell(null);
                e.currentTarget.blur();
              }
            }}
          />
        </form>
      </div>

      {statusMessage && <div className={styles.statusToast}>{statusMessage}</div>}

      {/* Grid */}
      <div className={styles.gridWrapper} data-testid="mini-sheets-grid">
        <table className={styles.table}>
          <colgroup>
            <col style={{ width: '42px', minWidth: '42px' }} />
            {Array.from({ length: TOTAL_COLS }).map((_, cIndex) => {
              const colWidth = getColWidth(cIndex);
              return (
                <col
                  key={cIndex}
                  style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
                />
              );
            })}
          </colgroup>
          <thead>
            <tr>
              <th
                className={styles.cornerHeader}
                data-testid="mini-sheets-select-all"
                title="Selecionar toda a planilha"
                onClick={handleSelectAll}
              />
              {Array.from({ length: TOTAL_COLS }).map((_, cIndex) => {
                const isColSel = isColumnSelected(cIndex, ranges);
                const colWidth = getColWidth(cIndex);
                return (
                  <th
                    key={cIndex}
                    className={`${styles.colHeader} ${isColSel ? styles.colHeaderSelected : ''}`}
                    style={{ width: `${colWidth}px`, minWidth: `${colWidth}px`, maxWidth: `${colWidth}px` }}
                    data-testid={`mini-sheets-col-header-${colIndexToLetter(cIndex)}`}
                    onPointerDown={(e) => handleColHeaderPointerDown(cIndex, e)}
                    onPointerEnter={(e) => handleColHeaderPointerEnter(cIndex, e)}
                    onMouseEnter={(e) => handleColHeaderPointerEnter(cIndex, e)}
                  >
                    <span>{colIndexToLetter(cIndex)}</span>
                    <div
                      className={styles.colResizeHandle}
                      data-testid={`mini-sheets-col-resizer-${colIndexToLetter(cIndex)}`}
                      onPointerDown={(e) => handleColResizePointerDown(cIndex, e)}
                      onMouseDown={(e) => handleColResizePointerDown(cIndex, e as any)}
                      onDoubleClick={(e) => handleColAutoFit(cIndex, e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      title="Duplo clique para auto-ajustar ou arrastar para redimensionar"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: visibleRows }).map((_, rIndex) => {
              const isRowSel = isRowSelected(rIndex, ranges);
              return (
                <tr key={rIndex}>
                  <th
                    className={`${styles.rowHeader} ${isRowSel ? styles.rowHeaderSelected : ''}`}
                    data-testid={`mini-sheets-row-header-${rIndex + 1}`}
                    onClick={(e) => handleRowHeaderPointerDown(rIndex, e as any)}
                    onPointerDown={(e) => handleRowHeaderPointerDown(rIndex, e)}
                    onPointerEnter={(e) => handleRowHeaderPointerEnter(rIndex, e)}
                    onMouseEnter={(e) => handleRowHeaderPointerEnter(rIndex, e)}
                  >
                    {rIndex + 1}
                  </th>
                  {Array.from({ length: TOTAL_COLS }).map((_, cIndex) => {
                    const cellKey = `${cIndex},${rIndex}`;
                    const cell = cells.get(cellKey);
                    const isActive = activeCell.col === cIndex && activeCell.row === rIndex;
                    const isInsideSelection = isCellInsideRanges(cIndex, rIndex, ranges);
                    const isFormulaReference = formulaEditMode && formulaReferenceRange
                      ? isCellInsideRanges(cIndex, rIndex, [formulaReferenceRange])
                      : false;
                    const isInsideAutofill = autofillRange ? isCellInsideRanges(cIndex, rIndex, [autofillRange]) : false;
                    const isEditing = editingCellCoord?.col === cIndex && editingCellCoord?.row === rIndex;
                    const isSpilled = Boolean(cell?.spilledFrom);
                    const isError = cell?.displayValue?.startsWith('#');
                    const isPrimaryBottomRight = primaryRange && primaryRange.right === cIndex && primaryRange.bottom === rIndex;
                    const colWidth = getColWidth(cIndex);

                    const formattedDisplay = cell?.displayValue
                      ? formatDisplayNumber(cell.displayValue, cell.format?.decimalPlaces, cell.format?.scientific)
                      : '';

                    // Inline style override for custom cell formatting + width
                    const customStyle: React.CSSProperties = {
                      width: `${colWidth}px`,
                      minWidth: `${colWidth}px`,
                      maxWidth: `${colWidth}px`,
                    };
                    if (cell?.format?.bold) customStyle.fontWeight = 'bold';
                    if (cell?.format?.italic) customStyle.fontStyle = 'italic';
                    if (cell?.format?.textColor) customStyle.color = cell.format.textColor;
                    if (cell?.format?.backgroundColor && !isActive && !isInsideSelection) {
                      customStyle.backgroundColor = cell.format.backgroundColor;
                    }
                    if (cell?.format?.horizontalAlign) customStyle.textAlign = cell.format.horizontalAlign;

                    // Draw a single, heavier outline around the outside of each
                    // selected range (like Excel) without changing the size of
                    // the cells or hiding the normal inner grid lines.
                    if (isInsideSelection) {
                      const rangeOutline = ranges.flatMap((range) => {
                        const normalized = normalizeRange(range);
                        if (
                          cIndex < normalized.left ||
                          cIndex > normalized.right ||
                          rIndex < normalized.top ||
                          rIndex > normalized.bottom
                        ) {
                          return [];
                        }

                        const shadows: string[] = [];
                        if (rIndex === normalized.top) shadows.push('inset 0 2px 0 #1890ff');
                        if (rIndex === normalized.bottom) shadows.push('inset 0 -2px 0 #1890ff');
                        if (cIndex === normalized.left) shadows.push('inset 2px 0 0 #1890ff');
                        if (cIndex === normalized.right) shadows.push('inset -2px 0 0 #1890ff');
                        return shadows;
                      });
                      if (rangeOutline.length > 0) {
                        customStyle.boxShadow = rangeOutline.join(', ');
                      }
                    }

                    return (
                      <td
                        key={cIndex}
                        className={`${styles.cell} ${
                          isActive
                            ? styles.cellActive
                            : isFormulaReference
                            ? styles.cellFormulaReference
                            : isInsideSelection
                            ? styles.cellInRange
                            : ''
                        } ${isInsideAutofill && !isInsideSelection ? styles.cellAutofillPreview : ''} ${
                          isSpilled ? styles.cellSpilled : ''
                        } ${isError ? styles.cellError : ''}`}
                        style={customStyle}
                        data-testid={`mini-sheets-cell-${colIndexToLetter(cIndex)}${rIndex + 1}`}
                        data-formula-target={formulaEditMode && formulaTargetCell?.col === cIndex && formulaTargetCell.row === rIndex ? 'true' : undefined}
                        onClick={(e) => handleCellClick(cIndex, rIndex, e)}
                        onPointerDown={(e) => handleCellPointerDown(cIndex, rIndex, e)}
                        onPointerUp={(e) => handleCellPointerUp(cIndex, rIndex, e)}
                        onPointerEnter={(e) => handleCellPointerEnter(cIndex, rIndex, e)}
                        onMouseEnter={(e) => handleCellPointerEnter(cIndex, rIndex, e)}
                        onDoubleClick={() => handleCellDoubleClick(cIndex, rIndex)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            ref={inlineFormulaInputRef}
                            className={styles.cellInlineInput}
                            value={editingCellText}
                            onFocus={(e) => {
                              formulaCursorRef.current = { start: e.currentTarget.selectionStart ?? e.currentTarget.value.length, end: e.currentTarget.selectionEnd ?? e.currentTarget.value.length };
                            }}
                            onSelect={(e) => {
                              formulaCursorRef.current = { start: e.currentTarget.selectionStart ?? e.currentTarget.value.length, end: e.currentTarget.selectionEnd ?? e.currentTarget.value.length };
                            }}
                            onChange={(e) => {
                              const value = e.target.value;
                              formulaCursorRef.current = { start: e.target.selectionStart ?? value.length, end: e.target.selectionEnd ?? value.length };
                              setEditingCellText(value);
                              setFormulaEditMode(value.trimStart().startsWith('='));
                              formulaSessionRef.current = value.trimStart().startsWith('=');
                              if (value.trimStart().startsWith('=')) {
                                formulaTargetRef.current = { col: cIndex, row: rIndex };
                                setFormulaTargetCell({ col: cIndex, row: rIndex });
                              }
                            }}
                            onBlur={() => handleCellEditSubmit(cIndex, rIndex, editingCellText)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCellEditSubmit(cIndex, rIndex, editingCellText, 'down');
                              } else if (e.key === 'Tab') {
                                e.preventDefault();
                                handleCellEditSubmit(cIndex, rIndex, editingCellText, 'right');
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingCellCoord(null);
                                setFormulaEditMode(false);
                                formulaSessionRef.current = false;
                                setFormulaReferenceRange(null);
                                formulaTargetRef.current = null;
                                setFormulaTargetCell(null);
                                setTimeout(() => {
                                  containerRef.current?.focus();
                                }, 0);
                              }
                            }}
                          />
                        ) : (
                          <span className={styles.cellText}>{formattedDisplay}</span>
                        )}

                        {/* Fill Handle at Bottom-Right of Primary Range */}
                        {isPrimaryBottomRight && !isEditing && (
                          <div
                            className={styles.fillHandle}
                            data-testid="mini-sheets-fill-handle"
                            onPointerDown={handleFillHandlePointerDown}
                            title="Arrastar para preencher dados"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
    </svg>
  );
}

function FillColorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M19 11l-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l5 5a2.12 2.12 0 0 0 3 0L19 11zM5 2v5M2 5h5M22 20a2 2 0 1 1-4 0c0-1.6 2-3 2-3s2 1.4 2 3z" />
    </svg>
  );
}

function AlignLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17 10H3M21 6H3M21 14H3M17 18H3" />
    </svg>
  );
}

function AlignCenterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 10H6M21 6H3M21 14H3M18 18H6" />
    </svg>
  );
}

function AlignRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 10H7M21 6H3M21 14H3M21 18H7" />
    </svg>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    color: var(--text-primary);
    background: var(--panel-bg);
    outline: none;
  `,
  topToolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${theme.spacing(1, 1.5)};
    border-bottom: 1px solid var(--border-color);
    background: var(--panel-header-bg, var(--surface-secondary));
    gap: 12px;
    flex-wrap: wrap;
  `,
  titleRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-primary);
    h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }
  `,
  formattingToolbar: css`
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--input-bg, var(--surface-primary));
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
  `,
  toolbarDivider: css`
    width: 1px;
    height: 18px;
    background: var(--border-color);
    margin: 0 4px;
  `,
  formatButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    font-size: 13px;
    color: var(--text-primary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;

    svg {
      color: var(--text-primary);
    }

    &:hover {
      background: var(--button-hover, var(--surface-secondary));
      color: var(--text-primary);
    }
  `,
  formatButtonActive: css`
    background: var(--selection-bg) !important;
    color: var(--accent-hover, var(--accent)) !important;
    border-color: var(--accent) !important;

    svg {
      color: var(--accent-hover, var(--accent)) !important;
    }
  `,
  colorPickerLabel: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    position: relative;
    cursor: pointer;
    font-size: 13px;
    font-weight: bold;
    color: var(--text-primary);
    border-radius: 4px;
    transition: background 0.15s ease;

    svg {
      color: var(--text-primary);
    }

    &:hover {
      background: var(--button-hover, var(--surface-secondary));
    }
  `,
  colorInput: css`
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  `,
  decimalSelect: css`
    height: 26px;
    padding: 0 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    background: var(--button-bg, var(--surface-primary));
    border: 1px solid var(--border-color);
    border-radius: 4px;
    outline: none;
    cursor: pointer;
  `,
  recalculateButton: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    background: var(--button-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

    svg {
      color: var(--text-primary);
    }

    &:hover {
      background: var(--button-hover);
      border-color: var(--accent);
      color: var(--text-primary);
    }
  `,
  formulaBarRow: css`
    display: flex;
    align-items: center;
    padding: 6px 12px;
    gap: 8px;
    background: var(--surface-secondary, var(--panel-header-bg));
    border-bottom: 1px solid var(--border-color);
  `,
  activeCellBox: css`
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 54px;
    height: 30px;
    padding: 0 8px;
    font-family: monospace;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent-hover, var(--accent));
    background: var(--input-bg, var(--panel-bg));
    border: 1px solid var(--border-color);
    border-radius: 4px;
    user-select: none;
  `,
  formulaForm: css`
    display: flex;
    align-items: center;
    flex: 1;
    height: 30px;
    background: var(--input-bg, var(--panel-bg));
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0 10px;
    gap: 8px;

    &:focus-within {
      border-color: var(--accent);
    }
  `,
  fxSymbol: css`
    font-style: italic;
    font-weight: 700;
    color: var(--text-primary);
    font-size: 13px;
    user-select: none;
  `,
  formulaInput: css`
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;

    &::placeholder {
      color: var(--text-muted);
      opacity: 0.85;
    }
  `,
  statusToast: css`
    padding: 4px 12px;
    font-size: 11px;
    color: var(--accent);
    background: var(--selection-bg);
    border-bottom: 1px solid var(--border-color);
  `,
  gridWrapper: css`
    flex: 1;
    overflow: auto;
    background: var(--panel-bg);
    position: relative;
  `,
  table: css`
    table-layout: fixed;
    border-collapse: collapse;
    width: max-content;
    user-select: none;
    background: var(--surface-primary, var(--panel-bg));
  `,
  cornerHeader: css`
    position: sticky;
    top: 0;
    left: 0;
    z-index: 3;
    width: 42px;
    height: 24px;
    background: var(--surface-secondary, var(--panel-header-bg));
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
  `,
  colHeader: css`
    position: sticky;
    top: 0;
    z-index: 2;
    height: 24px;
    padding: 2px 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    background: var(--surface-secondary, var(--panel-header-bg));
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    text-align: center;
    user-select: none;
    position: sticky;
  `,
  colResizeHandle: css`
    position: absolute;
    top: 0;
    right: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    user-select: none;
    touch-action: none;
    z-index: 10;

    &:hover {
      background-color: var(--accent);
    }
  `,
  colHeaderSelected: css`
    color: var(--text-primary) !important;
    background: rgba(24, 144, 255, 0.18) !important;
    font-weight: 700;
  `,
  rowHeader: css`
    position: sticky;
    left: 0;
    z-index: 1;
    width: 42px;
    min-width: 42px;
    height: 24px;
    padding: 2px 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    background: var(--surface-secondary, var(--panel-header-bg));
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    text-align: center;
  `,
  rowHeaderSelected: css`
    color: var(--text-primary) !important;
    background: rgba(24, 144, 255, 0.18) !important;
    font-weight: 700;
  `,
  cell: css`
    position: relative;
    height: 24px;
    padding: 2px 6px;
    font-size: 12px;
    color: var(--text-primary);
    border-right: 1px solid var(--border-subtle, var(--border-color));
    border-bottom: 1px solid var(--border-subtle, var(--border-color));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: var(--surface-primary, var(--panel-bg));
    cursor: cell;
    user-select: none;

    &:hover {
      background: var(--button-hover, var(--surface-secondary));
    }
  `,
  cellActive: css`
    outline: 2px solid #1890ff;
    outline-offset: -2px;
    background: transparent !important;
    z-index: 1;
  `,
  cellInRange: css`
    background: rgba(24, 144, 255, 0.12) !important;
  `,
  cellFormulaReference: css`
    background: rgba(24, 144, 255, 0.18) !important;
    box-shadow: inset 0 0 0 2px #1890ff;
  `,
  cellAutofillPreview: css`
    outline: 1px dashed #1890ff;
    background: rgba(24, 144, 255, 0.12) !important;
  `,
  cellSelected: css`
    outline: 2px solid #1890ff;
    outline-offset: -2px;
    background: rgba(24, 144, 255, 0.12) !important;
  `,
  cellSpilled: css`
    font-style: normal;
  `,
  cellError: css`
    color: var(--danger, #f87171) !important;
    font-weight: 600;
  `,
  cellText: css`
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  cellInlineInput: css`
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: var(--input-bg, var(--panel-bg));
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
  `,
  fillHandle: css`
    position: absolute;
    right: 0;
    bottom: 0;
    width: 6px;
    height: 6px;
    background: #1890ff;
    border: 1px solid #ffffff;
    cursor: crosshair;
    z-index: 4;
  `,
});
