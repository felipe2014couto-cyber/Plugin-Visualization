import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import {
  checkPiConnection,
} from '../../../pi';
import { App } from '../App';

jest.mock('@grafana/runtime', () => ({
  PluginPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
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

  it('mostra o estado inicial de verificação', () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);

    expect(screen.getByTestId('pi-connection-status')).toHaveTextContent('PI System: Verificando');
  });

  it('mantém o editor disponível quando a Data Source PI falha', async () => {
    checkPiConnectionMock.mockResolvedValue({ status: 'error' });
    render(<App />);

    expect(screen.getByTestId('display-editor')).toBeInTheDocument();
    expect(screen.getByTestId('display-surface')).toBeInTheDocument();
    expect(screen.getByTestId('display-mode-edit')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('display-insert-rectangle')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('pi-connection-status')).toHaveTextContent(
        'PI System: Data Source indisponível',
      ),
    );
  });

  it('organiza a pesquisa PI em Ativos ao lado da área do editor', () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);

    expect(screen.getByTestId('pims-vision-header')).toHaveTextContent('PIMS Vision');
    expect(screen.getByTestId('pims-vision-assets-panel')).toHaveTextContent('Ativos');
    expect(screen.getByTestId('pi-point-search')).toBeInTheDocument();
    expect(screen.getByTestId('pims-vision-editor-area')).toContainElement(screen.getByTestId('display-editor'));
    expect(screen.getByTestId('time-range-bar')).toBeInTheDocument();
    expect(screen.getByTestId('time-range-start')).toHaveValue('*-8h');
    expect(screen.getByTestId('time-range-end')).toHaveValue('*');
    expect(screen.getByRole('button', { name: 'Arrastar como Trend' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ocultar barra de ferramentas' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Arrastar como Barra' }));
    expect(screen.getByRole('button', { name: 'Arrastar como Barra' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('recolhe e reabre o painel lateral ao alternar o ícone do cubo', () => {
    checkPiConnectionMock.mockReturnValue(new Promise(() => undefined));

    render(<App />);

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
    expect(toggle).toHaveStyle({ color: '#ffffff', background: '#173c63' });

    fireEvent.click(toggle);

    expect(assetsPanel).toHaveTextContent('PI System');
    expect(toggle).toHaveAttribute('aria-label', 'Ocultar barra de ferramentas');
    expect(screen.getByTestId('display-editor-toolbar')).toBeInTheDocument();
  });
});
