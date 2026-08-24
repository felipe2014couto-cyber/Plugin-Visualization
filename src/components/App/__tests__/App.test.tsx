import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import {
  checkPiConnection,
} from '../../../pi';
import { createDisplayDocument } from '../../../display';
import { App, VISUALIZATION_THEME_STORAGE_KEY } from '../App';

const mockGetBackendSrv = jest.fn();
const mockPostBackendSrv = jest.fn();

jest.mock('@grafana/runtime', () => ({
  PluginPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getBackendSrv: () => ({ get: mockGetBackendSrv, post: mockPostBackendSrv }),
}));

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  Icon: () => null,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Field: ({ children, label }: any) => <div>{label}{children}</div>,
  SecretInput: ({ isConfigured, ...props }: any) => <input type="password" {...props} />,
}));

jest.mock('../../../pi', () => ({
  checkPiConnection: jest.fn(),
  createProgressiveTrendLoader: jest.fn(() => jest.fn(async () => ({}))),
  getPiTrendsHistoryForRange: jest.fn(async () => ({})),
  getPiTrendsPreviewForRange: jest.fn(async () => ({})),
  getPiTrendsRecordedHistoryForRange: jest.fn(async () => ({})),
}));

describe('App', () => {
  const checkPiConnectionMock = checkPiConnection as jest.MockedFunction<typeof checkPiConnection>;

  beforeEach(() => {
    localStorage.clear();
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

    expect(screen.getByTestId('pims-vision-home')).toHaveAttribute('data-visualization-theme', 'light');
    expect(localStorage.getItem(VISUALIZATION_THEME_STORAGE_KEY)).toBe('light');
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
    fireEvent.change(screen.getByTestId('library-symbol-search'), { target: { value: 'PV003B' } });
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
    expect(screen.getByTestId('calculations-panel')).toBeVisible();
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
    expect(screen.getByTestId('mini-sheets-panel')).toBeVisible();
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
    await waitFor(() => expect(screen.getByTestId('pims-vision-save-dashboard')).toBeEnabled());

    fireEvent.click(screen.getByTestId('pims-vision-save-dashboard'));

    await waitFor(() => expect(mockPostBackendSrv).toHaveBeenCalledTimes(2));
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

    await waitFor(() => expect(mockPostBackendSrv).toHaveBeenCalledTimes(2));
    expect(mockPostBackendSrv.mock.calls[0][1]).toMatchObject({
      dashboard: expect.objectContaining({ uid: undefined }),
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
    expect(select.value).toBe('');

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

    expect(screen.getByTestId('programming-panel')).toBeInTheDocument();
    expect(screen.getByTestId('programming-html-editor')).toBeInTheDocument();
  });
});
