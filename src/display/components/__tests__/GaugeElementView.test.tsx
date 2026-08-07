import React from 'react';
import { render, screen } from '@testing-library/react';
import { createGauge } from '../../createGauge';
import { GaugeElementView } from '../GaugeElementView';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('GaugeElementView', () => {
  it('renderiza valor, clamp visual e preserva o valor real', () => {
    const element = createGauge({ id: 'gauge-1', binding });
    render(<svg><GaugeElementView element={element} runtimeState={{ status: 'success', result: { value: 120 } }} /></svg>);
    expect(screen.getByTestId('gauge-value-gauge-1')).toHaveTextContent('120');
    expect(screen.getByTestId('gauge-fill-gauge-1')).toHaveAttribute('stroke-dasharray', '100 100');
  });

  it('mostra placeholder, loading, erro e escala inválida sem quebrar', () => {
    const placeholder = createGauge({ id: 'placeholder' });
    const { rerender } = render(<svg><GaugeElementView element={placeholder} /></svg>);
    expect(screen.getByTestId('gauge-value-placeholder')).toHaveTextContent('Sem tag');
    const element = createGauge({ id: 'gauge-2', binding, options: { minimum: 10, maximum: 10 } });
    rerender(<svg><GaugeElementView element={element} runtimeState={{ status: 'error' }} /></svg>);
    expect(screen.getByTestId('gauge-value-gauge-2')).toHaveTextContent('BAD');
    expect(screen.getByTestId('gauge-invalid-scale-gauge-2')).toBeInTheDocument();
  });

  it('usa o valor real para Multistate e mantém o clamp do Gauge', () => {
    const element = createGauge({
      id: 'gauge-multistate',
      binding,
      multistate: { enabled: true, rules: [{ id: 'high', operator: 'gt', value: 120, color: '#ff0000' }] },
    });
    render(<svg><GaugeElementView element={element} runtimeState={{ status: 'success', result: { value: 127 } }} /></svg>);
    expect(screen.getByTestId('gauge-value-gauge-multistate')).toHaveTextContent('127');
    expect(screen.getByTestId('gauge-fill-gauge-multistate')).toHaveAttribute('stroke', '#ff0000');
    expect(screen.getByTestId('gauge-fill-gauge-multistate')).toHaveAttribute('stroke-dasharray', '100 100');
  });
});
