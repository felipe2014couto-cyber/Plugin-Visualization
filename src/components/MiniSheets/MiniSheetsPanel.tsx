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
  rangeFromCells,
  rangeFromColumns,
  rangeFromRows,
  rangeSelectAll,
} from './miniSheetRange';

export interface CellData {
  rawValue: string; // The formula or raw entered string, e.g. '=PICurrVal("TAG")'
  displayValue: string; // The computed result to show
  spilledFrom?: string; // If this cell is populated by a spill from another cell address (e.g. 'A1')
  spillTargetAddresses?: string[]; // If this cell generated a spill across other cell addresses
}

const TOTAL_COLS = 20; // A to T
const TOTAL_ROWS = 50; // 1 to 50

type DragMode = 'cells' | 'cols' | 'rows';

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

  const cellsRef = useRef(cells);
  cellsRef.current = cells;

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

  // Global pointer/mouse up to end selection drag
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      dragModeRef.current = null;
      dragAnchorRef.current = null;
      isAppendingRangeRef.current = false;
    };
    window.addEventListener('pointerup', handleGlobalDragEnd);
    window.addEventListener('mouseup', handleGlobalDragEnd);
    window.addEventListener('blur', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('pointerup', handleGlobalDragEnd);
      window.removeEventListener('mouseup', handleGlobalDragEnd);
      window.removeEventListener('blur', handleGlobalDragEnd);
    };
  }, []);

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
      const parsed = parseFormula(cellData.rawValue);
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
          next.delete(key);
          return next;
        }
        next.set(key, {
          rawValue,
          displayValue: 'Carregando...',
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
          next.set(key, { rawValue, displayValue: String(parsed.value) });
          return evaluateStaticFormulas(next).nextMap;
        });
        return;
      }

      if (parsed.type === 'literal_string') {
        setCells((prev) => {
          const next = new Map(prev);
          next.set(key, { rawValue, displayValue: parsed.value });
          return evaluateStaticFormulas(next).nextMap;
        });
        return;
      }

      if (parsed.type === 'error') {
        setCells((prev) => {
          const next = new Map(prev);
          next.set(key, { rawValue, displayValue: parsed.error });
          return next;
        });
        return;
      }

      if (parsed.type === 'math_expression' || parsed.type === 'aggregate') {
        setCells((prev) => {
          const next = new Map(prev);
          next.set(key, { rawValue, displayValue: 'Carregando...' });
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
              next.set(key, { rawValue, displayValue: '#PI!' });
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
            next.set(key, { rawValue, displayValue: display });
            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            next.set(key, { rawValue, displayValue: '#PI!' });
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
              next.set(key, { rawValue, displayValue: targetTime === undefined ? '#FORMULA!' : '#PI!' });
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
            // Pick closest or last point before/at targetTime
            const closest = points[points.length - 1];
            display = String(closest.value);
          } else {
            // If empty in small window, fallback to preview
            const previewResults = await getPiTrendsPreviewForRange([binding], range, dataSourceSrv);
            const prevRes = previewResults[bindingKey];
            if (prevRes && prevRes.status === 'success' && prevRes.series && prevRes.series.points.length > 0) {
              const pts = prevRes.series.points;
              display = String(pts[pts.length - 1].value);
            }
          }

          setCells((prev) => {
            const next = new Map(prev);
            next.set(key, { rawValue, displayValue: display });
            return evaluateStaticFormulas(next).nextMap;
          });
        } catch {
          setCells((prev) => {
            const next = new Map(prev);
            next.set(key, { rawValue, displayValue: '#PI!' });
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
              next.set(key, {
                rawValue,
                displayValue: fromTime === undefined || toTime === undefined ? '#FORMULA!' : '#PI!',
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
              next.set(key, { rawValue, displayValue: 'Sem dados' });
              return evaluateStaticFormulas(next).nextMap;
            });
            return;
          }

          // Check for SPILL collision
          // Needs 2 columns: current col and next col (col + 1)
          // Needs points.length rows: row to row + points.length - 1
          const neededCol1 = coord.col;
          const neededCol2 = coord.col + 1;
          const neededEndRow = coord.row + points.length - 1;

          if (neededCol2 >= TOTAL_COLS || neededEndRow >= TOTAL_ROWS) {
            setCells((prev) => {
              const next = new Map(prev);
              next.set(key, { rawValue, displayValue: '#SPILL!' });
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
            if (hasCollision) {
              next.set(key, { rawValue, displayValue: '#SPILL!' });
              return next;
            }

            const spillTargets: string[] = [];

            // Set origin cell
            const firstPt = points[0];
            next.set(key, {
              rawValue,
              displayValue: formatDateTime(firstPt.time),
              spillTargetAddresses: [],
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
            next.set(key, { rawValue, displayValue: '#PI!' });
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

  return (
    <section className={styles.container} data-testid="mini-sheets-panel" aria-label="Mini-Sheets">
      {/* Header / Toolbar */}
      <div className={styles.topToolbar}>
        <div className={styles.titleRow}>
          <GridIcon />
          <h2>Sheets</h2>
          <span className={styles.badge}>PI DataLink</span>
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
                return (
                  <th
                    key={cIndex}
                    className={`${styles.colHeader} ${isColSel ? styles.colHeaderSelected : ''}`}
                    data-testid={`mini-sheets-col-header-${colIndexToLetter(cIndex)}`}
                    onClick={(e) => handleColHeaderPointerDown(cIndex, e as any)}
                    onPointerDown={(e) => handleColHeaderPointerDown(cIndex, e)}
                    onPointerEnter={(e) => handleColHeaderPointerEnter(cIndex, e)}
                    onMouseEnter={(e) => handleColHeaderPointerEnter(cIndex, e)}
                  >
                    {colIndexToLetter(cIndex)}
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
                    const isEditing = editingCellCoord?.col === cIndex && editingCellCoord?.row === rIndex;
                    const isSpilled = Boolean(cell?.spilledFrom);
                    const isError = cell?.displayValue?.startsWith('#');

                    return (
                      <td
                        key={cIndex}
                        className={`${styles.cell} ${
                          isActive
                            ? styles.cellActive
                            : isInsideSelection
                            ? styles.cellInRange
                            : ''
                        } ${isSpilled ? styles.cellSpilled : ''} ${isError ? styles.cellError : ''}`}
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
                          <span className={styles.cellText}>{cell?.displayValue ?? ''}</span>
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

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    color: var(--text-primary);
    background: var(--panel-bg);
  `,
  topToolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${theme.spacing(1, 1.5)};
    border-bottom: 1px solid var(--border-color);
    background: var(--panel-header-bg, var(--surface-secondary));
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
  badge: css`
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--selection-bg);
    color: var(--accent);
    border: 1px solid var(--accent);
    text-transform: uppercase;
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

    &:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
  `,
  fxSymbol: css`
    font-style: italic;
    font-family: serif;
    font-size: 13px;
    font-weight: bold;
    color: var(--text-secondary);
    margin-right: 6px;
    user-select: none;
  `,
  formulaInput: css`
    flex: 1;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 12px;
    font-family: monospace;

    &::placeholder {
      color: var(--text-muted, var(--text-secondary));
      font-family: inherit;
    }
  `,
  statusToast: css`
    padding: 4px 12px;
    font-size: 11px;
    color: var(--accent);
    background: var(--selection-bg);
    border-bottom: 1px solid var(--border-subtle, var(--border-color));
  `,
  gridWrapper: css`
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--canvas-bg, var(--panel-bg));
  `,
  table: css`
    border-collapse: collapse;
    table-layout: fixed;
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
    width: 100px;
    min-width: 100px;
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
    width: 100px;
    min-width: 100px;
    max-width: 100px;
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
});
