import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { PiPointSearchDialog } from '../PiPointSearchDialog';
import { searchPiPointsWithStatus } from '../piDataSource';
import { PI_POINT_DRAG_MIME } from '../piPointDrag';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

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
    expect(onApplyResults).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'ACI_A60_S70S8' })],
      false
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('suporta multiseleção com Ctrl e Shift e envia apenas as tags selecionadas para o painel lateral', async () => {
    const mockPoints = [
      { name: 'TAG_1', webId: 'id-1', description: 'Temp 1' },
      { name: 'TAG_2', webId: 'id-2', description: 'Temp 2' },
      { name: 'TAG_3', webId: 'id-3', description: 'Temp 3' },
      { name: 'TAG_4', webId: 'id-4', description: 'Temp 4' },
    ];
    searchMock.mockResolvedValue({ results: mockPoints, hasMore: false });
    const onApplyResults = jest.fn();
    const onClose = jest.fn();

    render(
      <PiPointSearchDialog
        isOpen
        onClose={onClose}
        onApplyResults={onApplyResults}
      />
    );

    fireEvent.click(screen.getByTestId('dialog-search-submit'));
    await waitFor(() => expect(screen.getByTestId('dialog-results-table')).toBeInTheDocument());

    // 1. Clicar na TAG_1 (seleção única)
    fireEvent.click(screen.getByTestId('dialog-row-id-1'));
    expect(screen.getByTestId('dialog-selected-info')).toHaveTextContent('TAG_1');

    // 2. Ctrl+Click na TAG_3 (seleção individual adicional)
    fireEvent.click(screen.getByTestId('dialog-row-id-3'), { ctrlKey: true });
    expect(screen.getByTestId('dialog-selected-info')).toHaveTextContent('2 PI Points selecionados');

    // 3. Shift+Click da TAG_1 até TAG_3 seleciona TAG_1, TAG_2, TAG_3
    fireEvent.click(screen.getByTestId('dialog-row-id-1')); // anchor = index 0
    fireEvent.click(screen.getByTestId('dialog-row-id-3'), { shiftKey: true }); // range 0..2
    expect(screen.getByTestId('dialog-selected-info')).toHaveTextContent('3 PI Points selecionados');

    // Confirmar com OK
    fireEvent.click(screen.getByTestId('dialog-ok-button'));

    // Verifica que apenas as 3 selecionadas foram passadas para onApplyResults
    expect(onApplyResults).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: 'TAG_1' }),
        expect.objectContaining({ name: 'TAG_2' }),
        expect.objectContaining({ name: 'TAG_3' }),
      ],
      false
    );
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
