import React, { useEffect, useRef, useState } from 'react';
import type { PiPointValue } from '../../pi/piDataSource';
import { TABLE_COLUMN_LABELS, defaultTableColumns, type TableColumnConfig, type TableElement } from '../createTable';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import type { TrendRuntimeState } from '../runtime/trendRuntime';

export interface TableElementViewProps {
  element: TableElement;
  runtimeStates: ReadonlyMap<string, ValueRuntimeState>;
  trendStates?: ReadonlyMap<string, TrendRuntimeState>;
  onTableLayoutChange?: (columns: TableColumnConfig[], tableWidth: number) => void;
}

export function getTableItemConsumerId(tableId: string, index: number): string {
  return `${tableId}:table-item:${index}`;
}
export function getTableTrendConsumerId(tableId: string, index: number): string { return `${tableId}:table-trend:${index}`; }

const MIN_COLUMN_WIDTH = 60;
const SCROLLBAR_HEIGHT = 16;
const SCROLLBAR_PADDING = 4;
const MIN_SCROLLBAR_THUMB_WIDTH = 24;

type ColumnInteraction =
  | { kind: 'resize'; pointerId: number; startX: number; columnId: TableColumnConfig['id']; startWidth: number; startColumns: TableColumnConfig[] }
  | { kind: 'reorder'; pointerId: number; sourceId: TableColumnConfig['id']; targetIndex: number }
  | { kind: 'scrollbar'; pointerId: number; startX: number; startScrollX: number };

export const TableElementView = React.memo(function TableElementView({ element, runtimeStates, trendStates, onTableLayoutChange }: TableElementViewProps) {
  const [previewColumns, setPreviewColumns] = useState<TableColumnConfig[]>(element.properties.columns);
  const previewColumnsRef = useRef(previewColumns);
  const [interaction, setInteraction] = useState<ColumnInteraction | null>(null);
  const [scrollX, setScrollX] = useState<number>(0);

  useEffect(() => {
    previewColumnsRef.current = element.properties.columns;
    setPreviewColumns(element.properties.columns);
  }, [element.properties.columns]);

  const setPreview = (columns: TableColumnConfig[]) => { 
    previewColumnsRef.current = columns; 
    setPreviewColumns(columns); 
  };

  const style = getTableStyle(element.properties.style);
  const columns = visibleColumns(previewColumns, element.width);
  const contentWidth = columns.reduce((sum, col) => sum + (col.width ?? MIN_COLUMN_WIDTH), 0);
  const maxScrollX = Math.max(0, contentWidth - element.width);
  const clampedScrollX = clamp(scrollX, 0, maxScrollX);
  const showScrollbar = maxScrollX > 0;
  
  const viewportHeight = showScrollbar ? element.height - SCROLLBAR_HEIGHT : element.height;
  
  const headerHeight = Math.max(28, Math.min(48, viewportHeight * 0.15));
  const rowHeight = Math.max(24, (viewportHeight - headerHeight) / Math.max(1, element.properties.items.length));
  const headerFontSize = Math.max(12, Math.min(22, headerHeight * 0.5));
  const rowFontSize = Math.max(12, Math.min(24, rowHeight * 0.42));
  
  const clipId = `table-clip-${element.id}`;
  const contentClipId = `table-content-clip-${element.id}`;
  const columnOffsets = offsetsForColumns(columns, element.x);
  
  const pointerX = (event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>) => svgXFromEvent(event);
  const contentPointerX = (event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>) => pointerX(event) + clampedScrollX;
  
  const startResize = (event: React.PointerEvent<SVGRectElement>, column: TableColumnConfig) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    
    const startColumns = visibleColumns(previewColumnsRef.current, element.width);
    const startColumn = startColumns.find(c => c.id === column.id);
    
    setInteraction({ 
      kind: 'resize', 
      pointerId: event.pointerId, 
      startX: contentPointerX(event), 
      columnId: column.id, 
      startWidth: startColumn?.width ?? MIN_COLUMN_WIDTH, 
      startColumns
    });
  };
  
  const startReorder = (event: React.PointerEvent<SVGGElement>, source: TableColumnConfig) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteraction({ kind: 'reorder', pointerId: event.pointerId, sourceId: source.id, targetIndex: columns.findIndex((column) => column.id === source.id) });
  };
  
  const startScrollbar = (event: React.PointerEvent<SVGRectElement>) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteraction({ kind: 'scrollbar', pointerId: event.pointerId, startX: pointerX(event), startScrollX: clampedScrollX });
  };
  
  const moveInteraction = (event: React.PointerEvent<SVGElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    
    if (interaction.kind === 'scrollbar') {
      const trackWidth = element.width - 2 * SCROLLBAR_PADDING;
      const thumbWidth = Math.max(MIN_SCROLLBAR_THUMB_WIDTH, trackWidth * (element.width / contentWidth));
      const thumbTravel = Math.max(0, trackWidth - thumbWidth);
      if (thumbTravel > 0) {
        const deltaTrack = pointerX(event) - interaction.startX;
        const scrollDelta = deltaTrack * (maxScrollX / thumbTravel);
        setScrollX(clamp(interaction.startScrollX + scrollDelta, 0, maxScrollX));
      }
      return;
    }
    
    if (interaction.kind === 'resize') {
      const delta = contentPointerX(event) - interaction.startX;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, interaction.startWidth + delta);
      
      const newColumns = interaction.startColumns.map((c) => 
        c.id === interaction.columnId ? { ...c, width: newWidth } : c
      );
      
      const fullNewColumns = previewColumnsRef.current.map((c) => {
        const found = newColumns.find(nc => nc.id === c.id);
        return found ? { ...c, width: found.width } : c;
      });
      
      setPreview(fullNewColumns);
      return;
    }
    
    const targetIndex = insertionIndexForX(contentPointerX(event), columnOffsets, columns);
    if (targetIndex !== interaction.targetIndex) setInteraction({ ...interaction, targetIndex });
  };
  
  const finishInteraction = (event: React.PointerEvent<SVGElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    
    if (interaction.kind === 'scrollbar') {
      setInteraction(null);
      return;
    }
    
    const next = interaction.kind === 'reorder'
      ? reorderVisibleColumns(previewColumnsRef.current, interaction.sourceId, interaction.targetIndex, element.width)
      : previewColumnsRef.current;
    
    if (next !== previewColumnsRef.current) {
      setPreview(next);
    }
    setInteraction(null);
    if (onTableLayoutChange && JSON.stringify(next) !== JSON.stringify(element.properties.columns)) {
      onTableLayoutChange(next, element.width);
    }
  };
  
  const handleTrackClick = (event: React.MouseEvent<SVGRectElement>) => {
    if (interaction) return;
    event.preventDefault(); event.stopPropagation();
    const x = pointerX(event) - element.x;
    const trackWidth = element.width - 2 * SCROLLBAR_PADDING;
    const thumbWidth = Math.max(MIN_SCROLLBAR_THUMB_WIDTH, trackWidth * (element.width / contentWidth));
    const thumbTravel = Math.max(0, trackWidth - thumbWidth);
    const thumbX = (clampedScrollX / maxScrollX) * thumbTravel + SCROLLBAR_PADDING;
    
    if (x < thumbX) {
      setScrollX(clamp(clampedScrollX - element.width, 0, maxScrollX));
    } else if (x > thumbX + thumbWidth) {
      setScrollX(clamp(clampedScrollX + element.width, 0, maxScrollX));
    }
  };

  const bgWidth = Math.max(contentWidth, element.width);

  return <g data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} style={{ cursor: 'move' }}>
    <defs>
      <clipPath id={clipId}><rect x={element.x} y={element.y} width={element.width} height={element.height} rx={4} /></clipPath>
      <clipPath id={contentClipId}><rect x={element.x} y={element.y} width={element.width} height={viewportHeight} rx={4} /></clipPath>
    </defs>
    
    <rect x={element.x} y={element.y} width={element.width} height={element.height} rx={4} fill={style.background} stroke={style.border} />
    
    <g clipPath={`url(#${contentClipId})`} pointerEvents="all">
      <g transform={`translate(${-clampedScrollX} 0)`}>
        <rect x={element.x} y={element.y} width={bgWidth} height={headerHeight} fill={style.header} />
        {columns.map((column, index) => {
          const x = columnOffsets[index]; const width = column.width ?? MIN_COLUMN_WIDTH;
          const moving = interaction?.kind === 'reorder' && interaction.sourceId === column.id;
          return <g key={column.id} data-testid={`table-header-${element.id}-${column.id}`} onPointerDown={(event) => startReorder(event, column)} onPointerMove={moveInteraction} onPointerUp={finishInteraction} onPointerCancel={finishInteraction} style={{ cursor: interaction?.kind === 'reorder' ? 'grabbing' : 'grab', opacity: moving ? 0.45 : 1 }}>
            <rect x={x} y={element.y} width={width} height={headerHeight} fill="transparent" />
            <text x={cellX(x, width, 0, column, 8)} y={element.y + headerHeight / 2} fill={style.headerText} fontSize={headerFontSize} fontWeight={600} textAnchor={textAnchor(column)} dominantBaseline="middle" pointerEvents="none">{TABLE_COLUMN_LABELS[column.id]}</text>
            <rect data-testid={`table-resize-${element.id}-${column.id}`} x={x + width - 5} y={element.y} width={10} height={headerHeight} fill="transparent" onPointerDown={(event) => startResize(event, column)} onPointerMove={moveInteraction} onPointerUp={finishInteraction} onPointerCancel={finishInteraction} style={{ cursor: 'col-resize' }} />
          </g>;
        })}
        {interaction?.kind === 'reorder' && <line x1={insertionLineX(interaction.targetIndex, columnOffsets, columns, element.x + bgWidth)} x2={insertionLineX(interaction.targetIndex, columnOffsets, columns, element.x + bgWidth)} y1={element.y + 2} y2={element.y + headerHeight - 2} stroke="var(--selection-outline, #6e9fff)" strokeWidth={3} pointerEvents="none" />}
        {element.properties.items.map((item, rowIndex) => {
          const state = runtimeStates.get(getTableItemConsumerId(element.id, rowIndex));
          return <g key={`${item.binding.dataSourceUid}-${item.binding.pointName}-${rowIndex}`} data-table-item-index={rowIndex}>
            <rect x={element.x} y={element.y + headerHeight + rowIndex * rowHeight} width={bgWidth} height={rowHeight} fill={style.row(rowIndex)} stroke={style.grid} />
            {columns.map((column, index) => <TableCell key={column.id} textColor={style.text(rowIndex)} fontSize={rowFontSize} column={column} x={columnOffsets[index]} y={element.y + headerHeight + rowIndex * rowHeight} width={column.width ?? MIN_COLUMN_WIDTH} height={rowHeight} item={item} current={state?.status === 'success' ? state.result : undefined} trend={trendStates?.get(getTableTrendConsumerId(element.id, rowIndex))} decimals={element.properties.decimals} />)}
          </g>;
        })}
        {columns.map((column, index) => {
          if (index === columns.length - 1) return null;
          const x = columnOffsets[index];
          const width = column.width ?? MIN_COLUMN_WIDTH;
          return <line key={`col-div-${column.id}`} x1={x + width} y1={element.y} x2={x + width} y2={element.y + viewportHeight} stroke={style.grid} strokeWidth={1} pointerEvents="none" />;
        })}
      </g>
    </g>
    
    {showScrollbar && (() => {
      const trackWidth = element.width - 2 * SCROLLBAR_PADDING;
      const thumbWidth = Math.max(MIN_SCROLLBAR_THUMB_WIDTH, trackWidth * (element.width / contentWidth));
      const thumbTravel = Math.max(0, trackWidth - thumbWidth);
      const thumbX = element.x + SCROLLBAR_PADDING + (clampedScrollX / maxScrollX) * thumbTravel;
      const trackY = element.y + element.height - SCROLLBAR_HEIGHT;
      
      return <g pointerEvents="all">
        <rect x={element.x + SCROLLBAR_PADDING} y={trackY + 4} width={trackWidth} height={SCROLLBAR_HEIGHT - 8} rx={4} fill="rgba(100, 100, 100, 0.2)" onPointerDown={handleTrackClick} style={{ cursor: 'pointer' }} />
        <rect x={thumbX} y={trackY + 4} width={thumbWidth} height={SCROLLBAR_HEIGHT - 8} rx={4} fill="rgba(150, 150, 150, 0.5)" onPointerDown={startScrollbar} onPointerMove={moveInteraction} onPointerUp={finishInteraction} onPointerCancel={finishInteraction} style={{ cursor: 'grab' }} />
      </g>;
    })()}
  </g>;
});

function TableCell({ column, textColor, fontSize, x, y, width, height, item, current, trend, decimals }: { column: TableColumnConfig; textColor: string; fontSize: number; x: number; y: number; width: number; height: number; item: TableElement['properties']['items'][number]; current?: PiPointValue; trend?: TrendRuntimeState; decimals: number | null }) {
  if (column.id === 'trend') return <Sparkline x={x + 5} y={y + 5} width={Math.max(1, width - 10)} height={Math.max(1, height - 10)} trend={trend} />;
  const value = truncate(tableCellValue(column.id, item, current, decimals, trend), Math.max(4, Math.floor(width / 7)));
  return <text x={cellX(x, width, 0, column, 8)} y={y + height / 2} fill={textColor} fontSize={fontSize} textAnchor={textAnchor(column)} dominantBaseline="middle" pointerEvents="none">{value}</text>;
}
function Sparkline({ x, y, width, height, trend }: { x: number; y: number; width: number; height: number; trend?: TrendRuntimeState }) {
  const points = trend?.status === 'success' ? trend.data.points : [];
  const states = trend?.status === 'success' ? trend.data.states ?? [] : [];
  if (points.length < 2 && states.length === 0) return <text x={x + width / 2} y={y + height / 2} fill="var(--text-secondary, #aaa)" fontSize={11} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">—</text>;
  const stateLabels = [...new Set(states.map((state) => state.value))];
  const values = points.length >= 2
    ? points.map((point) => point.value)
    : states.map((state) => stateLabels.indexOf(state.value));
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const path = points.length >= 2
    ? points.map((point, index) => `${index ? 'L' : 'M'}${x + (index / (points.length - 1)) * width},${y + height - ((point.value - min) / span) * height}`).join(' ')
    : digitalSparklinePath(x, y, width, height, values, min, span);
  return <path d={path} fill="none" stroke="#6e9fff" strokeWidth={1.5} pointerEvents="none" />;
}

function digitalSparklinePath(x: number, y: number, width: number, height: number, values: readonly number[], min: number, span: number): string {
  const yFor = (value: number) => y + height - ((value - min) / span) * height;
  if (values.length === 1) {
    const midY = y + height / 2;
    return `M${x},${midY} L${x + width},${midY}`;
  }
  return values.map((value, index) => {
    const xPosition = x + (index / (values.length - 1)) * width;
    if (index === 0) return `M${xPosition},${yFor(value)}`;
    return `L${xPosition},${yFor(values[index - 1])} L${xPosition},${yFor(value)}${index === values.length - 1 ? ` L${x + width},${yFor(value)}` : ''}`;
  }).join(' ');
}

function visibleColumns(columns: readonly TableColumnConfig[], tableWidth: number): TableColumnConfig[] {
  const result = columns.filter((column) => column.visible);
  const source = result.length ? result : defaultTableColumns(tableWidth).filter((column) => column.visible);
  const fallbackWidth = tableWidth / Math.max(1, source.length);
  return source.map((column) => ({ ...column, width: Number.isFinite(column.width) && (column.width ?? 0) >= MIN_COLUMN_WIDTH ? column.width! : fallbackWidth }));
}

function offsetsForColumns(columns: readonly TableColumnConfig[], start: number): number[] {
  let offset = start;
  return columns.map((column) => { const current = offset; offset += column.width ?? MIN_COLUMN_WIDTH; return current; });
}
function svgXFromEvent(event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>): number {
  const svg = event.currentTarget.ownerSVGElement;
  const ctm = typeof svg?.getScreenCTM === 'function' ? svg.getScreenCTM() : undefined;
  if (svg && ctm && typeof svg.createSVGPoint === 'function') {
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(ctm.inverse()).x;
  }
  return event.clientX;
}
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }

function insertionIndexForX(x: number, offsets: readonly number[], columns: readonly TableColumnConfig[]): number {
  for (let index = 0; index < columns.length; index += 1) {
    const midpoint = offsets[index] + (columns[index].width ?? 0) / 2;
    if (x < midpoint) return index;
  }
  return columns.length;
}
function insertionLineX(index: number, offsets: readonly number[], columns: readonly TableColumnConfig[], end: number): number {
  return index >= columns.length ? end : offsets[index];
}
function reorderVisibleColumns(columns: readonly TableColumnConfig[], sourceId: TableColumnConfig['id'], targetIndex: number, tableWidth: number): TableColumnConfig[] {
  const visible = visibleColumns(columns, tableWidth);
  const source = visible.find((column) => column.id === sourceId);
  if (!source) return [...columns];
  const remaining = visible.filter((column) => column.id !== sourceId);
  const currentIndex = visible.findIndex((column) => column.id === sourceId);
  const insertIndex = targetIndex > currentIndex ? targetIndex - 1 : targetIndex;
  remaining.splice(clamp(insertIndex, 0, remaining.length), 0, source);
  const byId = new Map(columns.map((column) => [column.id, column]));
  return [...remaining.map((column) => ({ ...byId.get(column.id)!, width: column.width })), ...columns.filter((column) => !column.visible)];
}
function textAnchor(column: TableColumnConfig): 'start' | 'middle' | 'end' { return column.align === 'right' ? 'end' : column.align === 'center' ? 'middle' : 'start'; }
function cellX(x: number, width: number, index: number, column: TableColumnConfig, padding: number): number { return column.align === 'right' ? x + (index + 1) * width - padding : column.align === 'center' ? x + (index + .5) * width : x + index * width + padding; }
function truncate(value: string, max: number): string { return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value; }
function tableCellValue(column: TableColumnConfig['id'], item: TableElement['properties']['items'][number], result: PiPointValue | undefined, decimals: number | null, trend?: TrendRuntimeState): string {
  if (column === 'name') return item.nameMode === 'custom' && item.customName?.trim() ? item.customName : item.binding.pointName;
  if (column === 'path') return item.path ?? item.binding.serverPath;
  if (column === 'description') return item.description ?? '';
  if (column === 'units') return result?.unit ?? item.engineeringUnit ?? '';
  if (column === 'time') return result?.timestamp ? formatTime(result.timestamp) : '';
  if (column === 'value') return result ? formatValue(result.value, decimals) : '…';
  const values = trend?.status === 'success' ? trend.data.points.map((point) => point.value).filter(Number.isFinite) : [];
  if (values.length === 0) return '—';
  const min = Math.min(...values); const max = Math.max(...values); const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (column === 'minimum') return formatValue(min, decimals);
  if (column === 'maximum') return formatValue(max, decimals);
  if (column === 'average') return formatValue(average, decimals);
  if (column === 'range') return formatValue(max - min, decimals);
  const stdDev = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
  return formatValue(stdDev, decimals);
}
function formatValue(value: unknown, decimals: number | null): string { return typeof value === 'number' && Number.isFinite(value) && decimals !== null ? value.toFixed(decimals) : String(value ?? ''); }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR'); }
function getTableStyle(style: TableElement['properties']['style'] | undefined) {
  if (style === 'light') return { background: '#f8fafc', border: '#9ca3af', header: '#e5e7eb', headerText: '#111827', text: () => '#111827', grid: '#cbd5e1', row: () => '#ffffff' };
  if (style === 'striped') return { background: '#3f3f46', border: '#71717a', header: '#3f3f46', headerText: '#ffffff', text: (index: number) => index % 2 === 0 ? '#111827' : '#f8fafc', grid: '#52525b', row: (index: number) => index % 2 === 0 ? '#d4d4d8' : '#52525b' };
  return { background: '#1f2937', border: '#64748b', header: '#374151', headerText: '#f8fafc', text: () => '#f8fafc', grid: '#4b5563', row: (index: number) => index % 2 === 0 ? '#1f2937' : '#303b4d' };
}
