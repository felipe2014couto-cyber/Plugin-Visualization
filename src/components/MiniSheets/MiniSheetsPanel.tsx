import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  parseFormula,
  evaluateMathExpression,
  evaluateAggregate,
  type CellCoord,
} from './miniSheetFormula';
import { parsePiTime, formatDateTime } from './miniSheetTime';
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

export interface CellData {
  rawValue: string; // The formula or raw entered string, e.g. '=PICurrVal("TAG")'
  displayValue: string; // The computed result to show
  spilledFrom?: string; // If this cell is populated by a spill from another cell address (e.g. 'A1')
  spillTargetAddresses?: string[]; // If this cell generated a spill across other cell addresses
  format?: CellFormat; // Formatting: bold, italic, textColor, backgroundColor, horizontalAlign, decimalPlaces
}

const TOTAL_COLS = 20; // A to T
const TOTAL_ROWS = 50; // 1 to 50

type DragMode = 'cells' | 'cols' | 'rows' | 'autofill';

export interface MiniSheetsPanelProps {
  dataSourceSrv?: any;
}

export function MiniSheetsPanel({ dataSourceSrv }: MiniSheetsPanelProps) {
  const styles = useStyles2(getStyles);

  // Selection state
  const [activeCell, setActiveCell] = useState<CellCoord>({ col: 0, row: 0 });
  const [anchorCell, setAnchorCell] = useState<CellCoord>({ col: 0, row: 0 });
  const anchorCellRef = useRef<CellCoord>({ col: 0, row: 0 });
  anchorCellRef.current = anchorCell;

  const [ranges, setRanges] = useState<SheetRange[]>([
    { startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
  ]);

  const [cells, setCells] = useState<Map<string, CellData>>(() => new Map());
  const [formulaBarText, setFormulaBarText] = useState('');
  const [editingCellCoord, setEditingCellCoord] = useState<CellCoord | null>(null);
  const [editingCellText, setEditingCellText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Internal clipboard buffer
  const [internalClipboard, setInternalClipboard] = useState<MiniSheetClipboard | null>(null);

  // Autofill state
  const [autofillRange, setAutofillRange] = useState<SheetRange | null>(null);

  // Column widths state (column index -> width in px)
  const DEFAULT_COL_WIDTH = 100;
  const MIN_COL_WIDTH = 40;
  const [colWidths, setColWidths] = useState<Map<number, number>>(() => new Map());

  // Column resizing ref
  const resizingColRef = useRef<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const cellsRef = useRef(cells);
  cellsRef.current = cells;

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
  };

  // Pointer drag tracking
  const dragModeRef = useRef<DragMode | null>(null);
  const dragAnchorRef = useRef<{ col: number; row: number } | null>(null);
  const isAppendingRangeRef = useRef<boolean>(false);
  const baseRangesRef = useRef<SheetRange[]>([]);

  const activeKey = `${activeCell.col},${activeCell.row}`;
  const addressLabel = ranges.length > 0
    ? formatRangeAddress(ranges[ranges.length - 1], TOTAL_COLS, TOTAL_ROWS)
    : formatCellAddress(activeCell);

  // Sync formula bar when active cell changes (unless currently editing formula bar)
  useEffect(() => {
    const currentCell = cells.get(activeKey);
    setFormulaBarText(currentCell?.rawValue ?? '');
  }, [activeKey, cells]);



  /**
   * Helper to resolve a PI Point by name using existing searchPiPointsWithStatus
   */
  const resolvePiPointBindingByName = useCallback(
    async (pointName: string): Promise<PiPointBinding | null> => {
      try {
        const response = await searchPiPointsWithStatus(pointName, dataSourceSrv);
        const results = response.results ?? [];
        if (results.length === 0) {
          return null;
        }
        // Prefer exact match (case-insensitive)
        const exact = results.find(
          (p: PiPointSearchResult) => p.name.trim().toLowerCase() === pointName.trim().toLowerCase(),
        );
        const target = exact ?? results[0];
        const binding = createPiPointBinding(target);
        return binding ?? null;
      } catch (err) {
        return null;
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
    async (coord: CellCoord, rawValue: string) => {
      const key = `${coord.col},${coord.row}`;
      const address = formatCellAddress(coord);
      const trimmed = rawValue.trim();

      // Clear any previous spill targets created by this cell
      setCells((prev) => {
        const next = new Map(prev);
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
        if (!trimmed) {
          const existing = next.get(key);
          if (existing?.format) {
            next.set(key, { rawValue: '', displayValue: '', format: existing.format });
          } else {
            next.delete(key);
          }
          return evaluateStaticFormulas(next).nextMap;
        }
        const existing = next.get(key);
        next.set(key, {
          rawValue,
          displayValue: 'Carregando...',
          format: existing?.format,
        });
        return next;
      });

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

      // Handle PI Formulas
      if (parsed.type === 'pi_curr_val') {
        try {
          const binding = await resolvePiPointBindingByName(parsed.tag);
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
            next.set(key, { rawValue, displayValue: display, format: existing?.format });
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
          const binding = await resolvePiPointBindingByName(parsed.tag);
          const targetTime = parsePiTime(parsed.timeExpression);
          if (!binding || targetTime === undefined) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: targetTime === undefined ? '#FORMULA!' : '#PI!', format: existing?.format });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          // Use recorded history in a small window around target time or range up to target time
          const range = { from: targetTime - 60_000, to: targetTime + 1000 };
          const results = await getPiTrendsRecordedHistoryForRange([binding], range, dataSourceSrv);
          const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
          const result = results[bindingKey];

          let display = '#PI!';
          if (result && result.status === 'success' && result.series && result.series.points.length > 0) {
            const points = result.series.points;
            const lastPt = points[points.length - 1];
            if (lastPt && lastPt.value !== undefined && lastPt.value !== null) {
              display = String(lastPt.value);
            }
          }

          setCells((prev) => {
            const next = new Map(prev);
            const existing = next.get(key);
            next.set(key, { rawValue, displayValue: display, format: existing?.format });
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
          const binding = await resolvePiPointBindingByName(parsed.tag);
          const fromTime = parsePiTime(parsed.startTime);
          const toTime = parsePiTime(parsed.endTime);

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
              points = res.series.points.slice(0, 500);
            }
          } else {
            const results = await getPiTrendsPreviewForRange([binding], range, dataSourceSrv);
            const bindingKey = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
            const res = results[bindingKey];
            if (res && res.status === 'success' && res.series) {
              points = res.series.points.slice(0, 500);
            }
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

          // Check for SPILL collision
          const neededCol1 = coord.col;
          const neededCol2 = coord.col + 1;
          const neededEndRow = coord.row + points.length - 1;

          if (neededCol2 >= TOTAL_COLS || neededEndRow >= TOTAL_ROWS) {
            setCells((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              next.set(key, { rawValue, displayValue: '#SPILL!', format: existing?.format });
              return next;
            });
            return;
          }

          // Apply Spill or set #SPILL! if collision
          let hasCollision = false;
          setCells((prev) => {
            for (let r = coord.row; r <= neededEndRow; r++) {
              for (let c = neededCol1; c <= neededCol2; c++) {
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

            // Set origin cell
            const firstPt = points[0];
            next.set(key, {
              rawValue,
              displayValue: formatDateTime(firstPt.time),
              spillTargetAddresses: [],
              format: existingOrigin?.format,
            });

            // Set right cell of origin (value)
            const rightCoord = { col: coord.col + 1, row: coord.row };
            const rightKey = `${rightCoord.col},${rightCoord.row}`;
            const rightAddr = formatCellAddress(rightCoord);
            spillTargets.push(rightAddr);
            next.set(rightKey, {
              rawValue: '',
              displayValue: String(firstPt.value),
              spilledFrom: address,
            });

            // Set remaining rows
            for (let i = 1; i < points.length; i++) {
              const pt = points[i];
              const r = coord.row + i;

              const timeCoord = { col: coord.col, row: r };
              const timeKey = `${timeCoord.col},${timeCoord.row}`;
              const timeAddr = formatCellAddress(timeCoord);
              spillTargets.push(timeAddr);
              next.set(timeKey, {
                rawValue: '',
                displayValue: formatDateTime(pt.time),
                spilledFrom: address,
              });

              const valCoord = { col: coord.col + 1, row: r };
              const valKey = `${valCoord.col},${valCoord.row}`;
              const valAddr = formatCellAddress(valCoord);
              spillTargets.push(valAddr);
              next.set(valKey, {
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

  /**
   * DELETE / CLEAR CONTENTS: Clears cell contents across all selected ranges.
   * Cleans whole spill tree if a spilled cell or origin cell is inside range.
   */
  const handleDeleteSelected = useCallback(() => {
    setCells((prev) => {
      const next = new Map(prev);
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
            if (oCell.format) {
              next.set(oKey, { rawValue: '', displayValue: '', format: oCell.format });
            } else {
              next.delete(oKey);
            }
          }
        }
      });

      // Clear directly selected cells (keeping cell format if present)
      ranges.forEach((range) => {
        const norm = normalizeRange(range);
        for (let r = norm.top; r <= norm.bottom; r++) {
          for (let c = norm.left; c <= norm.right; c++) {
            const key = `${c},${r}`;
            const cell = next.get(key);
            if (cell) {
              if (cell.format) {
                next.set(key, { rawValue: '', displayValue: '', format: cell.format });
              } else {
                next.delete(key);
              }
            }
          }
        }
      });

      return evaluateStaticFormulas(next).nextMap;
    });
  }, [evaluateStaticFormulas, ranges]);

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

  /**
   * PASTE: Pastes internal clipboard matrix starting at activeCell.
   */
  const handlePasteSelected = useCallback(() => {
    if (!internalClipboard || internalClipboard.matrix.length === 0) {
      return;
    }
    const { matrix, sourceOrigin } = internalClipboard;
    const startCol = activeCell.col;
    const startRow = activeCell.row;

    const baseDeltaCol = sourceOrigin ? startCol - sourceOrigin.col : 0;
    const baseDeltaRow = sourceOrigin ? startRow - sourceOrigin.row : 0;

    // Get source origin from copy if available, otherwise relative to activeCell offset
    setCells((prev) => {
      const next = new Map(prev);

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

      return evaluateStaticFormulas(next).nextMap;
    });

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
  }, [activeCell.col, activeCell.row, computeCell, evaluateStaticFormulas, internalClipboard]);

  /**
   * FORMATTING: Applies partial CellFormat to all cells across all selected ranges.
   */
  const handleApplyFormat = useCallback((formatPatch: Partial<CellFormat>) => {
    setCells((prev) => {
      const next = new Map(prev);
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
      return next;
    });
  }, [ranges]);

  // Pointer event handlers for Cell Selection & Dragging
  const handleCellPointerDown = (col: number, row: number, e: React.PointerEvent) => {
    if (editingCellCoord) {
      return;
    }
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
      setCells((prev) => {
        const next = new Map(prev);
        generated.forEach((gen) => {
          const key = `${gen.col},${gen.row}`;
          next.set(key, {
            rawValue: gen.rawValue,
            displayValue: gen.displayValue,
            format: gen.format,
          });
        });
        return evaluateStaticFormulas(next).nextMap;
      });

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
          const next = new Map(prev);
          next.set(colIdx, newWidth);
          return next;
        });
      }
    };

    const handleGlobalDragEnd = () => {
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
      const newRange = rangeFromColumns(currentAnchor.col, colIndex, TOTAL_ROWS);
      setRanges((prev) => {
        if (prev.length <= 1) {
          return [newRange];
        }
        return [...prev.slice(0, prev.length - 1), newRange];
      });
      return;
    }

    const colRange = rangeFromColumns(colIndex, colIndex, TOTAL_ROWS);
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
    const currentRange = rangeFromColumns(dragAnchorRef.current.col, colIndex, TOTAL_ROWS);
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
    setRanges([rangeSelectAll(TOTAL_COLS, TOTAL_ROWS)]);
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
    computeCell(activeCell, formulaBarText);
  };

  const handleCellEditSubmit = (col: number, row: number, text: string) => {
    setEditingCellCoord(null);
    computeCell({ col, row }, text);
  };

  // Keyboard Shortcuts (Delete, Backspace, Ctrl+C, Ctrl+V, Cmd+C, Cmd+V)
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

    if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      handleCopySelected();
      return;
    }

    if (isCtrlOrCmd && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      handlePasteSelected();
      return;
    }
  };

  // Active cell format status for toolbar highlights
  const activeCellData = cells.get(activeKey);
  const activeFormat = activeCellData?.format ?? {};

  // Primary Range bounds for Fill Handle
  const primaryRange = ranges.length > 0 ? normalizeRange(ranges[ranges.length - 1]) : null;

  return (
    <section
      className={styles.container}
      data-testid="mini-sheets-panel"
      aria-label="Mini-Sheets"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header / Toolbar */}
      <div className={styles.topToolbar}>
        <div className={styles.titleRow}>
          <GridIcon />
          <h2>Sheets</h2>
        </div>

        {/* Formatting Toolbar */}
        <div className={styles.formattingToolbar} data-testid="mini-sheets-formatting-toolbar">
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
      </div>

      {/* Formula Bar and Active Cell Box */}
      <div className={styles.formulaBarRow}>
        <div className={styles.activeCellBox} data-testid="mini-sheets-active-cell" title="Endereço da seleção">
          {addressLabel}
        </div>
        <form className={styles.formulaForm} onSubmit={handleFormulaBarSubmit}>
          <span className={styles.fxSymbol}>fx</span>
          <input
            className={styles.formulaInput}
            data-testid="mini-sheets-formula-input"
            value={formulaBarText}
            placeholder="Digite um texto, número ou fórmula (ex: =PICurrVal(&quot;TAG&quot;))"
            onChange={(e) => setFormulaBarText(e.target.value)}
          />
        </form>
      </div>

      {statusMessage && <div className={styles.statusToast}>{statusMessage}</div>}

      {/* Grid */}
      <div className={styles.gridWrapper} data-testid="mini-sheets-grid">
        <table className={styles.table}>
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
                    onClick={(e) => handleColHeaderPointerDown(cIndex, e as any)}
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
                      title="Arrastar para redimensionar coluna"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: TOTAL_ROWS }).map((_, rIndex) => {
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
                    const isInsideAutofill = autofillRange ? isCellInsideRanges(cIndex, rIndex, [autofillRange]) : false;
                    const isEditing = editingCellCoord?.col === cIndex && editingCellCoord?.row === rIndex;
                    const isSpilled = Boolean(cell?.spilledFrom);
                    const isError = cell?.displayValue?.startsWith('#');
                    const isPrimaryBottomRight = primaryRange && primaryRange.right === cIndex && primaryRange.bottom === rIndex;
                    const colWidth = getColWidth(cIndex);

                    const formattedDisplay = cell?.displayValue
                      ? formatDisplayNumber(cell.displayValue, cell.format?.decimalPlaces)
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

                    return (
                      <td
                        key={cIndex}
                        className={`${styles.cell} ${
                          isActive
                            ? styles.cellActive
                            : isInsideSelection
                            ? styles.cellInRange
                            : ''
                        } ${isInsideAutofill && !isInsideSelection ? styles.cellAutofillPreview : ''} ${
                          isSpilled ? styles.cellSpilled : ''
                        } ${isError ? styles.cellError : ''}`}
                        style={customStyle}
                        data-testid={`mini-sheets-cell-${colIndexToLetter(cIndex)}${rIndex + 1}`}
                        onClick={(e) => handleCellPointerDown(cIndex, rIndex, e as any)}
                        onPointerDown={(e) => handleCellPointerDown(cIndex, rIndex, e)}
                        onPointerEnter={(e) => handleCellPointerEnter(cIndex, rIndex, e)}
                        onMouseEnter={(e) => handleCellPointerEnter(cIndex, rIndex, e)}
                        onDoubleClick={() => handleCellDoubleClick(cIndex, rIndex)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            className={styles.cellInlineInput}
                            value={editingCellText}
                            onChange={(e) => setEditingCellText(e.target.value)}
                            onBlur={() => handleCellEditSubmit(cIndex, rIndex, editingCellText)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleCellEditSubmit(cIndex, rIndex, editingCellText);
                              } else if (e.key === 'Escape') {
                                setEditingCellCoord(null);
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
    background: var(--surface-primary, var(--panel-bg));
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
  `,
  toolbarDivider: css`
    width: 1px;
    height: 16px;
    background: var(--border-color);
    margin: 0 4px;
  `,
  formatButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 12px;
    color: var(--text-primary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;

    &:hover {
      background: var(--button-hover, var(--surface-secondary));
    }
  `,
  formatButtonActive: css`
    background: var(--selection-bg) !important;
    color: var(--accent) !important;
    border-color: var(--accent) !important;
  `,
  colorPickerLabel: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    position: relative;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    color: var(--text-primary);
    border-radius: 3px;

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
    height: 24px;
    padding: 0 4px;
    font-size: 11px;
    color: var(--text-primary);
    background: var(--input-bg, var(--panel-bg));
    border: 1px solid var(--border-color);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  `,
  recalculateButton: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    background: var(--button-bg);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;

    &:hover {
      background: var(--button-hover);
      border-color: var(--accent);
    }
  `,
  formulaBarRow: css`
    display: flex;
    align-items: center;
    padding: 6px 12px;
    gap: 8px;
    background: var(--surface-secondary, var(--panel-bg));
    border-bottom: 1px solid var(--border-color);
  `,
  activeCellBox: css`
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    height: 28px;
    padding: 0 6px;
    font-family: monospace;
    font-size: 12px;
    font-weight: bold;
    color: var(--accent);
    background: var(--input-bg, var(--panel-bg));
    border: 1px solid var(--border-color);
    border-radius: 3px;
    user-select: none;
  `,
  formulaForm: css`
    display: flex;
    align-items: center;
    flex: 1;
    height: 28px;
    background: var(--input-bg, var(--panel-bg));
    border: 1px solid var(--border-color);
    border-radius: 3px;
    padding: 0 8px;
    gap: 6px;
  `,
  fxSymbol: css`
    font-style: italic;
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 12px;
    user-select: none;
  `,
  formulaInput: css`
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
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
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
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
    right: 0;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    user-select: none;
    z-index: 5;

    &:hover {
      background-color: var(--accent);
    }
  `,
  colHeaderSelected: css`
    color: var(--accent) !important;
    background: var(--selection-bg) !important;
  `,
  rowHeader: css`
    position: sticky;
    left: 0;
    z-index: 1;
    width: 42px;
    min-width: 42px;
    height: 24px;
    padding: 2px 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--surface-secondary, var(--panel-header-bg));
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    text-align: center;
  `,
  rowHeaderSelected: css`
    color: var(--accent) !important;
    background: var(--selection-bg) !important;
  `,
  cell: css`
    position: relative;
    height: 24px;
    padding: 2px 6px;
    font-size: 11px;
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
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: var(--selection-bg) !important;
    z-index: 1;
  `,
  cellInRange: css`
    background: var(--selection-bg) !important;
  `,
  cellAutofillPreview: css`
    outline: 1px dashed var(--accent);
    background: rgba(180, 22, 126, 0.15) !important;
  `,
  cellSelected: css`
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: var(--selection-bg) !important;
  `,
  cellSpilled: css`
    font-style: normal;
    background: var(--selection-bg);
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
    font-size: 11px;
    font-family: inherit;
  `,
  fillHandle: css`
    position: absolute;
    right: 0;
    bottom: 0;
    width: 6px;
    height: 6px;
    background: var(--accent);
    border: 1px solid #ffffff;
    cursor: crosshair;
    z-index: 4;
  `,
});
