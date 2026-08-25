import { defaultTableColumns, type TableProperties } from '../createTable';
import { serializeTableData, tableDataRows } from '../tableDataExport';

const binding = { dataSourceUid: 'pims', serverPath: 'Servidor', pointName: 'SINUSOID' };
const key = `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;

function properties(): TableProperties {
  return {
    items: [{ binding, engineeringUnit: '°C' }],
    columns: defaultTableColumns().map((column) => ({
      ...column,
      visible: ['name', 'value', 'units'].includes(column.id),
    })),
    decimals: 2,
    style: 'dark',
  };
}

describe('tableDataExport', () => {
  const results = {
    [key]: {
      status: 'success' as const,
      series: {
        pointName: binding.pointName,
        points: [
          { time: Date.UTC(2026, 0, 2, 3, 4, 5), value: 10.456 },
          { time: Date.UTC(2026, 0, 2, 3, 5, 5), value: 12.5 },
        ],
      },
    },
  };

  it('exporta somente as colunas visíveis para cada valor histórico', () => {
    expect(tableDataRows(properties(), results)).toEqual([
      ['Nome', 'Valor', 'Unidades'],
      ['SINUSOID', '10.46', '°C'],
      ['SINUSOID', '12.50', '°C'],
    ]);
  });

  it('gera CSV e XML com as mesmas colunas ativas', () => {
    const csv = serializeTableData(properties(), results, 'csv');
    const xml = serializeTableData(properties(), results, 'xml');

    expect(csv).toBe('Nome,Valor,Unidades\r\nSINUSOID,10.46,°C\r\nSINUSOID,12.50,°C\r\n');
    expect(xml).toContain('<Data ss:Type="String">Nome</Data>');
    expect(xml).toContain('<Data ss:Type="String">Unidades</Data>');
    expect(xml).not.toContain('<Data ss:Type="String">Tempo</Data>');
  });
});
