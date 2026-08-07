import React from 'react';
import { render, screen } from '@testing-library/react';
import { createTrend } from '../../createTrend';
import { buildTrendChart, TrendElementView } from '../TrendElementView';

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

describe('TrendElementView', () => {
  const element = createTrend({ binding, id: 'trend-1', x: 10, y: 20, width: 520, height: 280 });

  it('renderiza loading, sem dados e erro controlados', () => {
    const { rerender } = render(<svg><TrendElementView element={element} runtimeState={{ status: 'loading' }} /></svg>);
    expect(screen.getByTestId('trend-loading-trend-1')).toHaveTextContent('Carregando');

    rerender(<svg><TrendElementView element={element} runtimeState={{ status: 'success', data: { pointName: 'SINUSOID', points: [] } }} /></svg>);
    expect(screen.getByTestId('trend-empty-trend-1')).toHaveTextContent('Sem dados');

    rerender(<svg><TrendElementView element={element} runtimeState={{ status: 'error', error: new Error('bad') }} /></svg>);
    expect(screen.getByTestId('trend-error-trend-1')).toHaveTextContent('BAD');
  });

  it('renderiza linha, eixos, nome, série negativa e série constante', () => {
    render(
      <svg>
        <TrendElementView
          element={element}
          runtimeState={{
            status: 'success',
            data: {
              pointName: 'SINUSOID',
              points: [
                { time: 1_000, value: -2 },
                { time: 2_000, value: -2 },
                { time: 3_000, value: 4 },
              ],
            },
          }}
        />
      </svg>,
    );

    expect(screen.getByTestId('trend-title-trend-1')).toHaveTextContent('SINUSOID');
    expect(screen.getByTestId('trend-line-trend-1')).toHaveAttribute('d', expect.stringContaining('M'));
    expect(screen.getByTestId('trend-x-axis-trend-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-y-axis-trend-1')).toBeInTheDocument();
    expect(screen.getAllByText(/SINUSOID/).length).toBeGreaterThan(0);
  });

  it('redesenha a geometria do gráfico sem alterar os dados', () => {
    const { rerender } = render(
      <svg><TrendElementView element={element} runtimeState={{ status: 'success', data: { pointName: 'SINUSOID', points: [{ time: 1_000, value: 1 }, { time: 2_000, value: 2 }] } }} /></svg>,
    );
    const firstPath = screen.getByTestId('trend-line-trend-1').getAttribute('d');
    rerender(
      <svg><TrendElementView element={{ ...element, width: 700, height: 340 }} runtimeState={{ status: 'success', data: { pointName: 'SINUSOID', points: [{ time: 1_000, value: 1 }, { time: 2_000, value: 2 }] } }} /></svg>,
    );
    expect(screen.getByTestId('trend-line-trend-1').getAttribute('d')).not.toBe(firstPath);
  });

  it('mantém no eixo X todo o período solicitado mesmo com dados apenas recentes', () => {
    const to = Date.parse('2026-08-07T14:00:00.000Z');
    const from = to - 2 * 24 * 60 * 60 * 1000;
    const chart = buildTrendChart(element, [
      { time: to - 3 * 60 * 60 * 1000, value: 10 },
      { time: to, value: 20 },
    ], { from, to });

    expect(chart.domainStart).toBe(from);
    expect(chart.domainEnd).toBe(to);
    expect(chart.xTicks.map((tick) => tick.time)).toEqual([from, from + 24 * 60 * 60 * 1000, to]);
  });

  it('renderiza cursor com linha, timestamp e valor local', () => {
    render(
      <svg>
        <TrendElementView
          element={element}
          cursors={[{ id: 'cursor-1', time: 1_500 }]}
          selectedCursorId="cursor-1"
          runtimeState={{
            status: 'success',
            data: { pointName: 'SINUSOID', points: [{ time: 1_000, value: 2 }, { time: 2_000, value: 4 }] },
          }}
        />
      </svg>,
    );

    expect(screen.getByTestId('trend-cursor-line-trend-1-cursor-1')).toHaveAttribute('stroke', '#f2cc0c');
    expect(screen.getByTestId('trend-cursor-hit-trend-1-cursor-1')).toHaveAttribute('stroke-width', '12');
    expect(screen.getByTestId('trend-cursor-label-trend-1-cursor-1')).toHaveTextContent('3');
  });
});
