import React from 'react';
import type { PiPointValue } from '../../pi/piDataSource';
import { TABLE_COLUMN_LABELS, defaultTableColumns, type TableColumnConfig, type TableElement } from '../createTable';
import type { ValueRuntimeState } from '../runtime/valueRuntime';
import type { TrendRuntimeState } from '../runtime/trendRuntime';

export interface TableElementViewProps {
  element: TableElement;
  runtimeStates: ReadonlyMap<string, ValueRuntimeState>;
  trendStates?: ReadonlyMap<string, TrendRuntimeState>;
}

export function getTableItemConsumerId(tableId: string, index: number): string {
  return `${tableId}:table-item:${index}`;
}
export function getTableTrendConsumerId(tableId: string, index: number): string { return `${tableId}:table-trend:${index}`; }

export const TableElementView = React.memo(function TableElementView({ element, runtimeStates, trendStates }: TableElementViewProps) {
  const style = getTableStyle(element.properties.style);
  const columns = visibleColumns(element.properties.columns);
  const headerHeight = Math.max(28, Math.min(48, element.height * 0.15));
  const rowHeight = Math.max(24, (element.height - headerHeight) / Math.max(1, element.properties.items.length));
  const headerFontSize = Math.max(12, Math.min(22, headerHeight * 0.5));
  const rowFontSize = Math.max(12, Math.min(24, rowHeight * 0.42));
  const columnWidth = element.width / columns.length;
  const clipId = `table-clip-${element.id}`;
  return <g data-testid={`display-element-${element.id}`} data-element-id={element.id} data-element-type={element.type} style={{ cursor: 'move' }}>
    <defs><clipPath id={clipId}><rect x={element.x} y={element.y} width={element.width} height={element.height} rx={4} /></clipPath></defs>
    <rect x={element.x} y={element.y} width={element.width} height={element.height} rx={4} fill={style.background} stroke={style.border} />
    <g clipPath={`url(#${clipId})`} pointerEvents="all">
      <rect x={element.x} y={element.y} width={element.width} height={headerHeight} fill={style.header} />
      {columns.map((column, index) => <text key={column.id} x={cellX(element.x, columnWidth, index, column, 8)} y={element.y + headerHeight / 2} fill={style.headerText} fontSize={headerFontSize} fontWeight={600} textAnchor={textAnchor(column)} dominantBaseline="middle">{TABLE_COLUMN_LABELS[column.id]}</text>)}
      {element.properties.items.map((item, rowIndex) => {
        const state = runtimeStates.get(getTableItemConsumerId(element.id, rowIndex));
        return <g key={`${item.binding.dataSourceUid}-${item.binding.pointName}-${rowIndex}`}>
          <rect x={element.x} y={element.y + headerHeight + rowIndex * rowHeight} width={element.width} height={rowHeight} fill={style.row(rowIndex)} stroke={style.grid} />
          {columns.map((column, index) => <TableCell key={column.id} textColor={style.text(rowIndex)} fontSize={rowFontSize} column={column} x={element.x + index * columnWidth} y={element.y + headerHeight + rowIndex * rowHeight} width={columnWidth} height={rowHeight} item={item} current={state?.status === 'success' ? state.result : undefined} trend={trendStates?.get(getTableTrendConsumerId(element.id, rowIndex))} decimals={element.properties.decimals} />)}
        </g>;
      })}
    </g>
  </g>;
});

function TableCell({ column, textColor, fontSize, x, y, width, height, item, current, trend, decimals }: { column: TableColumnConfig; textColor: string; fontSize: number; x: number; y: number; width: number; height: number; item: TableElement['properties']['items'][number]; current?: PiPointValue; trend?: TrendRuntimeState; decimals: number | null }) {
  if (column.id === 'trend') return <Sparkline x={x + 5} y={y + 5} width={Math.max(1, width - 10)} height={Math.max(1, height - 10)} trend={trend} />;
  const value = truncate(tableCellValue(column.id, item, current, decimals, trend), Math.max(4, Math.floor(width / 7)));
  return <text x={cellX(x, width, 0, column, 8)} y={y + height / 2} fill={textColor} fontSize={fontSize} textAnchor={textAnchor(column)} dominantBaseline="middle">{value}</text>;
}
function Sparkline({ x, y, width, height, trend }: { x: number; y: number; width: number; height: number; trend?: TrendRuntimeState }) {
  const points = trend?.status === 'success' ? trend.data.points : [];
  if (points.length < 2) return <text x={x + width / 2} y={y + height / 2} fill="var(--text-secondary, #aaa)" fontSize={11} textAnchor="middle" dominantBaseline="middle">—</text>;
  const values = points.map((point) => point.value); const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x + (index / (points.length - 1)) * width},${y + height - ((point.value - min) / span) * height}`).join(' ');
  return <path d={path} fill="none" stroke="#6e9fff" strokeWidth={1.5} pointerEvents="none" />;
}

function visibleColumns(columns: readonly TableColumnConfig[]): TableColumnConfig[] {
  const result = columns.filter((column) => column.visible);
  return result.length ? result : defaultTableColumns().filter((column) => column.visible);
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
