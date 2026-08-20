import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { PiPointSearchDialog } from '../PiPointSearchDialog';
import { searchPiPointsWithStatus } from '../piDataSource';
import { PI_POINT_DRAG_MIME } from '../piPointDrag';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

jest.mock('../piDataSource', () => ({
  searchPiPointsWithStatus: jest.fn(),
}));

describe('PiPointSearchDialog', () => {
  const searchMock = searchPiPointsWithStatus as jest.MockedFunction<typeof searchPiPointsWithStatus>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('não renderiza nada quando isOpen é falso', () => {
    const { container } = render(<PiPointSearchDialog isOpen={false} onClose={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('pesquisa com filtros, exibe tabela e permite selecionar', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          name: 'ACI_A60_S70S8',
          webId: 'webid-1',
          description: 'BOTAO DE CONFIRMACAO',
          pointType: 'Digital',
          engineeringUnit: 'estado',
          pointSource: 'R',
        },
      ],
      hasMore: false,
    });
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const onApplyResults = jest.fn();

    render(
      <PiPointSearchDialog
        isOpen
        onClose={onClose}
        onSelect={onSelect}
        onApplyResults={onApplyResults}
        initialTerm="ACI*"
      />
    );

    expect(screen.getByTestId('dialog-tag-mask')).toHaveValue('ACI*');

    fireEvent.change(screen.getByTestId('dialog-descriptor'), { target: { value: '*BOTAO*' } });
    fireEvent.change(screen.getByTestId('dialog-point-type'), { target: { value: 'Digital' } });
    fireEvent.change(screen.getByTestId('dialog-eng-units'), { target: { value: 'estado' } });
    fireEvent.change(screen.getByTestId('dialog-point-source'), { target: { value: 'R' } });
    fireEvent.click(screen.getByTestId('dialog-search-submit'));

    await waitFor(() => expect(screen.getByTestId('dialog-results-table')).toBeInTheDocument());
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        term: 'ACI*',
        description: '*BOTAO*',
        pointTypes: ['Digital'],
        engineeringUnits: ['estado'],
        pointSources: ['R'],
      })
    );
    expect(onApplyResults).toHaveBeenCalled();

    // Seleção de linha
    fireEvent.click(screen.getByTestId('dialog-row-webid-1'));
    expect(screen.getByTestId('dialog-ok-button')).not.toBeDisabled();

    // Drag and drop
    const dataTransfer = {
      effectAllowed: 'none',
      setData: jest.fn(),
    } as unknown as DataTransfer;
    fireEvent.dragStart(screen.getByTestId('dialog-row-webid-1'), { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      PI_POINT_DRAG_MIME,
      expect.stringContaining('ACI_A60_S70S8')
    );

    // Confirmação
    fireEvent.click(screen.getByTestId('dialog-ok-button'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'ACI_A60_S70S8' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('permite reiniciar filtros', async () => {
    render(<PiPointSearchDialog isOpen onClose={jest.fn()} initialTerm="TEST*" />);
    fireEvent.change(screen.getByTestId('dialog-descriptor'), { target: { value: 'Motor' } });
    fireEvent.click(screen.getByTestId('dialog-search-reset'));

    expect(screen.getByTestId('dialog-tag-mask')).toHaveValue('*');
    expect(screen.getByTestId('dialog-descriptor')).toHaveValue('');
  });
});
