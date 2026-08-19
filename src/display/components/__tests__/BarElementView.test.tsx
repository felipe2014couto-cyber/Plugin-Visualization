import React from 'react';
import { render, screen } from '@testing-library/react';
import { createBar } from '../../createBar';
import { BarElementView } from '../BarElementView';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('BarElementView', () => {
  it('preenche vertical de baixo para cima e horizontal da esquerda para a direita', () => {
    const vertical = createBar({ id: 'bar-v', binding });
    const { rerender } = render(<svg><BarElementView element={vertical} runtimeState={{ status: 'success', result: { value: 25 } }} /></svg>);
    const verticalFill = screen.getByTestId('bar-fill-bar-v');
    expect(Number(verticalFill.getAttribute('y'))).toBeGreaterThan(vertical.y + 34);
    const horizontal = createBar({ id: 'bar-h', binding, orientation: 'horizontal' });
    rerender(<svg><BarElementView element={horizontal} runtimeState={{ status: 'success', result: { value: 25 } }} /></svg>);
    expect(Number(screen.getByTestId('bar-fill-bar-h').getAttribute('x'))).toBeGreaterThanOrEqual(horizontal.x);
  });

  it('não consulta nem exibe valor para elemento sem binding', () => {
    const element = createBar({ id: 'bar-empty' });
    render(<svg><BarElementView element={element} /></svg>);
    expect(screen.getByTestId('bar-value-bar-empty')).toHaveTextContent('Sem tag');
  });

  it('altera somente a cor do preenchimento Multistate e preserva valor fora da escala', () => {
    const element = createBar({
      id: 'bar-multistate',
      binding,
      multistate: { enabled: true, rules: [{ id: 'low', operator: 'lt', value: 0, color: '#0000ff' }] },
    });
    render(<svg><BarElementView element={element} runtimeState={{ status: 'success', result: { value: -15 } }} /></svg>);
    expect(screen.getByTestId('bar-value-bar-multistate')).toHaveTextContent('-15');
    expect(screen.getByTestId('bar-fill-bar-multistate')).toHaveAttribute('fill', '#0000ff');
    expect(Number(screen.getByTestId('bar-fill-bar-multistate').getAttribute('height'))).toBe(0);
  });
});
