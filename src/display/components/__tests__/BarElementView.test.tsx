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

  it('centraliza o rótulo e o valor exibido em relação à barra', () => {
    const element = createBar({ id: 'bar-centered', binding });
    render(<svg><BarElementView element={element} runtimeState={{ status: 'success', result: { value: 100 } }} /></svg>);

    const track = screen.getByTestId('bar-track-bar-centered');
    const trackX = Number(track.getAttribute('x'));
    const trackWidth = Number(track.getAttribute('width'));
    const expectedCenterX = trackX + trackWidth / 2;

    const valueEl = screen.getByTestId('bar-value-bar-centered');
    expect(Number(valueEl.getAttribute('x'))).toBeCloseTo(expectedCenterX, 1);

    const tagEl = screen.getByText('SINUSOID');
    expect(Number(tagEl.getAttribute('x'))).toBeCloseTo(expectedCenterX, 1);
  });

  it('mantém o valor horizontal acima da barra', () => {
    const element = createBar({ id: 'bar-horizontal-value', binding, orientation: 'horizontal' });
    render(<svg><BarElementView element={element} runtimeState={{ status: 'success', result: { value: 21 } }} /></svg>);

    const track = screen.getByTestId('bar-track-bar-horizontal-value');
    const value = screen.getByTestId('bar-horizontal-detail-bar-horizontal-value-0');
    expect(Number(value.getAttribute('y'))).toBeLessThan(Number(track.getAttribute('y')));
  });

  it('usa a cor do contorno na escala e nos rótulos', () => {
    const element = createBar({ id: 'bar-border-color', binding });
    element.properties.borderColor = '#ff0000';
    render(<svg><BarElementView element={element} runtimeState={{ status: 'success', result: { value: 50 } }} /></svg>);

    expect(screen.getByText('SINUSOID')).toHaveAttribute('fill', '#ff0000');
    expect(screen.getByTestId('bar-border-bar-border-color')).toHaveAttribute('stroke', '#ff0000');
    expect(screen.getAllByText('50')[0]).toHaveAttribute('fill', '#ff0000');
  });
});
