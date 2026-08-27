import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renderiza mudanças de estado de uma tag digital/string sem marcar BAD', () => {
    render(
      <svg>
        <TrendElementView
          element={element}
          timeRange={{ from: 1_000, to: 3_000 }}
          runtimeState={{
            status: 'success',
            data: {
              pointName: 'SINUSOID',
              points: [],
              states: [
                { time: 1_000, value: 'Desligado' },
                { time: 2_000, value: 'Ligado' },
              ],
            },
          }}
        />
      </svg>,
    );

    expect(screen.getByTestId('trend-state-plot-trend-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-state-line-trend-1')).toHaveAttribute('d', expect.stringContaining('V'));
    expect(screen.getByTestId('trend-title-trend-1')).toHaveTextContent('Ligado');
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-error-trend-1')).toBeNull();
  });

  it('mantém a série textual e a numérica com escalas independentes', () => {
    const numericBinding = { ...binding, pointName: 'FLOW' };
    const mixedElement = {
      ...element,
      properties: {
        series: [
          { binding, color: '#6e9fff' },
          { binding: numericBinding, color: '#ff9830' },
        ],
      },
    };
    render(
      <svg>
        <TrendElementView
          element={mixedElement}
          timeRange={{ from: 1_000, to: 3_000 }}
          seriesStates={[
            {
              series: mixedElement.properties.series[0],
              runtimeState: { status: 'success', data: { pointName: 'SINUSOID', points: [], states: [{ time: 1_000, value: 'A' }, { time: 2_000, value: 'B' }] } },
            },
            {
              series: mixedElement.properties.series[1],
              runtimeState: { status: 'success', data: { pointName: 'FLOW', points: [{ time: 1_000, value: 1400 }, { time: 2_000, value: 1560 }] } },
            },
          ]}
        />
      </svg>,
    );

    expect(screen.getByTestId('trend-mixed-plot-trend-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-state-line-trend-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-line-trend-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-legend-trend-1-0')).toHaveTextContent('SINUSOID');
    expect(screen.getByTestId('trend-legend-trend-1-1')).toHaveTextContent('FLOW');
    expect(screen.getByTestId('trend-legend-trend-1-0')).toHaveAttribute('y', '46');
    expect(screen.getByTestId('trend-legend-trend-1-1')).toHaveAttribute('y', '100');
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

  it('recorta nomes e demais conteúdos no limite do Trend', () => {
    const longNameElement = {
      ...element,
      width: 220,
      properties: {
        series: [{ binding: { ...binding, pointName: 'ACI_A60_SOBREVELOCIDADE_MUITO_LONGA' }, color: '#6e9fff' }],
      },
    };
    const { rerender } = render(
      <svg>
        <TrendElementView
          element={longNameElement}
          runtimeState={{ status: 'success', data: { pointName: 'ACI_A60_SOBREVELOCIDADE_MUITO_LONGA', points: [{ time: 1_000, value: 1 }, { time: 2_000, value: 2 }] } }}
        />
      </svg>,
    );

    const content = screen.getByTestId('trend-content-trend-1');
    const clipPath = content.getAttribute('clip-path');
    expect(clipPath).toMatch(/^url\(#trend-content-clip-/);
    const clipRect = document.querySelector(`${clipPath!.slice(4, -1)} rect`);
    expect(clipRect).toHaveAttribute('width', '220');

    rerender(
      <svg>
        <TrendElementView
          element={{ ...longNameElement, width: 520 }}
          runtimeState={{ status: 'success', data: { pointName: 'ACI_A60_SOBREVELOCIDADE_MUITO_LONGA', points: [{ time: 1_000, value: 1 }, { time: 2_000, value: 2 }] } }}
        />
      </svg>,
    );

    expect(document.querySelector(`${screen.getByTestId('trend-content-trend-1').getAttribute('clip-path')!.slice(4, -1)} rect`)).toHaveAttribute('width', '520');
  });

  it('amplia a área disponível para a legenda quando o Trend é esticado', () => {
    const longNameElement = {
      ...element,
      width: 1000,
      properties: {
        series: [{ binding: { ...binding, pointName: 'LFI_RB1_UNID_LAVAGEM1_UM' }, color: '#6e9fff' }],
      },
    };
    render(
      <svg>
        <TrendElementView
          element={longNameElement}
          runtimeState={{ status: 'success', data: { pointName: 'LFI_RB1_UNID_LAVAGEM1_UM', points: [{ time: 1_000, value: 1 }, { time: 2_000, value: 2 }] } }}
        />
      </svg>,
    );

    expect(screen.getByTestId('trend-legend-trend-1-0')).toHaveAttribute('x', '722');
    expect(screen.getByTestId('trend-plot-trend-1')).toHaveAttribute('width', '614');
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

    expect(screen.getByTestId('trend-cursor-line-trend-1-cursor-1')).toHaveAttribute('stroke', 'var(--trend-cursor, #ffffff)');
    expect(screen.getByTestId('trend-cursor-hit-trend-1-cursor-1')).toHaveAttribute('stroke-width', '18');
    expect(screen.getByTestId('trend-cursor-label-trend-1-cursor-1')).toHaveTextContent('3');
  });

  it('renderiza várias séries com cores, legenda e falha independente', () => {
    const secondBinding = { ...binding, pointName: 'OTHER' };
    const multiElement = {
      ...element,
      properties: {
        series: [
          { binding, color: '#6e9fff' },
          { binding: secondBinding, color: '#ff9830' },
        ],
      },
    };
    render(
      <svg>
        <TrendElementView
          element={multiElement}
          cursors={[{ id: 'cursor-1', time: 1_500 }]}
          seriesStates={[
            {
              series: multiElement.properties.series[0],
              runtimeState: {
                status: 'success',
                data: { pointName: 'SINUSOID', points: [{ time: 1_000, value: 0 }, { time: 2_000, value: 2 }] },
              },
            },
            {
              series: multiElement.properties.series[1],
              runtimeState: {
                status: 'error',
                data: { pointName: 'OTHER', points: [{ time: 1_000, value: 10 }, { time: 2_000, value: 20 }] },
                error: new Error('falha refinada'),
              },
            },
          ]}
        />
      </svg>,
    );

    expect(screen.getByTestId('trend-line-trend-1')).toHaveAttribute('stroke', '#6e9fff');
    expect(screen.getByTestId('trend-line-trend-1-1')).toHaveAttribute('stroke', '#ff9830');
    expect(screen.getByTestId('trend-legend-trend-1-0')).toHaveTextContent('SINUSOID');
    expect(screen.getByTestId('trend-legend-value-trend-1-0')).toHaveTextContent('2');
    expect(screen.getByTestId('trend-legend-trend-1-1')).toHaveTextContent('OTHER');
    expect(screen.getByTestId('trend-legend-value-trend-1-1')).toHaveTextContent('20');
    expect(screen.getByTestId('trend-cursor-label-trend-1-cursor-1')).toHaveTextContent('1');
    expect(screen.getByTestId('trend-cursor-label-trend-1-cursor-1')).toHaveTextContent('15');
    expect(screen.queryByTestId('trend-refresh-error-trend-1')).toBeNull();
  });

  it('exibe handle de redimensionamento da legenda com cursor col-resize', () => {
    render(
      <svg>
        <TrendElementView
          element={element}
          runtimeState={{ status: 'success', data: { pointName: 'SINUSOID', points: [{ time: 1000, value: 5 }] } }}
        />
      </svg>,
    );

    const resizer = screen.getByTestId('trend-legend-resizer-trend-1');
    expect(resizer).toBeInTheDocument();
    expect(resizer).toHaveStyle({ cursor: 'col-resize' });
  });

  it('redimensiona a legenda via pointer events chamando onLegendWidthChange no pointerUp', () => {
    const handleLegendWidthChange = jest.fn();
    render(
      <svg>
        <TrendElementView
          element={element}
          onLegendWidthChange={handleLegendWidthChange}
          runtimeState={{ status: 'success', data: { pointName: 'SINUSOID', points: [{ time: 1000, value: 5 }] } }}
        />
      </svg>,
    );

    const resizer = screen.getByTestId('trend-legend-resizer-trend-1');

    // PointerDown
    fireEvent.pointerDown(resizer, { clientX: 374, pointerId: 1 });
    // PointerMove: dragging left 50px increases legend width
    fireEvent.pointerMove(resizer, { clientX: 324, pointerId: 1 });
    // PointerUp: commits final width
    fireEvent.pointerUp(resizer, { clientX: 324, pointerId: 1 });

    expect(handleLegendWidthChange).toHaveBeenCalledTimes(1);
    expect(handleLegendWidthChange).toHaveBeenCalledWith('trend-1', expect.any(Number));
  });

  it('mantém nome completo quando a legenda tem largura suficiente e trunca com title quando estreita', () => {
    const longName = 'LFS_RB2_MOTOR_PAYOFF_VIB_LA';
    const longNameBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: longName };
    const narrowTrend = createTrend({ binding: longNameBinding, id: 'trend-narrow', x: 0, y: 0, width: 400, height: 200 });
    const wideTrend = {
      ...narrowTrend,
      id: 'trend-wide',
      width: 1000,
      properties: {
        ...narrowTrend.properties,
        visual: { legendWidth: 350 },
      },
    };

    const { rerender } = render(
      <svg>
        <TrendElementView
          element={{ ...narrowTrend, properties: { ...narrowTrend.properties, visual: { legendWidth: 100 } } }}
          runtimeState={{ status: 'success', data: { pointName: longName, points: [{ time: 1000, value: 4.35 }] } }}
        />
      </svg>,
    );

    // Narrow legend: truncated with ellipsis
    const narrowLabel = screen.getByTestId('trend-legend-trend-narrow-0');
    expect(narrowLabel.textContent).toContain('...');
    expect(screen.getByTestId('trend-legend-value-trend-narrow-0')).toHaveTextContent('4');

    rerender(
      <svg>
        <TrendElementView
          element={wideTrend}
          runtimeState={{ status: 'success', data: { pointName: longName, points: [{ time: 1000, value: 4.35 }] } }}
        />
      </svg>,
    );

    // Wide legend: full point name visible
    const wideLabel = screen.getByTestId('trend-legend-trend-wide-0');
    expect(wideLabel.textContent).toBe(longName);
    expect(screen.getByTestId('trend-legend-value-trend-wide-0')).toHaveTextContent('4');
  });

  it('oculta a legenda e o handle de redimensionamento quando hideLegend for true', () => {
    const hiddenLegendTrend = {
      ...element,
      properties: {
        ...element.properties,
        visual: { hideLegend: true },
      },
    };

    render(
      <svg>
        <TrendElementView
          element={hiddenLegendTrend}
          runtimeState={{ status: 'success', data: { pointName: 'SINUSOID', points: [{ time: 1000, value: 10 }] } }}
        />
      </svg>,
    );

    expect(screen.queryByTestId('trend-legend-trend-1-0')).toBeNull();
    expect(screen.queryByTestId('trend-legend-value-trend-1-0')).toBeNull();
    expect(screen.queryByTestId('trend-legend-resizer-trend-1')).toBeNull();
    expect(screen.getByTestId('trend-plot-trend-1')).toBeInTheDocument();
  });

  describe('seleção e foco de séries pela legenda', () => {
    const seriesA = { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' }, color: '#6e9fff' };
    const seriesB = { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'CDTI58' }, color: '#ff9830' };
    const seriesC = { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_3' }, color: '#3274d9' };
    const multiTrend = {
      ...element,
      id: 'trend-multi',
      properties: {
        ...element.properties,
        series: [seriesA, seriesB, seriesC],
      },
    };
    const multiStates = [
      { series: seriesA, runtimeState: { status: 'success' as const, data: { pointName: 'SINUSOID', points: [{ time: 1000, value: 10 }, { time: 2000, value: 20 }] } } },
      { series: seriesB, runtimeState: { status: 'success' as const, data: { pointName: 'CDTI58', points: [{ time: 1000, value: 30 }, { time: 2000, value: 40 }] } } },
      { series: seriesC, runtimeState: { status: 'success' as const, data: { pointName: 'TAG_3', points: [{ time: 1000, value: 50 }, { time: 2000, value: 60 }] } } },
    ];

    it('inicia com todas as séries em opacity 1 e aplica dimming ao selecionar série A', () => {
      render(
        <svg>
          <TrendElementView element={multiTrend} seriesStates={multiStates} />
        </svg>,
      );

      const itemA = screen.getByTestId('trend-legend-item-trend-multi-0');
      const itemB = screen.getByTestId('trend-legend-item-trend-multi-1');
      const itemC = screen.getByTestId('trend-legend-item-trend-multi-2');
      const lineA = screen.getByTestId('trend-line-trend-multi');
      const lineB = screen.getByTestId('trend-line-trend-multi-1');
      const lineC = screen.getByTestId('trend-line-trend-multi-2');

      // Estado inicial: tudo normal (opacity 1)
      expect(itemA).toHaveAttribute('opacity', '1');
      expect(itemB).toHaveAttribute('opacity', '1');
      expect(itemC).toHaveAttribute('opacity', '1');
      expect(lineA.parentElement).toHaveAttribute('opacity', '1');
      expect(lineB.parentElement).toHaveAttribute('opacity', '1');
      expect(lineC.parentElement).toHaveAttribute('opacity', '1');

      // Clique simples em SINUSOID (série A)
      fireEvent.click(itemA);

      expect(itemA).toHaveAttribute('opacity', '1');
      expect(itemA).toHaveAttribute('aria-pressed', 'true');
      expect(itemB).toHaveAttribute('opacity', '0.2');
      expect(itemC).toHaveAttribute('opacity', '0.2');
      expect(lineA.parentElement).toHaveAttribute('opacity', '1');
      expect(lineB.parentElement).toHaveAttribute('opacity', '0.2');
      expect(lineC.parentElement).toHaveAttribute('opacity', '0.2');
    });

    it('limpa a seleção ao clicar novamente sem Ctrl na série selecionada', () => {
      render(
        <svg>
          <TrendElementView element={multiTrend} seriesStates={multiStates} />
        </svg>,
      );

      const itemA = screen.getByTestId('trend-legend-item-trend-multi-0');
      const itemB = screen.getByTestId('trend-legend-item-trend-multi-1');

      fireEvent.click(itemA);
      expect(itemB).toHaveAttribute('opacity', '0.2');

      // Clique simples novamente em A -> limpa seleção
      fireEvent.click(itemA);
      expect(itemA).toHaveAttribute('opacity', '1');
      expect(itemB).toHaveAttribute('opacity', '1');
      expect(itemA).toHaveAttribute('aria-pressed', 'false');
    });

    it('suporta multi-seleção com Ctrl+clique e desmarcação com Ctrl+clique', () => {
      render(
        <svg>
          <TrendElementView element={multiTrend} seriesStates={multiStates} />
        </svg>,
      );

      const itemA = screen.getByTestId('trend-legend-item-trend-multi-0');
      const itemB = screen.getByTestId('trend-legend-item-trend-multi-1');
      const itemC = screen.getByTestId('trend-legend-item-trend-multi-2');

      // Clique em A, depois Ctrl+clique em B
      fireEvent.click(itemA);
      fireEvent.click(itemB, { ctrlKey: true });

      expect(itemA).toHaveAttribute('opacity', '1');
      expect(itemB).toHaveAttribute('opacity', '1');
      expect(itemC).toHaveAttribute('opacity', '0.2');

      // Ctrl+clique em A -> desmarca A, B continua selecionada
      fireEvent.click(itemA, { ctrlKey: true });
      expect(itemA).toHaveAttribute('opacity', '0.2');
      expect(itemB).toHaveAttribute('opacity', '1');
      expect(itemC).toHaveAttribute('opacity', '0.2');
    });

    it('limpa toda a seleção ao clicar sem Ctrl em uma série que estava no conjunto selecionado', () => {
      render(
        <svg>
          <TrendElementView element={multiTrend} seriesStates={multiStates} />
        </svg>,
      );

      const itemA = screen.getByTestId('trend-legend-item-trend-multi-0');
      const itemB = screen.getByTestId('trend-legend-item-trend-multi-1');
      const itemC = screen.getByTestId('trend-legend-item-trend-multi-2');

      // Seleciona A e B
      fireEvent.click(itemA);
      fireEvent.click(itemB, { ctrlKey: true });
      expect(itemC).toHaveAttribute('opacity', '0.2');

      // Clique sem Ctrl em A -> deve limpar TUDO (voltando todas a 1)
      fireEvent.click(itemA);
      expect(itemA).toHaveAttribute('opacity', '1');
      expect(itemB).toHaveAttribute('opacity', '1');
      expect(itemC).toHaveAttribute('opacity', '1');
    });

    it('substitui a seleção existente ao clicar sem Ctrl em uma terceira série', () => {
      render(
        <svg>
          <TrendElementView element={multiTrend} seriesStates={multiStates} />
        </svg>,
      );

      const itemA = screen.getByTestId('trend-legend-item-trend-multi-0');
      const itemB = screen.getByTestId('trend-legend-item-trend-multi-1');
      const itemC = screen.getByTestId('trend-legend-item-trend-multi-2');

      // Seleciona A e B
      fireEvent.click(itemA);
      fireEvent.click(itemB, { ctrlKey: true });

      // Clique sem Ctrl em C -> seleção vira apenas { C }
      fireEvent.click(itemC);
      expect(itemA).toHaveAttribute('opacity', '0.2');
      expect(itemB).toHaveAttribute('opacity', '0.2');
      expect(itemC).toHaveAttribute('opacity', '1');
    });

    it('funciona para Trend mista (numérica + digital)', () => {
      const digitalBinding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'MOTOR_STATUS' };
      const mixedTrend = {
        ...element,
        id: 'trend-mixed-sel',
        properties: {
          ...element.properties,
          series: [seriesA, { binding: digitalBinding, color: '#ff9830' }],
        },
      };
      const mixedStates = [
        { series: seriesA, runtimeState: { status: 'success' as const, data: { pointName: 'SINUSOID', points: [{ time: 1000, value: 10 }] } } },
        { series: { binding: digitalBinding, color: '#ff9830' }, runtimeState: { status: 'success' as const, data: { pointName: 'MOTOR_STATUS', points: [], states: [{ time: 1000, value: 'RUN' }] } } },
      ];

      render(
        <svg>
          <TrendElementView element={mixedTrend} seriesStates={mixedStates} />
        </svg>,
      );

      const itemNumeric = screen.getByTestId('trend-legend-item-trend-mixed-sel-0');
      const itemDigital = screen.getByTestId('trend-legend-item-trend-mixed-sel-1');
      const lineNumeric = screen.getByTestId('trend-line-trend-mixed-sel');
      const lineDigital = screen.getByTestId('trend-state-line-trend-mixed-sel');

      // Seleciona a série digital
      fireEvent.click(itemDigital);
      expect(itemDigital).toHaveAttribute('opacity', '1');
      expect(itemNumeric).toHaveAttribute('opacity', '0.2');
      expect(lineDigital.parentElement).toHaveAttribute('opacity', '1');
      expect(lineNumeric.parentElement).toHaveAttribute('opacity', '0.2');
    });
  });
});

