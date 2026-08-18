import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { CalculationsPanel } from '../CalculationsPanel';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

describe('CalculationsPanel', () => {
  it('cria um cálculo usando o PI Point selecionado', () => {
    render(<CalculationsPanel selectedPiPoint={{ name: 'Vazao_01', webId: 'point-1' }} />);

    expect(screen.getByTestId('calculation-point-context')).toHaveTextContent('Vazao_01');
    fireEvent.click(screen.getByRole('button', { name: 'Inserir' }));
    expect(screen.getByTestId('calculation-expression')).toHaveValue('Vazao_01 ');

    fireEvent.change(screen.getByTestId('calculation-name'), { target: { value: 'Vazão normalizada' } });
    fireEvent.click(screen.getByTestId('calculation-operator-divide'));
    fireEvent.change(screen.getByTestId('calculation-expression'), { target: { value: 'Vazao_01 / 100' } });
    fireEvent.click(screen.getByTestId('calculation-add'));

    expect(screen.getByTestId('calculation-1')).toHaveTextContent('Vazão normalizada');
    expect(screen.getByTestId('calculation-1')).toHaveTextContent('Vazao_01 / 100');
    expect(screen.queryByTestId('calculations-empty')).toBeNull();
  });

  it('exige nome e expressão antes de salvar', () => {
    render(<CalculationsPanel />);

    fireEvent.click(screen.getByTestId('calculation-add'));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome e uma expressão');
    expect(screen.getByTestId('calculations-empty')).toBeInTheDocument();
  });

  it('remove um cálculo salvo', () => {
    render(<CalculationsPanel />);
    fireEvent.change(screen.getByTestId('calculation-name'), { target: { value: 'Teste' } });
    fireEvent.change(screen.getByTestId('calculation-expression'), { target: { value: '1 + 1' } });
    fireEvent.click(screen.getByTestId('calculation-add'));

    fireEvent.click(screen.getByRole('button', { name: 'Remover Teste' }));
    expect(screen.getByTestId('calculations-empty')).toBeInTheDocument();
  });
});
