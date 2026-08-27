import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTable } from '../../createTable';
import { getTableTrendConsumerId, TableElementView } from '../TableElementView';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_A' };
function pointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', pointerId: number, clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, clientX: { value: clientX }, clientY: { value: 0 } });
  fireEvent(target, event);
}

describe('TableElementView', () => {
  it('redimensiona duas colunas vizinhas e persiste somente no pointerUp', () => {
    const element = createTable({ id: 'table', item: { binding }, x: 0, y: 0, width: 520 });
    const onColumnsChange = jest.fn();
    render(<svg><TableElementView element={element} runtimeStates={new Map()} onColumnsChange={onColumnsChange} /></svg>);

    const divider = screen.getByTestId('table-resize-table-name');
    pointer(divider, 'pointerdown', 1, 173);
    pointer(divider, 'pointermove', 1, 223);
    expect(onColumnsChange).not.toHaveBeenCalled();
    pointer(divider, 'pointerup', 1, 223);

    const columns = onColumnsChange.mock.calls[0][0];
    const name = columns.find((column: { id: string }) => column.id === 'name');
    const value = columns.find((column: { id: string }) => column.id === 'value');
    expect(name.width).toBeCloseTo(223, 0);
    expect(value.width).toBeCloseTo(123, 0);
  });

  it('reorganiza as colunas ao arrastar o cabeçalho', () => {
    const element = createTable({ id: 'table', item: { binding }, x: 0, y: 0, width: 520 });
    const onColumnsChange = jest.fn();
    render(<svg><TableElementView element={element} runtimeStates={new Map()} onColumnsChange={onColumnsChange} /></svg>);

    const valueHeader = screen.getByTestId('table-header-table-value');
    pointer(valueHeader, 'pointerdown', 2, 430);
    pointer(valueHeader, 'pointermove', 2, 10);
    pointer(valueHeader, 'pointerup', 2, 10);

    expect(onColumnsChange.mock.calls[0][0].filter((column: { visible: boolean }) => column.visible).map((column: { id: string }) => column.id)).toEqual(['value', 'name', 'units']);
  });

  it('desenha uma tendência contínua para tag digital com um único estado no intervalo', () => {
    const source = createTable({ id: 'table', item: { binding }, x: 0, y: 0, width: 520 });
    const element = {
      ...source,
      properties: {
        ...source.properties,
        columns: source.properties.columns.map((column) => ({ ...column, visible: column.id === 'name' || column.id === 'trend' })),
      },
    };
    const trendStates = new Map([[getTableTrendConsumerId('table', 0), {
      status: 'success' as const,
      data: { pointName: 'TAG_A', points: [], states: [{ time: 1, value: 'On' }] },
    }]]);
    const { container } = render(<svg><TableElementView element={element} runtimeStates={new Map()} trendStates={trendStates} /></svg>);

    expect(container.querySelector('path[stroke="#6e9fff"]')).not.toBeNull();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
