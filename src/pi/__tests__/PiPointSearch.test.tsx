import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { PiPointSearch } from '../PiPointSearch';
import { searchPiPointsWithStatus } from '../piDataSource';
import { PI_POINT_DRAG_MIME } from '../piPointDrag';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

jest.mock('../piDataSource', () => ({
  searchPiPointsWithStatus: jest.fn(),
}));

describe('PiPointSearch', () => {
  const searchMock = searchPiPointsWithStatus as jest.MockedFunction<typeof searchPiPointsWithStatus>;

  it('pesquisa, exibe resultados e identifica o PI Point selecionado', async () => {
    searchMock.mockResolvedValue({ results: [
      { name: 'LFI_A268SV_TEMPERATURA_AMBIENTE', webId: 'point-webid', path: '\\\\pims\\LFI_A268SV_TEMPERATURA_AMBIENTE' },
    ], hasMore: false });
    const onSelect = jest.fn();
    render(<PiPointSearch enabled onSelect={onSelect} />);

    fireEvent.change(screen.getByTestId('pi-point-search-input'), {
      target: { value: 'LFI_A268SV_TEMPERATURA_AMBIENTE' },
    });
    fireEvent.click(screen.getByTestId('pi-point-search-submit'));

    await waitFor(() => expect(screen.getByTestId('pi-point-search-results')).toBeInTheDocument());
    expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ term: 'LFI_A268SV_TEMPERATURA_AMBIENTE' }));

    fireEvent.click(screen.getByTestId('pi-point-result-point-webid'));
    expect(screen.getByTestId('pi-point-selected')).toHaveTextContent(
      'Tag selecionada: LFI_A268SV_TEMPERATURA_AMBIENTE',
    );
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      name: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
    }));

    const dataTransfer = {
      effectAllowed: 'none',
      setData: jest.fn(),
    } as unknown as DataTransfer;
    fireEvent.dragStart(screen.getByTestId('pi-point-result-point-webid'), { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      PI_POINT_DRAG_MIME,
      expect.stringContaining('LFI_A268SV_TEMPERATURA_AMBIENTE'),
    );
  });

  it('trata resultado vazio, erro e pesquisa indisponível sem quebrar a UI', async () => {
    searchMock.mockResolvedValueOnce({ results: [], hasMore: false }).mockRejectedValueOnce(new Error('failed'));
    render(<PiPointSearch enabled filtersOpen />);

    const input = screen.getByTestId('pi-point-search-input');
    const submit = screen.getByTestId('pi-point-search-submit');
    fireEvent.change(input, { target: { value: 'UNKNOWN_TAG' } });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByTestId('pi-point-search-empty')).toBeInTheDocument());

    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByTestId('pi-point-search-error')).toBeInTheDocument());

    render(<PiPointSearch enabled={false} />);
    expect(screen.getAllByTestId('pi-point-search-disabled')).toHaveLength(1);
    expect(screen.getAllByTestId('pi-point-search-submit')[1]).toBeDisabled();
  });

  it('filtra cumulativamente por descrição, tipo de dados e unidade de engenharia', async () => {
    searchMock.mockResolvedValue({ results: [
      { name: 'TEMPERATURA_A', webId: 'point-a', description: 'Forno', pointType: 'Float32', engineeringUnit: '°C' },
      { name: 'PRESSAO_A', webId: 'point-b', description: 'Forno', pointType: 'Float32', engineeringUnit: 'bar' },
      { name: 'ESTADO_A', webId: 'point-c', description: 'Bomba', pointType: 'Digital', engineeringUnit: 'estado' },
    ], hasMore: false });
    render(<PiPointSearch enabled filtersOpen />);

    fireEvent.change(screen.getByTestId('pi-point-search-input'), { target: { value: '*' } });
    fireEvent.change(screen.getByTestId('pi-point-search-description'), { target: { value: 'forno' } });
    fireEvent.click(screen.getByTestId('pi-point-search-submit'));
    await waitFor(() => expect(screen.getByTestId('pi-point-search-filters')).toBeInTheDocument());

    expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ term: '*', description: 'forno' }));
    expect(screen.getByTestId('pi-point-search-results')).toHaveTextContent('TEMPERATURA_A');
    expect(screen.getByTestId('pi-point-search-results')).toHaveTextContent('PRESSAO_A');
    expect(screen.getByTestId('pi-point-search-results')).not.toHaveTextContent('ESTADO_A');

    fireEvent.change(screen.getByTestId('pi-point-filter-engineering-unit'), { target: { value: 'bar' } });
    expect(screen.getByTestId('pi-point-search-results')).toHaveTextContent('PRESSAO_A');
    expect(screen.getByTestId('pi-point-search-results')).not.toHaveTextContent('TEMPERATURA_A');
  });

  it('disponibiliza os tipos de dados antes da primeira pesquisa', () => {
    render(<PiPointSearch enabled filtersOpen />);

    expect(screen.getByLabelText('Float32')).toBeInTheDocument();
    expect(screen.getByLabelText('Digital')).toBeInTheDocument();
  });

  it('mostra contador quando existem mais de 1000 resultados', async () => {
    searchMock.mockResolvedValue({
      results: Array.from({ length: 1000 }, (_, index) => ({ name: `TAG_${index}`, webId: `id-${index}` })),
      hasMore: true,
    });
    render(<PiPointSearch enabled />);

    fireEvent.change(screen.getByTestId('pi-point-search-input'), { target: { value: 'TAG' } });
    fireEvent.click(screen.getByTestId('pi-point-search-submit'));

    await waitFor(() => expect(screen.getByTestId('pi-point-search-count')).toHaveTextContent('1000 PI Points exibidos'));
  });
});
