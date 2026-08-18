import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { CalculationsPanel } from '../CalculationsPanel';
import { CALCULATION_DRAG_MIME } from '../../../calculations/calculationDrag';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

describe('CalculationsPanel', () => {
  it('abre o editor de cálculo e usa o PI Point selecionado', async () => {
    render(<CalculationsPanel selectedPiPoint={{ name: 'Vazao_01', webId: 'point-1', dataSourceUid: 'pi', path: '\\PIMS\\Vazao_01' }} />);

    fireEvent.click(screen.getByTestId('calculation-new'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Editor de cálculo');
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Vazao_01/ }));
    expect(screen.getByTestId('calculation-editor-expression')).toHaveValue('Vazao_01 ');

    fireEvent.change(screen.getByTestId('calculation-editor-name'), { target: { value: 'Vazão normalizada' } });
    fireEvent.click(screen.getByRole('button', { name: '/' }));
    fireEvent.change(screen.getByTestId('calculation-editor-expression'), { target: { value: 'Vazao_01 / 100' } });
    fireEvent.click(screen.getByTestId('calculation-editor-save'));

    await waitFor(() => expect(screen.getByTestId('calculation-1')).toHaveTextContent('Vazão normalizada'));
    expect(screen.getByTestId('calculation-1')).not.toHaveTextContent('Vazao_01 / 100');
    expect(screen.queryByTestId('calculations-empty')).toBeNull();
  });

  it('exige nome e expressão antes de salvar', () => {
    render(<CalculationsPanel />);

    fireEvent.click(screen.getByTestId('calculation-new'));
    fireEvent.click(screen.getByTestId('calculation-editor-save'));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome e uma expressão');
    expect(screen.getByTestId('calculations-empty')).toBeInTheDocument();
  });

  it('impede salvar dois cálculos com o mesmo nome', async () => {
    render(<CalculationsPanel />);

    fireEvent.click(screen.getByTestId('calculation-new'));
    fireEvent.change(screen.getByTestId('calculation-editor-name'), { target: { value: 'Teste' } });
    fireEvent.change(screen.getByTestId('calculation-editor-expression'), { target: { value: '1 + 1' } });
    fireEvent.click(screen.getByTestId('calculation-editor-save'));
    await waitFor(() => expect(screen.getByTestId('calculation-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('calculation-new'));
    fireEvent.change(screen.getByTestId('calculation-editor-name'), { target: { value: ' teste ' } });
    fireEvent.change(screen.getByTestId('calculation-editor-expression'), { target: { value: '2 + 2' } });
    fireEvent.click(screen.getByTestId('calculation-editor-save'));

    expect(screen.getByRole('alert')).toHaveTextContent('Já existe um cálculo com esse nome');
    expect(screen.queryByTestId('calculation-2')).toBeNull();
  });

  it('remove um cálculo salvo', async () => {
    render(<CalculationsPanel />);
    fireEvent.click(screen.getByTestId('calculation-new'));
    fireEvent.change(screen.getByTestId('calculation-editor-name'), { target: { value: 'Teste' } });
    fireEvent.change(screen.getByTestId('calculation-editor-expression'), { target: { value: '1 + 1' } });
    fireEvent.click(screen.getByTestId('calculation-editor-save'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remover Teste' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Remover Teste' }));
    expect(screen.getByTestId('calculations-empty')).toBeInTheDocument();
  });

  it('aceita um PI Point arrastado para a área de cálculo', () => {
    render(<CalculationsPanel />);
    fireEvent.click(screen.getByTestId('calculation-new'));

    const dataTransfer = {
      getData: jest.fn((type: string) => type === 'application/x-pims-vision-pi-point'
        ? JSON.stringify({ name: 'SINUSOID', webId: 'point-1', dataSourceUid: 'pi', path: '\\PIMS\\SINUSOID' })
        : ''),
      dropEffect: 'none',
    };
    fireEvent.drop(screen.getByTestId('calculation-editor-drop-zone'), { dataTransfer });

    expect(screen.getByTestId('calculation-editor-expression')).toHaveValue('SINUSOID ');
    expect(screen.getByTestId('calculation-editor-inputs')).toHaveTextContent('SINUSOID');
  });

  it('deixa um cálculo salvo arrastável para o display', async () => {
    render(<CalculationsPanel />);
    fireEvent.click(screen.getByTestId('calculation-new'));
    fireEvent.change(screen.getByTestId('calculation-editor-name'), { target: { value: 'Teste' } });
    fireEvent.change(screen.getByTestId('calculation-editor-expression'), { target: { value: '1 + 1' } });
    fireEvent.click(screen.getByTestId('calculation-editor-save'));

    await waitFor(() => expect(screen.getByTestId('calculation-1')).toBeInTheDocument());
    const dataTransfer = { effectAllowed: 'none', setData: jest.fn() };
    fireEvent.dragStart(screen.getByRole('button', { name: 'Teste' }), { dataTransfer });

    expect(screen.getByRole('button', { name: 'Teste' })).toHaveAttribute('draggable', 'true');
    expect(dataTransfer.setData).toHaveBeenCalledWith(CALCULATION_DRAG_MIME, '1');
  });
});
