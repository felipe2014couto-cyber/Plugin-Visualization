import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TrendPopup } from '../TrendPopup';
import type { TrendSeriesViewState } from '../TrendElementView';

beforeAll(() => {
  const currentWindow = window as unknown as { PointerEvent?: typeof MouseEvent; MouseEvent: typeof MouseEvent };
  if (typeof currentWindow.PointerEvent !== 'function') {
    currentWindow.PointerEvent = class FakePointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    } as unknown as typeof MouseEvent;
  }
});

const seriesStates: TrendSeriesViewState[] = [
  {
    series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'A' }, color: '#6e9fff' },
    runtimeState: { status: 'success', data: { pointName: 'A', points: [{ time: 1_000, value: 0 }, { time: 1_250, value: 3 }, { time: 1_500, value: 5 }, { time: 1_750, value: 8 }, { time: 2_000, value: 10 }] } },
  },
  {
    series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'B' }, color: '#ff9830' },
    runtimeState: { status: 'success', data: { pointName: 'B', points: [{ time: 1_000, value: 100 }, { time: 1_250, value: 125 }, { time: 1_500, value: 150 }, { time: 1_750, value: 175 }, { time: 2_000, value: 200 }] } },
  },
];

describe('TrendPopup - escalas', () => {
  it('inicia com escalas múltiplas, compartilha domínio na escala única e aceita limites configuráveis', () => {
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);

    expect(screen.getByTestId('trend-popup-scale-multiple')).toHaveAttribute('aria-pressed', 'true');
    const multiplePath = screen.getByTestId('trend-popup-line-0').getAttribute('d');

    fireEvent.click(screen.getByTestId('trend-popup-scale-single'));
    expect(screen.getByTestId('trend-popup-scale-single')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('trend-popup-line-0').getAttribute('d')).not.toBe(multiplePath);

    fireEvent.click(screen.getByTestId('trend-popup-scale-configurable'));
    expect(screen.getByTestId('trend-popup-scale-configuration')).toBeInTheDocument();
    expect(screen.getByTestId('trend-popup-line-0').getAttribute('d')).toBe(multiplePath);

    const key = encodeURIComponent('ds|pims|A');
    const maximumInput = screen.getByTestId(`trend-popup-scale-max-${key}`);
    fireEvent.change(maximumInput, { target: { value: '100' } });
    expect(maximumInput).toHaveValue(100);
    expect(screen.getByTestId('trend-popup-line-0').getAttribute('d')).not.toBe(multiplePath);
  });

  it('aplica zoom por seleção retangular e desfaz com Ctrl+Z', () => {
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);
    const originalPath = screen.getByTestId('trend-popup-line-0').getAttribute('d');
    expect(screen.getByTestId('trend-popup-zoom-mode')).toHaveAttribute('aria-pressed', 'true');

    const svg = screen.getByLabelText('Trend detalhada') as unknown as SVGSVGElement;
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1600, bottom: 800, width: 1600, height: 800, toJSON: () => ({}) });
    const plot = screen.getByTestId('trend-popup-cursor-plot');
    fireEvent.pointerDown(plot, { clientX: 300, clientY: 180, pointerId: 7 });
    fireEvent.pointerMove(plot, { clientX: 1300, clientY: 600, pointerId: 7 });
    expect(screen.getByTestId('trend-popup-zoom-selection')).toBeInTheDocument();
    fireEvent.pointerUp(plot, { clientX: 1300, clientY: 600, pointerId: 7 });
    expect(screen.queryByTestId('trend-popup-zoom-selection')).toBeNull();
    expect(screen.getByTestId('trend-popup-line-0').getAttribute('d')).not.toBe(originalPath);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('trend-popup-line-0').getAttribute('d')).toBe(originalPath);
  });

  it('cria cursores com clique simples mesmo com zoom habilitado e os remove com duplo clique', () => {
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);
    const svg = screen.getByLabelText('Trend detalhada') as unknown as SVGSVGElement;
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1600, bottom: 800, width: 1600, height: 800, toJSON: () => ({}) });
    const plot = screen.getByTestId('trend-popup-cursor-plot');

    fireEvent.pointerDown(plot, { clientX: 800, clientY: 400, pointerId: 9 });
    fireEvent.pointerUp(plot, { clientX: 800, clientY: 400, pointerId: 9 });

    const cursor = screen.getByTestId('trend-popup-cursor-popup-cursor-1');
    expect(cursor).toBeInTheDocument();
    expect(screen.queryByTestId('trend-popup-zoom-selection')).toBeNull();

    fireEvent.doubleClick(screen.getByTestId('trend-popup-cursor-hit-popup-cursor-1'));
    expect(screen.queryByTestId('trend-popup-cursor-popup-cursor-1')).toBeNull();
  });

  it('exibe handle de redimensionamento e permite expandir/reduzir horizontalmente a legenda no popup', () => {
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);

    const resizer = screen.getByTestId('trend-popup-legend-resizer');
    expect(resizer).toBeInTheDocument();
    expect(resizer).toHaveStyle({ cursor: 'col-resize' });

    const svg = screen.getByLabelText('Trend detalhada') as unknown as SVGSVGElement;
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 2400, bottom: 800, width: 2400, height: 800, toJSON: () => ({}) });

    const plot = screen.getByTestId('trend-popup-cursor-plot');
    const initialPlotWidth = Number(plot.getAttribute('width'));

    // Drag resizer to the left by 200px -> increases legend, reduces plot
    fireEvent.pointerDown(resizer, { clientX: 2080, pointerId: 10 });
    fireEvent.pointerMove(resizer, { clientX: 1880, pointerId: 10 });
    fireEvent.pointerUp(resizer, { clientX: 1880, pointerId: 10 });

    const newPlotWidth = Number(screen.getByTestId('trend-popup-cursor-plot').getAttribute('width'));
    expect(newPlotWidth).toBeLessThan(initialPlotWidth);
  });

  it('permite ocultar e exibir a legenda através do botão de ferramentas no popup', () => {
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);

    const toggleButton = screen.getByTestId('trend-popup-toggle-legend');
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton).toHaveTextContent('Ocultar legenda');
    expect(screen.getByTestId('trend-popup-legend-resizer')).toBeInTheDocument();

    const plot = screen.getByTestId('trend-popup-cursor-plot');
    const initialWidth = Number(plot.getAttribute('width'));

    // Click to hide legend
    fireEvent.click(toggleButton);

    expect(toggleButton).toHaveTextContent('Mostrar legenda');
    expect(screen.queryByTestId('trend-popup-legend-resizer')).toBeNull();
    const expandedWidth = Number(screen.getByTestId('trend-popup-cursor-plot').getAttribute('width'));
    expect(expandedWidth).toBeGreaterThan(initialWidth);

    // Click to restore legend
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveTextContent('Ocultar legenda');
    expect(screen.getByTestId('trend-popup-legend-resizer')).toBeInTheDocument();
  });

  describe('seleção de séries pela legenda no popup', () => {
    it('permite selecionar série, desselecionar e usar Ctrl+clique para multi-seleção no popup', () => {
      render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);

      const legend0 = screen.getByTestId('trend-popup-legend-item-0');
      const legend1 = screen.getByTestId('trend-popup-legend-item-1');
      const line0 = screen.getByTestId('trend-popup-line-0');
      const line1 = screen.getByTestId('trend-popup-line-1');

      // Estado inicial: tudo normal
      expect(legend0).toHaveAttribute('opacity', '1');
      expect(legend1).toHaveAttribute('opacity', '1');
      expect(line0.parentElement).toHaveAttribute('opacity', '1');
      expect(line1.parentElement).toHaveAttribute('opacity', '1');

      // Clique em SINUSOID (índice 0)
      fireEvent.click(legend0);
      expect(legend0).toHaveAttribute('opacity', '1');
      expect(legend0).toHaveAttribute('aria-pressed', 'true');
      expect(legend1).toHaveAttribute('opacity', '0.2');
      expect(line0.parentElement).toHaveAttribute('opacity', '1');
      expect(line1.parentElement).toHaveAttribute('opacity', '0.2');

      // Ctrl+clique em CDTI58 (índice 1) -> ambas selecionadas
      fireEvent.click(legend1, { ctrlKey: true });
      expect(legend0).toHaveAttribute('opacity', '1');
      expect(legend1).toHaveAttribute('opacity', '1');
      expect(line0.parentElement).toHaveAttribute('opacity', '1');
      expect(line1.parentElement).toHaveAttribute('opacity', '1');

      // Clique simples em SINUSOID -> limpa seleção (todas voltam a 1)
      fireEvent.click(legend0);
      expect(legend0).toHaveAttribute('opacity', '1');
      expect(legend1).toHaveAttribute('opacity', '1');
      expect(line0.parentElement).toHaveAttribute('opacity', '1');
      expect(line1.parentElement).toHaveAttribute('opacity', '1');
    });
  });
});

