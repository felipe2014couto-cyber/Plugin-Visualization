import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { createValue } from '../../createValue';
import { ValueElementView } from '../ValueElementView';

const binding = {
  dataSourceUid: 'resolved-datasource',
  serverPath: 'pims',
  pointName: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
};

describe('ValueElementView', () => {
  it('mostra loading, valor atual e consulta uma vez por binding', async () => {
    let resolveValue: ((value: { value: number; timestamp?: string }) => void) | undefined;
    const loadValue = jest.fn(() => new Promise<{ value: number; timestamp?: string }>((resolve) => {
      resolveValue = resolve;
    }));
    const element = createValue({ binding, id: 'value-1', x: 20, y: 30 });

    render(
      <svg>
        <ValueElementView element={element} loadValue={loadValue} />
      </svg>,
    );

    expect(screen.getByTestId('display-value-value-1')).toHaveTextContent('...');
    expect(loadValue).toHaveBeenCalledTimes(1);
    resolveValue?.({ value: 23.48, timestamp: '2026-08-06T12:00:00.000Z' });
    await waitFor(() => expect(screen.getByTestId('display-value-value-1')).toHaveTextContent('23.48'));
    expect(loadValue).toHaveBeenCalledTimes(1);
  });

  it('mantém o elemento e mostra BAD quando a consulta falha', async () => {
    const loadValue = jest.fn().mockRejectedValue(new Error('unavailable'));
    const element = createValue({ binding, id: 'value-2' });

    render(
      <svg>
        <ValueElementView element={element} loadValue={loadValue} />
      </svg>,
    );

    await waitFor(() => expect(screen.getByTestId('display-value-value-2')).toHaveTextContent('BAD'));
    expect(screen.getByTestId('display-element-value-2')).toBeInTheDocument();
    expect(loadValue).toHaveBeenCalledTimes(1);
  });

  it('formata número, preserva estado digital e exibe o nome sem nova consulta', async () => {
    const element = createValue({
      binding,
      id: 'value-3',
      visual: { decimals: 2, showTagName: true, textAlign: 'right', fontSize: 24, color: '#ff0000' },
    });
    const loadValue = jest.fn().mockResolvedValue({ value: 12.3456 });
    render(<svg><ValueElementView element={element} loadValue={loadValue} /></svg>);

    await waitFor(() => expect(screen.getByTestId('display-value-value-3')).toHaveTextContent('LFI_A268SV_TEMPERATURA_AMBIENTE: 12.35'));
    const text = screen.getByTestId('display-value-value-3');
    expect(text).toHaveAttribute('fill', '#ff0000');
    expect(text).toHaveAttribute('font-size', '24');
    expect(text).toHaveAttribute('text-anchor', 'right');
  });

  it('aplica somente a cor do primeiro estado correspondente e preserva o valor', async () => {
    const element = createValue({
      binding,
      id: 'value-multistate',
      multistate: {
        enabled: true,
        rules: [
          { id: 'red', operator: 'gte', value: 10, color: '#ff0000' },
          { id: 'yellow', operator: 'gte', value: 50, color: '#ffff00' },
        ],
      },
    });
    render(<svg><ValueElementView element={element} runtimeState={{ status: 'success', result: { value: 60 } }} /></svg>);
    await waitFor(() => expect(screen.getByTestId('display-value-value-multistate')).toHaveTextContent('60'));
    expect(screen.getByTestId('display-value-value-multistate')).toHaveAttribute('fill', '#ff0000');
  });

  it('renderiza zero como valor válido', () => {
    const element = createValue({ binding, id: 'value-zero' });
    render(<svg><ValueElementView element={element} runtimeState={{ status: 'success', result: { value: 0 } }} /></svg>);

    expect(screen.getByTestId('display-value-value-zero')).toHaveTextContent('0');
  });
});
