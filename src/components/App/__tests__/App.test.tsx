import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import {
  checkPiConnection,
  getPiPointRawCurrentValue,
  getPiPointsCurrentValues,
  getPiTrendsPlotDataForRange,
  getPiTrendsRecordedHistoryForRange,
  type PiPointValue,
} from '../../../pi';
import { createDisplayDocument } from '../../../display';
import { App, loadFinalTrendForRange, VISUALIZATION_THEME_STORAGE_KEY } from '../App';

const mockGetBackendSrv = jest.fn();
const mockPostBackendSrv = jest.fn();

jest.mock('@grafana/runtime', () => ({
  PluginPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getBackendSrv: () => ({ get: mockGetBackendSrv, post: mockPostBackendSrv }),
}));

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
    Icon: () => null,
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Input: (props: any) => <input {...props} />,
    Field: ({ children, label }: any) => <div>{label}{children}</div>,
    SecretInput: ({ isConfigured, ...props }: any) => <input type="password" {...props} />,
  };
});

jest.mock('../../../pi', () => ({
  checkPiConnection: jest.fn(),
  createProgressiveTrendLoader: jest.fn(() => jest.fn(async () => ({}))),
  getPiTrendsHistoryForRange: jest.fn(async () => ({})),
  getPiPointsCurrentValues: jest.fn(async () => ({})),
  getPiPointRawCurrentValue: jest.fn(async () => ({ value: undefined })),
  getPiTrendsPlotDataForRange: jest.fn(async () => ({})),
  getPiTrendsPreviewForRange: jest.fn(async () => ({})),
  getPiTrendsRecordedHistoryForRange: jest.fn(async () => ({})),
}));

describe('App', () => {
  const checkPiConnectionMock = checkPiConnection as jest.MockedFunction<typeof checkPiConnection>;

  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
    localStorage.clear();
    checkPiConnectionMock.mockReset();
    (getPiPointsCurrentValues as jest.MockedFunction<typeof getPiPointsCurrentValues>).mockClear();
    (getPiPointRawCurrentValue as jest.MockedFunction<typeof getPiPointRawCurrentValue>).mockReset();
    mockPostBackendSrv.mockReset();
    mockGetBackendSrv.mockImplementation((url: string) => {
      if (url === '/api/user') {
        return Promise.resolve({ id: 1, login: 'admin' });
      }
      if (url.startsWith('/api/search?type=dash-folder')) {
        return Promise.resolve([]);
      }
      if (url.startsWith('/api/search?type=dash-db')) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
    mockPostBackendSrv.mockResolvedValue({ uid: 'new-dashboard-uid', url: '/d/new-dashboard-uid' });
  });

  it('usa PlotData para séries numéricas e Recorded para estados no carregamento final do popup', async () => {
    const numeric = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID', webId: 'numeric-webid' };
    const state = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'STATUS', webId: 'state-webid', pointType: 'Digital' };
    const range = { from: 1_000, to: 2_000 };
    const options = { maxDataPoints: 500, mode: 'final-only' as const, revision: 3 };
    const plotResult = { 'ds\u0000pims\u0000SINUSOID': { status: 'success' as const, series: { pointName: 'SINUSOID', points: [] } } };
    const stateResult = { 'ds\u0000pims\u0000STATUS': { status: 'success' as const, series: { pointName: 'STATUS', points: [], states: [] } } };
    const plotMock = getPiTrendsPlotDataForRange as jest.MockedFunction<typeof getPiTrendsPlotDataForRange>;
    const recordedMock = getPiTrendsRecordedHistoryForRange as jest.MockedFunction<typeof getPiTrendsRecordedHistoryForRange>;
    plotMock.mockResolvedValueOnce(plotResult);
    recordedMock.mockResolvedValueOnce(stateResult);

    await expect(loadFinalTrendForRange([numeric, state], range, options)).resolves.toEqual({ ...plotResult, ...stateResult });
    expect(plotMock).toHaveBeenCalledWith([numeric], range, options);
    expect(recordedMock).toHaveBeenCalledWith([state], range, { ...options, includeOutside: true });
  });

  it('usa Recorded como fallback atômico quando PlotData não suporta uma série do popup', async () => {
    const numeric = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'CODIGO_UM', webId: 'code-webid' };
    const range = { from: 1_000, to: 2_000 };
    const options = { maxDataPoints: 500, mode: 'final-only' as const, revision: 4 };
    const recordedResult = {
      'ds\u0000pims\u0000CODIGO_UM': {
        status: 'success' as const,
        series: { pointName: 'CODIGO_UM', points: [], states: [{ time: 900, value: 'RJNTB' }] },
      },
    };
    const plotMock = getPiTrendsPlotDataForRange as jest.MockedFunction<typeof getPiTrendsPlotDataForRange>;
    const recordedMock = getPiTrendsRecordedHistoryForRange as jest.MockedFunction<typeof getPiTrendsRecordedHistoryForRange>;
    plotMock.mockResolvedValueOnce({
      'ds\u0000pims\u0000CODIGO_UM': {
        status: 'success',
        series: { pointName: 'CODIGO_UM', points: [], states: [] },
      },
    });
    recordedMock.mockResolvedValueOnce({}).mockResolvedValueOnce(recordedResult);

    await expect(loadFinalTrendForRange([numeric], range, options)).resolves.toEqual(recordedResult);
    expect(recordedMock).toHaveBeenLastCalledWith([numeric], range, { ...options, includeOutside: true });
  });

  it('exibe o estado atual na legenda de binding legado sem pointType quando não houve evento histórico', async () => {
    const now = Date.parse('2026-09-17T11:35:27.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const state = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'DTH_INICIO', webId: 'state-webid' };
    const range = { from: now - 8 * 60 * 60 * 1000, to: now };
    const options = { maxDataPoints: 500, mode: 'final-only' as const, revision: 5 };
    const plotMock = getPiTrendsPlotDataForRange as jest.MockedFunction<typeof getPiTrendsPlotDataForRange>;
    const recordedMock = getPiTrendsRecordedHistoryForRange as jest.MockedFunction<typeof getPiTrendsRecordedHistoryForRange>;
    const currentMock = getPiPointsCurrentValues as jest.MockedFunction<typeof getPiPointsCurrentValues>;
    plotMock.mockResolvedValueOnce({
      'ds\u0000pims\u0000DTH_INICIO': { status: 'success', series: { pointName: 'DTH_INICIO', points: [], states: [] } },
    });
    recordedMock.mockResolvedValueOnce({}).mockResolvedValueOnce({
      'ds\u0000pims\u0000DTH_INICIO': {
        status: 'success',
        series: { pointName: 'DTH_INICIO', points: [], states: [{ time: now - 1_000, value: '--' }] },
      },
    });
    currentMock.mockResolvedValueOnce({
      'ds\u0000pims\u0000DTH_INICIO': {
        status: 'success',
        value: { value: '--', timestamp: new Date(now).toISOString() },
      },
    });
    (getPiPointRawCurrentValue as jest.MockedFunction<typeof getPiPointRawCurrentValue>).mockResolvedValueOnce({
      value: { Name: 'Shutdown', Value: 254, IsSystem: true },
      timestamp: '2026-09-04T10:34:12.000Z',
      quality: { good: false },
    });

    await expect(loadFinalTrendForRange([state], range, options)).resolves.toEqual({
      'ds\u0000pims\u0000DTH_INICIO': {
        status: 'success',
        series: { pointName: 'DTH_INICIO', points: [], states: [{ time: now, value: 'Shutdown' }] },
      },
    });
    expect(currentMock).toHaveBeenCalledWith([state]);
    expect(getPiPointRawCurrentValue).toHaveBeenCalledWith(state);
  });

  it('não usa o valor atual para uma janela histórica antiga', async () => {
    const now = Date.parse('2026-09-17T11:35:27.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const state = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'DTH_INICIO', pointType: 'Digital' };
    const range = { from: now - 10 * 60 * 60 * 1000, to: now - 2 * 60 * 60 * 1000 };
    const options = { maxDataPoints: 500, mode: 'final-only' as const, revision: 6 };
    const recordedMock = getPiTrendsRecordedHistoryForRange as jest.MockedFunction<typeof getPiTrendsRecordedHistoryForRange>;
    const currentMock = getPiPointsCurrentValues as jest.MockedFunction<typeof getPiPointsCurrentValues>;
    const historical = {
      'ds\u0000pims\u0000DTH_INICIO': { status: 'success' as const, series: { pointName: 'DTH_INICIO', points: [], states: [] } },
    };
    recordedMock.mockResolvedValueOnce(historical);

    await expect(loadFinalTrendForRange([state], range, options)).resolves.toEqual(historical);
    expect(currentMock).not.toHaveBeenCalled();
  });

  it('não transforma valor numérico atual em estado de série vazia', async () => {
    const now = Date.parse('2026-09-17T11:35:27.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const numeric = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'NUMERIC', webId: 'numeric-webid' };
    const range = { from: now - 60_000, to: now };
    const options = { maxDataPoints: 500, mode: 'final-only' as const, revision: 7 };
    const empty = {
      'ds\u0000pims\u0000NUMERIC': { status: 'success' as const, series: { pointName: 'NUMERIC', points: [], states: [] } },
    };
    (getPiTrendsPlotDataForRange as jest.MockedFunction<typeof getPiTrendsPlotDataForRange>).mockResolvedValueOnce(empty);
    (getPiPointsCurrentValues as jest.MockedFunction<typeof getPiPointsCurrentValues>).mockResolvedValueOnce({
      'ds\u0000pims\u0000NUMERIC': { status: 'success', value: { value: 42, timestamp: new Date(now).toISOString() } },
    });

    await expect(loadFinalTrendForRange([numeric], range, options)).resolves.toEqual(empty);
  });

  it('consulta estados raw de múltiplas séries em paralelo', async () => {
    const now = Date.parse('2026-09-17T11:35:27.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const first = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'STATE_A', webId: 'state-a', pointType: 'String' };
    const second = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'STATE_B', webId: 'state-b', pointType: 'String' };
    const range = { from: now - 60_000, to: now };
    const options = { maxDataPoints: 500, mode: 'final-only' as const, revision: 8 };
    const unresolved = Object.fromEntries([first, second].map((binding) => [
      `ds\u0000pims\u0000${binding.pointName}`,
      { status: 'success' as const, series: { pointName: binding.pointName, points: [], states: [{ time: now - 1_000, value: '--' }] } },
    ]));
    (getPiTrendsRecordedHistoryForRange as jest.MockedFunction<typeof getPiTrendsRecordedHistoryForRange>)
      .mockResolvedValueOnce(unresolved);
    (getPiPointsCurrentValues as jest.MockedFunction<typeof getPiPointsCurrentValues>).mockResolvedValueOnce(
      Object.fromEntries([first, second].map((binding) => [
        `ds\u0000pims\u0000${binding.pointName}`,
        { status: 'success', value: { value: '--', timestamp: new Date(now).toISOString() } },
      ])),
    );
    const pending = new Map<string, (value: PiPointValue) => void>();
    const rawMock = getPiPointRawCurrentValue as jest.MockedFunction<typeof getPiPointRawCurrentValue>;
    rawMock.mockImplementation((binding) => new Promise((resolve) => pending.set(binding.pointName, resolve)));

    const loading = loadFinalTrendForRange([first, second], range, options);
    await waitFor(() => expect(rawMock).toHaveBeenCalledTimes(2));
    pending.get('STATE_A')?.({ value: { Name: 'Shutdown' } });
    pending.get('STATE_B')?.({ value: 'Running' });

    await expect(loading).resolves.toMatchObject({
      'ds\u0000pims\u0000STATE_A': { series: { states: [{ time: now, value: 'Shutdown' }] } },
      'ds\u0000pims\u0000STATE_B': { series: { states: [{ time: now, value: 'Running' }] } },
    });
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('mostra o estado inicial de verificação da sessão', () => {
    mockGetBackendSrv.mockReturnValue(new Promise(() => undefined));
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);

    expect(screen.getByTestId('pims-vision-auth-gate')).toHaveTextContent('Verificando acesso');
  });

  it('mantém o editor disponível quando a Data Source PI falha', async () => {
    checkPiConnectionMock.mockResolvedValue({ status: 'error' });
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());
    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface')).toBeInTheDocument();
    expect(screen.getByTestId('display-mode-edit')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Arrastar como Trend')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('pi-connection-status')).toHaveTextContent(
        'PI System: Data Source indisponível',
      ),
    );
  });

  it('organiza a pesquisa PI em Ativos ao lado da área do editor', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    expect(screen.getByTestId('pims-vision-header')).toHaveTextContent('Visualization');
    expect(screen.getByTestId('pims-vision-assets-panel')).toHaveTextContent('Data');
    expect(screen.getByTestId('pi-point-search')).toBeInTheDocument();
    expect(screen.getByTestId('pims-vision-editor-area')).toContainElement(screen.getByTestId('display-editor'));
    expect(screen.getByTestId('time-range-bar')).toBeInTheDocument();
    expect(screen.getByTestId('time-range-start')).toHaveValue('*-8h');
    expect(screen.getByTestId('time-range-end')).toHaveValue('*');
    expect(screen.getByRole('button', { name: 'Arrastar como Trend' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ocultar barra de ferramentas' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Arrastar como Barra' })).toBeInTheDocument();
  });

  it('recolhe e reabre o painel lateral ao alternar o ícone do cubo', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    const toggle = screen.getByTestId('pims-vision-toggle-assets-panel');
    const assetsPanel = screen.getByTestId('pims-vision-assets-panel');

    expect(assetsPanel).toHaveTextContent('PI System');
    expect(toggle).toHaveAttribute('aria-label', 'Ocultar barra de ferramentas');
    expect(screen.getByTestId('display-editor-toolbar')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(assetsPanel).not.toHaveTextContent('PI System');
    expect(toggle).toHaveAttribute('aria-label', 'Mostrar barra de ferramentas');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('display-editor-toolbar')).toBeNull();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(assetsPanel).toHaveTextContent('PI System');
    expect(toggle).toHaveAttribute('aria-label', 'Ocultar barra de ferramentas');
    expect(screen.getByTestId('display-editor-toolbar')).toBeInTheDocument();
  });

  it('inicia no tema escuro e persiste a troca para o tema claro', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    expect(screen.getByTestId('pims-vision-home')).toHaveAttribute('data-visualization-theme', 'dark');
    expect(screen.getByTestId('visualization-theme-dark')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('visualization-theme-light'));

    await waitFor(() => {
      expect(screen.getByTestId('pims-vision-home')).toHaveAttribute('data-visualization-theme', 'light');
      expect(localStorage.getItem(VISUALIZATION_THEME_STORAGE_KEY)).toBe('light');
    });
  });

  it('restaura o tema persistido sem alterar a interface', async () => {
    localStorage.setItem(VISUALIZATION_THEME_STORAGE_KEY, 'light');
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    expect(screen.getByTestId('pims-vision-home')).toHaveAttribute('data-visualization-theme', 'light');
    expect(screen.getByTestId('pims-vision-assets-panel')).toBeInTheDocument();
    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(screen.getByTestId('time-range-bar')).toBeInTheDocument();
  });

  it('troca para Library sem apagar a pesquisa do módulo', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pims-vision-library-tab'));
    expect(screen.getByTestId('pims-vision-library-tab')).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(await screen.findByTestId('library-symbol-search'), { target: { value: 'PV003B' } });
    fireEvent.click(screen.getByTestId('pims-vision-assets-tab'));
    expect(screen.getByTestId('pims-vision-assets-tab')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('pims-vision-library-tab'));

    expect(screen.getByTestId('library-symbol-search')).toHaveValue('PV003B');
  });

  it('exibe o módulo de Cálculos à direita de Library', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pims-vision-calculations-tab'));

    expect(screen.getByTestId('pims-vision-calculations-tab')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('calculations-panel')).toBeVisible();
    expect(screen.getByTestId('pims-vision-library-tab')).toHaveAttribute('aria-selected', 'false');
  });

  it('exibe o módulo de Sheets e coloca o menu PI DataLink no painel lateral', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    // Verify Sheets is NOT in the assets tab header
    expect(screen.queryByTestId('pims-vision-sheets-header-tab')).toBeNull();
    expect(screen.getByTestId('pims-vision-assets-tab')).toBeInTheDocument();
    expect(screen.getByTestId('pims-vision-library-tab')).toBeInTheDocument();
    expect(screen.getByTestId('pims-vision-calculations-tab')).toBeInTheDocument();

    // Click sheets icon in vertical rail
    fireEvent.click(screen.getByTestId('pims-vision-sheets-tab'));

    expect(screen.getByTestId('pims-vision-sheets-tab')).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByTestId('mini-sheets-panel')).toBeVisible();
    expect(screen.getByTestId('mini-sheets-cell-A1')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('pims-sheets-menu-slot')).toContainElement(screen.getByTestId('pi-datalink-ribbon')));
    expect(screen.getByTestId('mini-sheets-panel')).not.toContainElement(screen.getByTestId('pi-datalink-ribbon'));

    // Switch back to visualization
    fireEvent.click(screen.getByTestId('pims-vision-toggle-assets-panel'));
    expect(screen.getByTestId('pims-vision-toggle-assets-panel')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('display-editor')).toBeVisible();

    // Data, Library and Calculation tabs remain fully functional
    fireEvent.click(screen.getByTestId('pims-vision-library-tab'));
    expect(screen.getByTestId('pims-vision-library-tab')).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByTestId('pims-vision-calculations-tab'));
    expect(screen.getByTestId('pims-vision-calculations-tab')).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByTestId('pims-vision-assets-tab'));
    expect(screen.getByTestId('pims-vision-assets-tab')).toHaveAttribute('aria-selected', 'true');
  });

  it('mantém o botão do PiChat visível e abre o popover', async () => {
    checkPiConnectionMock.mockResolvedValue({ status: 'error' });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    const piChatButton = screen.getByTestId('pims-vision-pichat-tab');
    expect(piChatButton).toBeInTheDocument();
    expect(piChatButton).toHaveAttribute('aria-label', 'PiChat');

    fireEvent.click(piChatButton);

    expect(screen.getByTestId('pichat-popover')).toBeInTheDocument();
    expect(piChatButton).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('pichat-close-button'));
    expect(screen.queryByTestId('pichat-popover')).toBeNull();
  });

  it('mantém o botão do PiChat visível quando o backend está indisponível', async () => {
    checkPiConnectionMock.mockResolvedValue({ status: 'error' });
    mockPostBackendSrv.mockRejectedValue(new Error('PiChat backend unavailable'));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    expect(screen.getByTestId('pims-vision-pichat-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pims-vision-pichat-tab'));
    expect(screen.getByTestId('pichat-popover')).toBeInTheDocument();
  });

  it('salva diretamente as alterações do dashboard atual', async () => {
    globalThis.history.replaceState(null, '', '/a/pims-vision-app?dashboardUid=current-dashboard-uid');
    const document = createDisplayDocument({ name: 'Dashboard atual' });
    mockGetBackendSrv.mockImplementation((url: string) => {
      if (url === '/api/user') {
        return Promise.resolve({ id: 1, login: 'admin' });
      }
      if (url.startsWith('/api/search?type=dash-folder')) {
        return Promise.resolve([]);
      }
      if (url.startsWith('/api/dashboards/uid/current-dashboard-uid')) {
        return Promise.resolve({ dashboard: { pimsVision: document }, meta: { folderUid: 'folder-uid' } });
      }
      return Promise.resolve({});
    });
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Dashboard atual')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('pims-vision-save-dashboard')).toBeEnabled());

    fireEvent.click(screen.getByTestId('pims-vision-save-dashboard'));

    await waitFor(() => expect(mockPostBackendSrv).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockPostBackendSrv.mock.calls[0][1]).toMatchObject({
      dashboard: expect.objectContaining({ uid: 'current-dashboard-uid' }),
      folderUid: 'folder-uid',
      overwrite: true,
    });
  });

  it('salva como sempre cria um novo dashboard', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pims-vision-save-as-dashboard'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Salvar como');

    fireEvent.click(screen.getByTestId('pims-vision-save-as-submit'));

    await waitFor(() => expect(mockPostBackendSrv).toHaveBeenCalledTimes(1));
    expect(mockPostBackendSrv.mock.calls[0][1]).toMatchObject({
      dashboard: expect.objectContaining({ uid: expect.stringMatching(/^pims-/) }),
      overwrite: false,
    });
    expect(globalThis.location.search).toBe('?dashboardUid=new-dashboard-uid');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exibe e altera opções de atualização automática no cabeçalho superior', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    const select = screen.getByTestId('header-auto-refresh-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('adaptativa');

    fireEvent.change(select, { target: { value: '10s' } });
    expect(select.value).toBe('10s');

    const refreshBtn = screen.getByTestId('header-refresh-now');
    expect(refreshBtn).toBeInTheDocument();
    fireEvent.click(refreshBtn);
  });

  it('exibe o módulo Programming na barra lateral e abre seu painel', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    const programmingButton = screen.getByTestId('pims-vision-programming-tab');
    expect(programmingButton).toHaveAttribute('aria-label', 'Programming');
    fireEvent.click(programmingButton);

    const programmingWorkspace = screen.getByTestId('pims-vision-programming-workspace');
    await waitFor(() => expect(programmingWorkspace.querySelector('[data-testid="programming-panel"]')).not.toBeNull());
    expect(screen.getByTestId('programming-html-editor')).toBeInTheDocument();
    expect(screen.getByTestId('programming-pi-system-toggle')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByTestId('programming-pi-system-toggle'));
    expect(screen.getByTestId('programming-pi-system-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('adiciona o Programming pronto como elemento persistente do Display', async () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pims-vision-home')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pims-vision-programming-tab'));
    fireEvent.click(await screen.findByTestId('programming-add-to-display'));

    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(document.querySelector('[data-element-type="programming"]')).not.toBeNull();
  });
});
