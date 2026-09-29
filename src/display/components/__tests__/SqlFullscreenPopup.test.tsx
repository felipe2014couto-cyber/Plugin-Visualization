import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SqlTableElement } from '../../createSqlTable';
import { SqlFullscreenPopup } from '../SqlFullscreenPopup';

jest.mock('../../../components/SqlQuery/SqlResultTable', () => ({
  SqlResultTable: () => <div data-testid="sip-popup-result">Resultado SIP</div>,
}));

describe('SqlFullscreenPopup', () => {
  const element = {
    id: 'sip-result',
    type: 'sql-table',
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    properties: { sql: 'SELECT 1', title: 'Tendência SIP', result: null },
  } as unknown as SqlTableElement;

  it('mostra o resultado sem a barra global e mantém o fechar', () => {
    const onClose = jest.fn();
    render(<SqlFullscreenPopup element={element} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Pop-up de tendência' })).toBeInTheDocument();
    expect(screen.getByText('Tendência SIP')).toBeInTheDocument();
    expect(screen.getByTestId('sip-popup-result')).toBeInTheDocument();
    expect(screen.queryByText('Novo display')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Aperam Visualization' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mais opções' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajuda' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar pop-up' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
