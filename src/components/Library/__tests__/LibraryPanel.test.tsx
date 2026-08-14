import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { LibraryPanel } from '../LibraryPanel';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

describe('LibraryPanel', () => {
  it('exibe pesquisa, categorias recolhíveis e os SVGs locais disponíveis', () => {
    render(<LibraryPanel />);

    expect(screen.getByPlaceholderText('Pesquisar símbolos...')).toBeInTheDocument();
    expect(screen.getByText('Motores')).toBeInTheDocument();
    expect(screen.getByTestId('library-symbol-PT002A_Option1')).toBeInTheDocument();
    expect(screen.getByTestId('library-symbol-PV003B')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Instrumentação/ }));
    expect(screen.queryByTestId('library-symbol-PT002A_Option1')).toBeNull();
  });

  it('filtra símbolos sem remover as categorias', () => {
    render(<LibraryPanel />);
    fireEvent.change(screen.getByTestId('library-symbol-search'), { target: { value: 'PV003B' } });

    expect(screen.getByTestId('library-symbol-PV003B')).toBeInTheDocument();
    expect(screen.queryByTestId('library-symbol-PT002A_Option1')).toBeNull();
    expect(screen.getByText('Motores')).toBeInTheDocument();
  });

  it('renderiza os seis cards de motores dentro do grupo Motores', () => {
    render(<LibraryPanel />);
    fireEvent.click(screen.getByTestId('library-category-Motores').querySelector('button') as HTMLButtonElement);

    expect(screen.getByText('Motor elétrico industrial horizontal')).toBeInTheDocument();
    expect(screen.getByText('Motor elétrico industrial compacto')).toBeInTheDocument();
    expect(screen.getByText('Motor elétrico de ventilação')).toBeInTheDocument();
    expect(screen.getByText('Motor de passo')).toBeInTheDocument();
    expect(screen.getByText('Motor vibratório')).toBeInTheDocument();
    expect(screen.getByText('Motor elétrico trifásico')).toBeInTheDocument();
  });
});
