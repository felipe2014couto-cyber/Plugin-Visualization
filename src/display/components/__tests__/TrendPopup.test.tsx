import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TrendPopup } from '../TrendPopup';
import type { TrendSeriesViewState } from '../TrendElementView';
import { DEFAULT_TREND_VISUAL_OPTIONS } from '../../createTrend';

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
  const setPopupBounds = () => {
    const svg = screen.getByLabelText('Trend detalhada') as unknown as SVGSVGElement;
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 2400, bottom: 800, width: 2400, height: 800, toJSON: () => ({}) });
    return screen.getByTestId('trend-popup-cursor-plot');
  };

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
    const onVisibleTimeRangeChange = jest.fn();
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onVisibleTimeRangeChange={onVisibleTimeRangeChange} onClose={jest.fn()} />);
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
    expect(onVisibleTimeRangeChange).toHaveBeenCalledTimes(1);
    const firstRange = onVisibleTimeRangeChange.mock.calls[0][0];
    expect(firstRange.from).toBeGreaterThan(1_000);
    expect(firstRange.to).toBeLessThan(2_000);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('trend-popup-line-0').getAttribute('d')).toBe(originalPath);
    expect(onVisibleTimeRangeChange).toHaveBeenLastCalledWith({ from: 1_000, to: 2_000 });
  });

  it('reconsulta zooms temporais sucessivos, reseta a janela e mantém zoom vertical local', () => {
    const onVisibleTimeRangeChange = jest.fn();
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onVisibleTimeRangeChange={onVisibleTimeRangeChange} onClose={jest.fn()} />);
    const svg = screen.getByLabelText('Trend detalhada') as unknown as SVGSVGElement;
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 2400, bottom: 800, width: 2400, height: 800, toJSON: () => ({}) });
    const plot = screen.getByTestId('trend-popup-cursor-plot');

    fireEvent.pointerDown(plot, { clientX: 600, clientY: 120, pointerId: 20 });
    fireEvent.pointerUp(plot, { clientX: 1600, clientY: 650, pointerId: 20 });
    const firstRange = onVisibleTimeRangeChange.mock.calls[0][0];
    fireEvent.pointerDown(plot, { clientX: 800, clientY: 180, pointerId: 21 });
    fireEvent.pointerUp(plot, { clientX: 1400, clientY: 600, pointerId: 21 });
    const secondRange = onVisibleTimeRangeChange.mock.calls[1][0];
    expect(secondRange.from).toBeGreaterThan(firstRange.from);
    expect(secondRange.to).toBeLessThan(firstRange.to);

    fireEvent.click(screen.getByTestId('trend-popup-reset-zoom'));
    expect(onVisibleTimeRangeChange).toHaveBeenLastCalledWith({ from: 1_000, to: 2_000 });

    onVisibleTimeRangeChange.mockClear();
    const plotX = Number(plot.getAttribute('x'));
    const plotWidth = Number(plot.getAttribute('width'));
    fireEvent.pointerDown(plot, { clientX: plotX, clientY: 150, pointerId: 22 });
    fireEvent.pointerUp(plot, { clientX: plotX + plotWidth, clientY: 550, pointerId: 22 });
    expect(onVisibleTimeRangeChange).not.toHaveBeenCalled();
  });

  it('limita a seleção fora do plot antes de decidir que o zoom mantém Y automático', () => {
    const onVisibleTimeRangeChange = jest.fn();
    render(<TrendPopup seriesStates={seriesStates} timeRange={{ from: 1_000, to: 2_000 }} onVisibleTimeRangeChange={onVisibleTimeRangeChange} onClose={jest.fn()} />);
    const plot = setPopupBounds();
    const plotX = Number(plot.getAttribute('x'));
    const plotY = Number(plot.getAttribute('y'));
    const plotWidth = Number(plot.getAttribute('width'));
    const plotHeight = Number(plot.getAttribute('height'));

    fireEvent.pointerDown(plot, { clientX: plotX + 200, clientY: plotY - 40, pointerId: 35 });
    fireEvent.pointerUp(plot, { clientX: plotX + plotWidth - 200, clientY: plotY + plotHeight + 40, pointerId: 35 });

    expect(onVisibleTimeRangeChange).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId(/trend-popup-y-tick-0-/).map((tick) => tick.textContent)).toEqual([
      '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0',
    ]);
  });

  it('sincroniza a barra local com zooms sucessivos, Ctrl+Z e reset sem alterar a janela global', () => {
    const globalRange = { from: 1_000, to: 28_801_000 };
    const onVisibleTimeRangeChange = jest.fn();
    render(<TrendPopup seriesStates={seriesStates} timeRange={globalRange} onVisibleTimeRangeChange={onVisibleTimeRangeChange} onClose={jest.fn()} />);
    const selectDuration = (durationMs: number) => {
      fireEvent.change(screen.getByTestId('time-range-start'), { target: { value: new Date(globalRange.from).toISOString() } });
      fireEvent.change(screen.getByTestId('time-range-end'), { target: { value: new Date(globalRange.from + durationMs).toISOString() } });
      fireEvent.click(screen.getByTestId('time-range-apply'));
    };

    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('8h');
    selectDuration(27 * 60_000 + 38_000);
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('27m38s');
    selectDuration(7 * 60_000 + 6_000);
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('7m06s');
    selectDuration(31_000);
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('31s');
    expect(onVisibleTimeRangeChange).toHaveBeenLastCalledWith(expect.objectContaining({ from: expect.any(Number), to: expect.any(Number) }));

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('7m06s');
    fireEvent.click(screen.getByTestId('trend-popup-reset-zoom'));
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('8h');
    expect(onVisibleTimeRangeChange).toHaveBeenLastCalledWith(globalRange);
    expect(screen.getByTestId('trend-popup-reset-zoom')).toBeDisabled();
  });

  it('preserva limites Y absolutos quando uma resposta detalhada chega após zoom retangular', () => {
    const near32 = (values: number[]): TrendSeriesViewState[] => [{
      series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'PV' }, color: '#6e9fff' },
      runtimeState: { status: 'success', data: { pointName: 'PV', points: values.map((value, index) => ({ time: 1_000 + index * 250, value })) } },
    }];
    const { rerender } = render(<TrendPopup seriesStates={near32([31.99, 32.01, 32, 32.02, 31.98])} timeRange={{ from: 1_000, to: 2_000 }} onVisibleTimeRangeChange={jest.fn()} onClose={jest.fn()} />);
    const plot = setPopupBounds();

    fireEvent.pointerDown(plot, { clientX: 500, clientY: 180, pointerId: 40 });
    fireEvent.pointerUp(plot, { clientX: 1800, clientY: 620, pointerId: 40 });
    const ticksBefore = screen.getAllByTestId(/trend-popup-y-tick-0-/).map((tick) => tick.textContent);

    rerender(<TrendPopup seriesStates={near32([31.7, 32.3, 31.8, 32.2, 32])} timeRange={{ from: 1_000, to: 2_000 }} onVisibleTimeRangeChange={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getAllByTestId(/trend-popup-y-tick-0-/).map((tick) => tick.textContent)).toEqual(ticksBefore);
  });

  it('mantém o estado anterior na borda esquerda durante o zoom', () => {
    const stateSeries: TrendSeriesViewState[] = [{
      series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'CODIGO_UM', pointType: 'String' }, color: '#ff9830' },
      runtimeState: {
        status: 'success',
        data: {
          pointName: 'CODIGO_UM',
          points: [],
          states: [{ time: 900, value: 'RJNTB' }, { time: 1_500, value: 'P989H' }],
        },
      },
    }];
    render(<TrendPopup seriesStates={stateSeries} timeRange={{ from: 1_000, to: 2_000 }} onVisibleTimeRangeChange={jest.fn()} onClose={jest.fn()} />);
    const plot = setPopupBounds();
    const plotX = Number(plot.getAttribute('x'));

    expect(screen.getByTestId('trend-popup-state-line-0').getAttribute('d')).toMatch(new RegExp(`^M ${plotX} `));

    fireEvent.pointerDown(plot, { clientX: plotX + 200, clientY: 100, pointerId: 44 });
    fireEvent.pointerUp(plot, { clientX: plotX + 1_000, clientY: 700, pointerId: 44 });

    expect(screen.getByTestId('trend-popup-state-line-0').getAttribute('d')).toMatch(new RegExp(`^M ${plotX} `));
  });

  it('mostra somente limites coloridos das escalas digitais nas bordas, sem nomes no eixo', () => {
    const states: TrendSeriesViewState[] = [
      seriesStates[0],
      {
        series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'CODIGO_UM', pointType: 'String' }, color: '#ff9830', scaleMin: 0.8, scaleMax: 12 },
        runtimeState: { status: 'success', data: { pointName: 'CODIGO_UM', points: [], states: [{ time: 1_000, value: 'P989H' }, { time: 1_500, value: 'RJMF2' }] } },
      },
      {
        series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'STATUS', pointType: 'Digital' }, color: '#73bf69' },
        runtimeState: { status: 'success', data: { pointName: 'STATUS', points: [], states: [{ time: 1_000, value: 'Off' }, { time: 1_500, value: 'On' }] } },
      },
      {
        series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'STATUS_2', pointType: 'Digital' }, color: '#b877d9', scaleMin: -0.87, scaleMax: 1 },
        runtimeState: { status: 'success', data: { pointName: 'STATUS_2', points: [], states: [{ time: 1_000, value: 'A' }] } },
      },
      {
        series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'STATUS_3', pointType: 'Digital' }, color: '#f2495c', scaleMin: -0.063, scaleMax: 1 },
        runtimeState: { status: 'success', data: { pointName: 'STATUS_3', points: [], states: [{ time: 1_000, value: 'B' }] } },
      },
    ];
    render(<TrendPopup seriesStates={states} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);

    expect(screen.getByTestId('trend-popup-y-tick-1-0')).toHaveTextContent('12');
    expect(screen.getByTestId('trend-popup-y-tick-1-10')).toHaveTextContent('0.8');
    expect(screen.getByTestId('trend-popup-y-tick-2-0')).toHaveTextContent('1');
    expect(screen.getByTestId('trend-popup-y-tick-2-10')).toHaveTextContent('0');
    expect(screen.getByTestId('trend-popup-y-tick-3-10')).toHaveTextContent('-0.87');
    expect(screen.getByTestId('trend-popup-y-tick-4-10')).toHaveTextContent('-0.063');
    expect(screen.queryByTestId('trend-popup-y-tick-1-5')).toBeNull();
    expect(screen.getByTestId('trend-popup-cursor-plot')).toHaveAttribute('x', '46');
    expect(screen.getByTestId('trend-popup-state-line-1')).toBeInTheDocument();
    expect(screen.getByTestId('trend-popup-state-line-2')).toBeInTheDocument();
  });

  it('mostra Shutdown na legenda quando o único estado recebido é o valor atual no fim da janela', () => {
    const shutdown: TrendSeriesViewState[] = [{
      series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'DTH_INICIO', pointType: 'Digital' }, color: '#f2495c' },
      runtimeState: { status: 'success', data: { pointName: 'DTH_INICIO', points: [], states: [{ time: 2_000, value: 'Shutdown' }] } },
    }];
    render(<TrendPopup seriesStates={shutdown} timeRange={{ from: 1_000, to: 2_000 }} onClose={jest.fn()} />);

    expect(screen.getByTestId('trend-popup-legend-item-0')).toHaveTextContent('Shutdown');
  });

  it('mantém String no cursor e mostra No Data antes do primeiro estado', () => {
    const stringSeries: TrendSeriesViewState[] = [{
      series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_STRING', pointType: 'String' }, color: '#ff9830' },
      runtimeState: { status: 'success', data: { pointName: 'TAG_STRING', points: [], states: [{ time: 1_500, value: 'P989H' }] } },
    }];
    render(<TrendPopup seriesStates={stringSeries} timeRange={{ from: 1_000, to: 2_000 }} initialCursors={[{ id: 'cursor-string', time: 1_250 }]} onClose={jest.fn()} />);

    expect(screen.getByTestId('trend-popup-cursor-reading-cursor-string-0')).toHaveTextContent('No Data');
    expect(screen.getByTestId('trend-popup-cursor-reading-cursor-string-0')).not.toHaveTextContent('TAG_STRING');
  });

  it('preserva o último estado String depois do último evento e respeita No Data explícito', () => {
    const stringSeries: TrendSeriesViewState[] = [{
      series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'TAG_STRING', pointType: 'String' }, color: '#ff9830' },
      runtimeState: { status: 'success', data: { pointName: 'TAG_STRING', points: [], states: [{ time: 1_000, value: 'P989H' }, { time: 1_500, value: 'No Data' }, { time: 1_750, value: 'RJNTB' }] } },
    }];
    const { rerender } = render(<TrendPopup seriesStates={stringSeries} timeRange={{ from: 1_000, to: 2_000 }} initialCursors={[{ id: 'cursor-string', time: 1_600 }]} onClose={jest.fn()} />);
    expect(screen.getByTestId('trend-popup-cursor-reading-cursor-string-0')).toHaveTextContent('No Data');
    expect(screen.getByTestId('trend-popup-cursor-reading-cursor-string-0')).not.toHaveTextContent('TAG_STRING');

    rerender(<TrendPopup seriesStates={stringSeries} timeRange={{ from: 1_000, to: 2_000 }} initialCursors={[{ id: 'cursor-string', time: 1_900 }]} onClose={jest.fn()} />);
    expect(screen.getByTestId('trend-popup-cursor-reading-cursor-string-0')).toHaveTextContent('RJNTB');
    expect(screen.getByTestId('trend-popup-cursor-reading-cursor-string-0')).not.toHaveTextContent('TAG_STRING');
  });

  it('distingue ticks próximos de 32 e inclui segundos em janelas temporais curtas', () => {
    const closeSeries: TrendSeriesViewState[] = [{
      series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'PV' }, color: '#6e9fff' },
      runtimeState: { status: 'success', data: { pointName: 'PV', points: [{ time: 1_000, value: 31.998 }, { time: 61_000, value: 32.002 }] } },
    }];
    render(<TrendPopup seriesStates={closeSeries} timeRange={{ from: 1_000, to: 61_000 }} onClose={jest.fn()} />);

    const yLabels = screen.getAllByTestId(/trend-popup-y-tick-0-/).map((tick) => tick.textContent);
    expect(new Set(yLabels).size).toBe(yLabels.length);
    const xLabels = screen.getAllByTestId(/trend-popup-x-tick-/).map((tick) => tick.textContent ?? '');
    expect(xLabels.every((label) => /^\d{2}:\d{2}:\d{2}$/.test(label))).toBe(true);
  });

  it('recorta o traçado na área útil sem limitar os valores dos dados', () => {
    const outOfRange: TrendSeriesViewState[] = [{
      series: { binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'PV' }, color: '#6e9fff', scaleMin: 31.99, scaleMax: 32.01 },
      runtimeState: { status: 'success', data: { pointName: 'PV', points: [{ time: 1_000, value: 31 }, { time: 1_500, value: 32 }, { time: 2_000, value: 33 }] } },
    }];
    render(<TrendPopup seriesStates={outOfRange} timeRange={{ from: 1_000, to: 2_000 }} visualOptions={{ ...DEFAULT_TREND_VISUAL_OPTIONS, scaleMode: 'configurable' }} onClose={jest.fn()} />);

    const clipGroup = screen.getByTestId('trend-popup-series-clip');
    expect(clipGroup.getAttribute('clip-path')).toMatch(/^url\(#trend-popup-plot-clip-\d+\)$/);
    const path = screen.getByTestId('trend-popup-line-0').getAttribute('d') ?? '';
    const yCoordinates = [...path.matchAll(/[ML] [^ ]+ ([^ ]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...yCoordinates)).toBeLessThan(20);
    expect(Math.max(...yCoordinates)).toBeGreaterThan(744);
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

  it('não desenha leituras de cursores fora da janela sobre a régua das escalas', () => {
    render(<TrendPopup
      seriesStates={seriesStates}
      timeRange={{ from: 1_000, to: 2_000 }}
      initialCursors={[
        { id: 'before', time: 900 },
        { id: 'visible', time: 1_500 },
        { id: 'after', time: 2_100 },
      ]}
      onClose={jest.fn()}
    />);

    expect(screen.queryByTestId('trend-popup-cursor-before')).toBeNull();
    expect(screen.getByTestId('trend-popup-cursor-visible')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-popup-cursor-after')).toBeNull();
    expect(screen.queryByTestId('trend-popup-cursor-reading-before-0')).toBeNull();
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

  it('abre as informações da série com clique direito na legenda', () => {
    const onSeriesContextMenu = jest.fn();
    render(<TrendPopup
      seriesStates={seriesStates}
      timeRange={{ from: 1_000, to: 2_000 }}
      pointInfo={{ pointName: 'A', value: 10, metadata: { name: 'A', description: 'Tag A' } }}
      onSeriesContextMenu={onSeriesContextMenu}
      onClose={jest.fn()}
    />);

    fireEvent.contextMenu(screen.getByTestId('trend-popup-legend-item-0'));

    expect(onSeriesContextMenu).toHaveBeenCalledWith(seriesStates[0].series, 10);
    expect(screen.getByTestId('trend-point-info-panel')).toHaveTextContent('Tag A');
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
