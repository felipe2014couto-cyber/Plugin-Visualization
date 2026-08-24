import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createBarChart, createDisplayDocument, createRectangle, createTrend, createValue, type DisplayDocument } from '../../../index';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from '../../../../pi/piPointDrag';
import { PiPointSearch } from '../../../../pi/PiPointSearch';
import { searchPiPointsWithStatus, type PiPointSearchResult } from '../../../../pi/piDataSource';
import { DisplayEditor, type PiPointDropSymbolType } from '../DisplayEditor';
import type { LoadCurrentValues } from '../../../runtime/valueRuntime';
import type { LoadTrendSeries } from '../../../runtime/trendRuntime';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

jest.mock('../../../../pi/piDataSource', () => ({
  searchPiPointsWithStatus: jest.fn(),
}));

const point = {
  name: 'SINUSOID',
  webId: 'point-webid',
  path: '\\\\pims\\SINUSOID',
  dataSourceUid: 'ds',
};

function Harness({
  type,
  loadValues = () => new Promise(() => undefined),
  loadTrend = () => new Promise(() => undefined),
  withExistingValue = false,
  withExistingTrend = false,
  withExistingShape = false,
  withExistingBarChart = false,
}: {
  type: PiPointDropSymbolType;
  loadValues?: LoadCurrentValues;
  loadTrend?: LoadTrendSeries;
  withExistingValue?: boolean;
  withExistingTrend?: boolean;
  withExistingShape?: boolean;
  withExistingBarChart?: boolean;
}) {
  const [document, setDocument] = useState<DisplayDocument>(() => {
    const initial = createDisplayDocument({ name: 'Drop' });
    initial.surface.width = 800;
    initial.surface.height = 600;
    if (withExistingValue) {
      initial.elements = [createValue({
        id: 'existing-value',
        binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'EXISTING' },
      })];
    }
    if (withExistingBarChart) {
      initial.elements = [createBarChart({
        id: 'existing-bar-chart',
        binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'EXISTING' },
        surface: initial.surface,
        x: 0,
        y: 0,
        width: 300,
        height: 200,
      })];
    }
    if (withExistingTrend) {
      initial.elements = [createTrend({
        id: 'existing-trend',
        binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'EXISTING' },
        surface: initial.surface,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      })];
    }
    if (withExistingShape) {
      initial.elements = [createRectangle({
        id: 'existing-shape',
        surface: initial.surface,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      })];
    }
    return initial;
  });
  return <>
    <DisplayEditor
        document={document}
        onChange={setDocument}
        dropSymbolType={type}
        loadValues={loadValues}
        loadTrend={loadTrend}
      />
    <output data-testid="display-document-json">{JSON.stringify(document)}</output>
  </>;
}

function SearchDropHarness() {
  const [selectedPiPoint, setSelectedPiPoint] = useState<PiPointSearchResult | null>(null);
  const [document, setDocument] = useState<DisplayDocument>(() => {
    const initial = createDisplayDocument({ name: 'Drop com busca' });
    initial.surface.width = 800;
    initial.surface.height = 600;
    initial.elements = [createTrend({
      id: 'existing-trend',
      binding: { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'EXISTING' },
      surface: initial.surface,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })];
    return initial;
  });

  return <>
    <PiPointSearch enabled onSelect={setSelectedPiPoint} />
    <DisplayEditor document={document} onChange={setDocument} selectedPiPoint={selectedPiPoint} dropSymbolType="trend" />
    <output data-testid="display-document-json">{JSON.stringify(document)}</output>
  </>;
}

function createDataTransfer(selectedPoint = point): DataTransfer {
  const payload = serializePiPointDragData(selectedPoint);
  return {
    types: [PI_POINT_DRAG_MIME],
    effectAllowed: 'copy',
    dropEffect: 'none',
    getData: (type: string) => type === PI_POINT_DRAG_MIME ? payload : '',
    setData: jest.fn(),
  } as unknown as DataTransfer;
}

function createBrowserDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    get types() {
      return [...values.keys()];
    },
    getData: (type: string) => values.get(type) ?? '',
    setData: (type: string, value: string) => values.set(type, value),
    setDragImage: jest.fn(),
  } as unknown as DataTransfer;
}

function mockSurfaceBounds(bounds = { left: 100, top: 50, width: 800, height: 600 }) {
  const surface = screen.getByTestId('display-surface') as unknown as SVGSVGElement;
  jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    ...bounds,
    right: bounds.left + bounds.width,
    bottom: bounds.top + bounds.height,
    x: bounds.left,
    y: bounds.top,
    toJSON: () => ({}),
  });
}

function fireDragEvent(target: Element, type: 'dragover' | 'drop', dataTransfer: DataTransfer, clientX = 500, clientY = 350) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    dataTransfer: { value: dataTransfer },
  });
  fireEvent(target, event);
}

describe('DisplayEditor - drop de PI Point', () => {
  const searchMock = searchPiPointsWithStatus as jest.MockedFunction<typeof searchPiPointsWithStatus>;

  it.each<PiPointDropSymbolType>(['value', 'trend', 'gauge', 'bar'])(
    'cria %s vinculado na posição solta e registra no histórico',
    (type) => {
      render(<Harness type={type} />);
      mockSurfaceBounds();
      const wrapper = screen.getByTestId('display-editor-surface-wrapper');
      const dataTransfer = createDataTransfer();

      fireDragEvent(wrapper, 'dragover', dataTransfer);
      expect(screen.getByTestId('pi-point-drag-preview')).toHaveAttribute('data-valid', 'true');
      fireDragEvent(wrapper, 'drop', dataTransfer);

      const element = screen.getByTestId(/^display-element-/);
      expect(element).toHaveAttribute('data-element-type', type);
      const geometry = element.querySelector('rect');
      if (geometry) {
        expect(Number(geometry.getAttribute('x'))).toBeGreaterThanOrEqual(0);
        expect(Number(geometry.getAttribute('y'))).toBeGreaterThanOrEqual(0);
      }
      expect(screen.getByTestId('display-undo')).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('display-undo'));
      expect(screen.queryByTestId(/^display-element-/)).toBeNull();
    },
  );

  it('mostra preview vermelho quando a geometria não cabe no local', () => {
    render(<Harness type="trend" />);
    mockSurfaceBounds();
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');
    fireDragEvent(wrapper, 'dragover', createDataTransfer(), 50, 20);

    expect(screen.getByTestId('pi-point-drag-preview')).toHaveAttribute('data-valid', 'false');
    expect(screen.getByTestId('pi-point-drag-preview')).toHaveTextContent('SINUSOID');
  });

  it.each<PiPointDropSymbolType>(['value', 'gauge', 'bar'])(
    'consulta %s imediatamente após o drop, sem avançar o scheduler',
    async (type) => {
      const loadValues = jest.fn(async () => ({
        'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, value: { value: 0 } },
      }));
      render(<Harness type={type} loadValues={loadValues} />);
      mockSurfaceBounds();

      fireDragEvent(screen.getByTestId('display-editor-surface-wrapper'), 'drop', createDataTransfer());

      await waitFor(() => expect(loadValues).toHaveBeenCalledWith([{
        dataSourceUid: 'ds',
        serverPath: 'pims',
        pointName: 'SINUSOID',
        webId: 'point-webid',
      }]));
    },
  );

  it('ao adicionar uma tag consulta imediatamente apenas o novo binding', async () => {
    const loadValues: jest.MockedFunction<LoadCurrentValues> = jest.fn(async (bindings) => Object.fromEntries(bindings.map((binding) => [
      `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
      { status: 'success' as const, value: { value: 1 } },
    ])));
    render(<Harness type="value" loadValues={loadValues} withExistingValue />);
    await waitFor(() => expect(loadValues).toHaveBeenCalledWith([{
      dataSourceUid: 'ds', serverPath: 'pims', pointName: 'EXISTING',
    }]));
    loadValues.mockClear();
    mockSurfaceBounds();
    const newPoint = { ...point, name: 'NEW_TAG', path: '\\\\pims\\NEW_TAG', webId: 'new-web-id' };

    fireDragEvent(screen.getByTestId('display-editor-surface-wrapper'), 'drop', createDataTransfer(newPoint));

    await waitFor(() => expect(loadValues).toHaveBeenCalledTimes(1));
    expect(loadValues).toHaveBeenCalledWith([{
      dataSourceUid: 'ds', serverPath: 'pims', pointName: 'NEW_TAG', webId: 'new-web-id',
    }]);
  });

  it('adiciona tags sobre a mesma Trend, agrupa a consulta e integra undo/redo', async () => {
    const loadTrend: jest.MockedFunction<LoadTrendSeries> = jest.fn(async (bindings) => Object.fromEntries(bindings.map((binding) => [
      `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
      { status: 'success' as const, series: { pointName: binding.pointName, points: [{ time: 1, value: 1 }] } },
    ])));
    render(<Harness type="trend" loadTrend={loadTrend} />);
    mockSurfaceBounds();
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');
    const second = { ...point, name: 'SECOND', path: '\\\\pims\\SECOND' };
    const third = { ...point, name: 'THIRD', path: '\\\\pims\\THIRD' };

    fireDragEvent(wrapper, 'drop', createDataTransfer());
    fireDragEvent(wrapper, 'dragover', createDataTransfer(second));
    expect(screen.getByTestId('pi-point-drag-preview')).toHaveAttribute('data-valid', 'true');
    fireDragEvent(wrapper, 'drop', createDataTransfer(second));
    fireDragEvent(wrapper, 'drop', createDataTransfer(third));

    await waitFor(() => expect(readDocument().elements[0].properties.series).toHaveLength(3));
    expect(readDocument().elements).toHaveLength(1);
    await waitFor(() => expect(loadTrend).toHaveBeenCalledTimes(1));
    expect(loadTrend.mock.calls[0][0].map((binding) => binding.pointName)).toEqual(['SINUSOID', 'SECOND', 'THIRD']);

    fireEvent.click(screen.getByTestId('display-undo'));
    expect(readDocument().elements[0].properties.series).toHaveLength(2);
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(readDocument().elements[0].properties.series).toHaveLength(3);
  });

  it('não adiciona uma tag à Trend quando o modo de criação não é Trend', () => {
    render(<Harness type="value" withExistingTrend />);
    mockSurfaceBounds({ left: 100, top: 50, width: 1600, height: 600 });
    const trendBackground = screen.getByTestId('trend-background-existing-trend');

    fireDragEvent(trendBackground, 'dragover', createDataTransfer(), 550, 100);
    const preview = screen.getByTestId('pi-point-drag-preview');
    expect(preview).toHaveAttribute('data-valid', 'true');
    expect(preview).not.toHaveAttribute('data-target-trend', 'true');
    fireDragEvent(trendBackground, 'drop', createDataTransfer(), 550, 100);

    expect(readDocument().elements).toHaveLength(2);
    expect(readDocument().elements[0].properties.series).toHaveLength(1);
    expect(screen.getAllByTestId(/^display-element-/)[1]).toHaveAttribute('data-element-type', 'value');
  });

  it('vincula a PI Point à forma geométrica ao soltar a tag dentro dela', async () => {
    const loadValues: LoadCurrentValues = jest.fn(async (bindings) => Object.fromEntries(bindings.map((binding) => [
      `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`,
      { status: 'success' as const, value: { value: 42 } },
    ])));
    render(<Harness type="value" withExistingShape loadValues={loadValues} />);
    mockSurfaceBounds();
    const shape = screen.getByTestId('display-element-existing-shape');
    fireDragEvent(shape, 'drop', createDataTransfer(), 150, 100);

    await waitFor(() => expect(readDocument().elements).toHaveLength(1));
    const shapeProperties = readDocument().elements[0].properties as Record<string, unknown>;
    expect(shapeProperties.binding).toEqual({
      dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID', webId: 'point-webid',
    });
    expect(screen.getByTestId('display-element-existing-shape')).toHaveAttribute('data-element-type', 'rectangle');
  });

  it('reconhece a Trend pelo alvo real do evento mesmo sem elementFromPoint', () => {
    render(<Harness type="trend" withExistingTrend />);
    mockSurfaceBounds({ left: 100, top: 50, width: 1600, height: 600 });
    const trendBackground = screen.getByTestId('trend-background-existing-trend');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: jest.fn(() => null),
    });

    fireDragEvent(trendBackground, 'dragover', createDataTransfer(), 899, 649);

    const preview = screen.getByTestId('pi-point-drag-preview');
    expect(preview).toHaveAttribute('data-target-trend', 'true');
    expect(preview).toHaveTextContent('SINUSOID');
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();

    fireDragEvent(trendBackground, 'drop', createDataTransfer(), 899, 649);
    expect(readDocument().elements).toHaveLength(1);
    expect(readDocument().elements[0].properties.series).toHaveLength(2);
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('finaliza o arraste iniciado na lista de tags sobre um filho SVG da Trend', async () => {
    searchMock.mockResolvedValueOnce({ results: [point], hasMore: false });
    render(<SearchDropHarness />);
    mockSurfaceBounds({ left: 100, top: 50, width: 1600, height: 600 });

    fireEvent.change(screen.getByTestId('pi-point-search-input'), { target: { value: point.name } });
    fireEvent.click(screen.getByTestId('pi-point-search-submit'));
    await waitFor(() => expect(screen.getByTestId(`pi-point-result-${point.webId}`)).toBeInTheDocument());

    const dataTransfer = createBrowserDataTransfer();
    fireEvent.dragStart(screen.getByTestId(`pi-point-result-${point.webId}`), { dataTransfer });
    const trendBackground = screen.getByTestId('trend-background-existing-trend');
    fireDragEvent(trendBackground, 'dragover', dataTransfer, 899, 649);
    expect(screen.getByTestId('pi-point-drag-preview')).toHaveAttribute('data-target-trend', 'true');
    fireDragEvent(trendBackground, 'drop', dataTransfer, 899, 649);

    await waitFor(() => expect(readDocument().elements).toHaveLength(1));
    expect(readDocument().elements[0].properties.series!.map((series: { binding: { pointName: string } }) => series.binding.pointName))
      .toEqual(['EXISTING', 'SINUSOID']);
    expect(screen.queryByTestId('pi-point-drag-preview')).toBeNull();
  });

  it('ignora série duplicada e distingue a mesma tag em outro datasource', async () => {
    render(<Harness type="trend" />);
    mockSurfaceBounds();
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');

    fireDragEvent(wrapper, 'drop', createDataTransfer());
    fireDragEvent(wrapper, 'drop', createDataTransfer());
    fireDragEvent(wrapper, 'drop', createDataTransfer({ ...point, dataSourceUid: 'other-ds' }));

    await waitFor(() => expect(readDocument().elements[0].properties.series).toHaveLength(2));
    expect(readDocument().elements).toHaveLength(1);
    expect(readDocument().elements[0].properties.series!.map((series: { binding: { dataSourceUid: string } }) => (
      series.binding.dataSourceUid
    ))).toEqual(['ds', 'other-ds']);
  });

  it('cria novo Gráfico de Barras ao soltar no canvas com type bar-chart', async () => {
    render(<Harness type="bar-chart" />);
    mockSurfaceBounds();
    const wrapper = screen.getByTestId('display-editor-surface-wrapper');

    fireDragEvent(wrapper, 'drop', createDataTransfer());

    await waitFor(() => expect(readDocument().elements).toHaveLength(1));
    expect(readDocument().elements[0].type).toBe('bar-chart');
    expect((readDocument().elements[0].properties as any).items[0].binding.pointName).toBe('SINUSOID');
  });

  it('anexa barra ao soltar sobre Gráfico de Barras existente', async () => {
    render(<Harness type="bar-chart" withExistingBarChart />);
    mockSurfaceBounds();

    const barChartBackground = screen.getByTestId('bar-chart-background-existing-bar-chart');
    fireDragEvent(barChartBackground, 'dragover', createDataTransfer(), 899, 649);
    fireDragEvent(barChartBackground, 'drop', createDataTransfer(), 899, 649);

    await waitFor(() => expect(readDocument().elements).toHaveLength(1));
    expect((readDocument().elements[0].properties as any).items.map((item: any) => item.binding.pointName))
      .toEqual(['EXISTING', 'SINUSOID']);
  });
});

function readDocument(): {
  elements: Array<{
    type?: string;
    properties: {
      series?: Array<{ binding: { dataSourceUid: string; pointName: string } }>;
      items?: Array<{ binding: { dataSourceUid: string; pointName: string } }>;
      [key: string]: unknown;
    };
  }>;
} {
  return JSON.parse(screen.getByTestId('display-document-json').textContent ?? '{}');
}

