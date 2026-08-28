import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { LibraryPanel } from '../LibraryPanel';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

describe('LibraryPanel', () => {
  it('exibe pesquisa, categorias recolhíveis e os SVGs locais disponíveis', () => {
    render(<LibraryPanel />);

    expect(screen.getByPlaceholderText('Pesquisar símbolos...')).toBeInTheDocument();
    expect(screen.getByText('Motores')).toBeInTheDocument();
    expect(screen.queryByTestId('library-symbol-PT002A_Option1')).toBeNull();
    expect(screen.queryByTestId('library-symbol-PV003B')).toBeNull();
    expect(screen.getByRole('button', { name: /Instrumentação/ })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Instrumentação/ }));
    expect(screen.getByTestId('library-symbol-PT002A_Option1')).toBeInTheDocument();
  });

  it('filtra símbolos sem remover as categorias', () => {
    render(<LibraryPanel />);
    fireEvent.change(screen.getByTestId('library-symbol-search'), { target: { value: 'PV003B' } });

    expect(screen.getByTestId('library-symbol-PV003B')).toBeInTheDocument();
    expect(screen.queryByTestId('library-symbol-PT002A_Option1')).toBeNull();
    expect(screen.getByText('Motores')).toBeInTheDocument();
  });

  it('renderiza os cards de motores dentro do grupo Motores', () => {
    render(<LibraryPanel />);
    fireEvent.click(screen.getByTestId('library-category-Motores').querySelector('button') as HTMLButtonElement);

    expect(screen.getByText('Motor 01')).toBeInTheDocument();
    expect(screen.queryByText('Motor elétrico industrial horizontal')).toBeNull();
    expect(screen.queryByText('Motor elétrico industrial compacto')).toBeNull();
  });
});
