import { createBar, createBarChart, createDisplayDocument, createRectangle, createTable, createTrend } from '../index';
import { collectDisplayDataBindings, DISPLAY_DATA_EXPORT_MAX_POINTS, serializePiDataCsv, serializePiDataXml } from '../displayDataExport';

const first = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_A' };
const second = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_B' };
const result = (pointName: string, points: Array<{ time: number; value: number }> = [], states?: Array<{ time: number; value: string }>) => ({ status: 'success' as const, series: { pointName, points, ...(states ? { states } : {}) } });
const key = (binding: typeof first) => `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;

describe('displayDataExport', () => {
  it('coleta bindings únicos de elementos e séries da Trend', () => {
    const document = createDisplayDocument({ id: 'display', name: 'Dados' });
    document.elements = [createBar({ id: 'bar', binding: first }), createRectangle({ id: 'shape' }), createTrend({ id: 'trend', binding: first })];
    (document.elements[2].properties as { series: unknown[] }).series.push({ binding: second, color: '#fff' });
    expect(collectDisplayDataBindings(document)).toEqual([first, second]);
  });

  it('inclui os PI Points das tabelas na exportação de dados', () => {
    const document = createDisplayDocument({ id: 'display', name: 'Dados' });
    const table = createTable({ id: 'table', item: { binding: first } });
    table.properties.items.push({ binding: second });
    document.elements = [table];
    expect(collectDisplayDataBindings(document)).toEqual([first, second]);
  });

  it('inclui os PI Points do Gráfico de Barras na exportação de dados', () => {
    const document = createDisplayDocument({ id: 'display', name: 'Dados' });
    const barChart = createBarChart({ id: 'barchart', binding: first });
    barChart.properties.items.push({ binding: second });
    document.elements = [barChart];
    expect(collectDisplayDataBindings(document)).toEqual([first, second]);
  });

  it('gera CSV recorded com valores numéricos e digitais escapados', () => {
    const csv = serializePiDataCsv([first, second], {
      [key(first)]: result('TAG_A', [{ time: 1_000, value: 10 }]),
      [key(second)]: result('TAG_B', [], [{ time: 2_000, value: 'Ligado, "Auto"' }]),
    });
    expect(csv).toContain('Data Source,Time,Value');
    expect(csv).toContain('TAG_A,1970-01-01 00:00:01,10');
    expect(csv).toContain('"Ligado, ""Auto"""');
  });

  it('gera workbook XML com worksheets Display e Archive', () => {
    const recorded = { [key(first)]: result('TAG_A', [{ time: 1_000, value: 10 }]), [key(second)]: result('TAG_B', [{ time: 1_000, value: 20 }]) };
    const xml = serializePiDataXml([first, second], recorded, recorded);
    expect(xml).toContain('Worksheet ss:Name="Display"');
    expect(xml).toContain('Worksheet ss:Name="Archive"');
    expect(DISPLAY_DATA_EXPORT_MAX_POINTS).toBe(3600);
  });
});
