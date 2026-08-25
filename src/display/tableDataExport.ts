import type { PiTrendSeriesResult } from '../pi/piDataSource';
import { formatAbsoluteTime } from '../time/timeRange';
import { TABLE_COLUMN_LABELS, type TableColumnConfig, type TableDataItem, type TableProperties } from './createTable';

export type TableDataExportFormat = 'csv' | 'xml';

export function serializeTableData(
  properties: Pick<TableProperties, 'items' | 'columns' | 'decimals'>,
  results: Record<string, PiTrendSeriesResult>,
  format: TableDataExportFormat,
): string {
  const rows = tableDataRows(properties, results);
  return format === 'csv' ? serializeCsv(rows) : serializeXml(rows);
}

export function tableDataRows(
  properties: Pick<TableProperties, 'items' | 'columns' | 'decimals'>,
  results: Record<string, PiTrendSeriesResult>,
): string[][] {
  const columns = properties.columns.filter((column) => column.visible && column.id !== 'trend');
  const header = columns.map((column) => TABLE_COLUMN_LABELS[column.id]);
  const rows: string[][] = [header];

  properties.items.forEach((item) => {
    const result = results[bindingKey(item)];
    if (!result || result.status !== 'success') {
      return;
    }
    const points = [...result.series.points, ...(result.series.states ?? [])]
      .sort((a, b) => a.time - b.time);
    const numericValues = result.series.points.map((point) => point.value).filter(Number.isFinite);
    const summary = summarize(numericValues);
    points.forEach((point) => {
      rows.push(columns.map((column) => tableExportValue(column, item, point.time, point.value, summary, properties.decimals)));
    });
  });
  return rows;
}

function tableExportValue(
  column: TableColumnConfig,
  item: TableDataItem,
  time: number,
  value: string | number,
  summary: Summary,
  decimals: number | null,
): string {
  switch (column.id) {
    case 'path': return item.path ?? item.binding.serverPath;
    case 'name': return item.nameMode === 'custom' && item.customName?.trim() ? item.customName : item.binding.pointName;
    case 'description': return item.description ?? '';
    case 'value': return formatValue(value, decimals);
    case 'units': return item.engineeringUnit ?? '';
    case 'time': return formatAbsoluteTime(time);
    case 'average': return formatValue(summary.average, decimals);
    case 'minimum': return formatValue(summary.minimum, decimals);
    case 'maximum': return formatValue(summary.maximum, decimals);
    case 'range': return formatValue(summary.range, decimals);
    case 'stdDev':
    case 'pStdDev': return formatValue(summary.stdDev, decimals);
    case 'trend': return '';
  }
}

interface Summary { average?: number; minimum?: number; maximum?: number; range?: number; stdDev?: number; }
function summarize(values: number[]): Summary {
  if (values.length === 0) return {};
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
  return { minimum, maximum, average, range: maximum - minimum, stdDev };
}

function bindingKey(item: TableDataItem): string {
  const binding = item.binding;
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}
function formatValue(value: string | number | undefined, decimals: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) && decimals !== null ? value.toFixed(decimals) : String(value ?? '');
}
function serializeCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n') + '\r\n';
}
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function serializeXml(rows: string[][]): string {
  const body = rows.map((row) => `    <Row>${row.map((value) => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`).join('')}</Row>`).join('\n');
  return `<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n  <Worksheet ss:Name="Tabela"><Table>\n${body}\n  </Table></Worksheet>\n</Workbook>\n`;
}
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
