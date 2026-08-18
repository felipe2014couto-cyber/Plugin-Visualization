import type { PiPointBinding } from '../pi/piPointBinding';
import type { PiTrendSeries, PiTrendSeriesResult } from '../pi/piDataSource';
import type { DisplayTimeRange } from '../time/timeRange';
import { formatAbsoluteTime } from '../time/timeRange';
import type { DisplayDocument } from './displayDocument';
import { isPiPointBinding } from '../pi/piPointBinding';
import { getTrendSeries, TREND_TYPE } from './createTrend';
import { TABLE_TYPE, type TableElement } from './createTable';

export const DISPLAY_DATA_EXPORT_MAX_POINTS = 3600;
export type DisplayDataLoader = (bindings: readonly PiPointBinding[], range: DisplayTimeRange, options: { maxDataPoints: number }) => Promise<Record<string, PiTrendSeriesResult>>;

export function collectDisplayDataBindings(document: DisplayDocument): PiPointBinding[] {
  const seen = new Set<string>();
  const output: PiPointBinding[] = [];
  const add = (binding: unknown) => {
    if (!isPiPointBinding(binding)) return;
    const key = `${binding.dataSourceUid}\u0000${binding.webId ?? ''}\u0000${binding.serverPath}\u0000${binding.pointName}`;
    if (!seen.has(key)) { seen.add(key); output.push(binding); }
  };
  document.elements.forEach((element) => {
    if (element.type === TREND_TYPE) getTrendSeries(element).forEach((series) => add(series.binding));
    else if (element.type === TABLE_TYPE) (element as TableElement).properties.items.forEach((item) => add(item.binding));
    else add(element.properties.binding);
  });
  return output;
}

export function serializePiDataCsv(bindings: readonly PiPointBinding[], results: Record<string, PiTrendSeriesResult>): string {
  const rows: unknown[][] = [['Data Source', 'Time', 'Value']];
  bindings.forEach((binding) => {
    const result = results[bindingKey(binding)];
    if (!result || result.status === 'error') return;
    seriesRows(result.series).forEach((row) => rows.push([binding.pointName, formatAbsoluteTime(row.time), row.value]));
  });
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n') + '\r\n';
}

export function serializePiDataXml(bindings: readonly PiPointBinding[], interpolated: Record<string, PiTrendSeriesResult>, recorded: Record<string, PiTrendSeriesResult>): string {
  const displayRows = new Map<number, Map<string, string | number>>();
  bindings.forEach((binding) => {
    const result = interpolated[bindingKey(binding)];
    if (!result || result.status === 'error') return;
    seriesRows(result.series).forEach(({ time, value }) => {
      const row = displayRows.get(time) ?? new Map<string, string | number>();
      row.set(bindingKey(binding), value); displayRows.set(time, row);
    });
  });
  const display = [['Time', ...bindings.map((binding) => binding.pointName)], ...[...displayRows.entries()].sort(([a], [b]) => a - b).map(([time, values]) => [formatAbsoluteTime(time), ...bindings.map((binding) => values.get(bindingKey(binding)) ?? '')])];
  const archive: unknown[][] = [['Data Source', 'Time', 'Value']];
  bindings.forEach((binding) => {
    const result = recorded[bindingKey(binding)];
    if (result?.status === 'success') seriesRows(result.series).forEach((row) => archive.push([binding.pointName, formatAbsoluteTime(row.time), row.value]));
  });
  return `<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n${worksheet('Display', display)}\n${worksheet('Archive', archive)}\n</Workbook>\n`;
}

function bindingKey(binding: PiPointBinding): string { return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`; }
function seriesRows(series: PiTrendSeries): Array<{ time: number; value: string | number }> { return [...series.points, ...(series.states ?? [])].sort((a, b) => a.time - b.time); }
function escapeCsv(value: unknown): string { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function xml(value: unknown): string { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function worksheet(name: string, rows: unknown[][]): string { return `  <Worksheet ss:Name="${xml(name)}"><Table>\n${rows.map((row) => `    <Row>${row.map((value) => `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${xml(value)}</Data></Cell>`).join('')}</Row>`).join('\n')}\n  </Table></Worksheet>`; }
