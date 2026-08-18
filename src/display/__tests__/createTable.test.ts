import { createDisplayDocument } from '../createDisplayDocument';
import { addTableItem, appendTable, createTable, removeTableItem, TABLE_TYPE } from '../createTable';

const first = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_A' };
const second = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_B' };

describe('TableElement', () => {
  it('cria uma tabela com colunas padrão e PI Point', () => {
    const table = createTable({ id: 'table-1', item: { binding: first, description: 'Primeira tag', engineeringUnit: '°C' } });
    expect(table).toMatchObject({ id: 'table-1', type: TABLE_TYPE, width: 520, height: 260, properties: { items: [{ binding: first, description: 'Primeira tag', engineeringUnit: '°C' }] } });
    expect(table.properties.columns.filter((column) => column.visible).map((column) => column.id)).toEqual(['name', 'value', 'units']);
    expect(table.properties.style).toBe('dark');
  });

  it('adiciona linhas, não duplica binding e preserva ao remover', () => {
    const document = appendTable(createDisplayDocument({ id: 'display' }), createTable({ id: 'table', item: { binding: first } }));
    const next = addTableItem(document, 'table', { binding: second });
    expect(addTableItem(next, 'table', { binding: second })).toBe(next);
    expect(next.elements[0].properties.items).toHaveLength(2);
    expect(removeTableItem(next, 'table', 0).elements[0].properties.items).toEqual([{ binding: second }]);
  });
});
