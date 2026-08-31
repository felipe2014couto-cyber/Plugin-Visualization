import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MiniSheetsSipDialog } from '../MiniSheetsSipDialog';
import {
  createOracleSession,
  closeOracleSession,
  runOracleQuery,
} from '../../SqlQuery/oracleApi';

jest.mock('../../SqlQuery/oracleApi', () => ({
  SIP_DEFAULT_MAX_ROWS: 200,
  SIP_HARD_MAX_ROWS: 2000,
  OracleApiError: class OracleApiError extends Error {},
  createOracleSession: jest.fn(),
  closeOracleSession: jest.fn(),
  runOracleQuery: jest.fn(),
}));

describe('MiniSheetsSipDialog', () => {
  const mockCreateOracleSession = createOracleSession as jest.MockedFunction<typeof createOracleSession>;
  const mockCloseOracleSession = closeOracleSession as jest.MockedFunction<typeof closeOracleSession>;
  const mockRunOracleQuery = runOracleQuery as jest.MockedFunction<typeof runOracleQuery>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza o formulário de login quando não há sessão ativa', () => {
    render(
      <MiniSheetsSipDialog
        initialTargetCell="A1"
        onExecuteInsert={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByTestId('mini-sheets-sip-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('sip-login-form')).toBeInTheDocument();
    expect(screen.getByTestId('sip-username-input')).toBeInTheDocument();
    expect(screen.getByTestId('sip-password-input')).toBeInTheDocument();
    expect(screen.getByTestId('sip-connect-button')).toBeDisabled();
  });

  it('realiza conexão com o SIP com sucesso', async () => {
    mockCreateOracleSession.mockResolvedValueOnce({ connected: true });
    const onConnectionChange = jest.fn();

    render(
      <MiniSheetsSipDialog
        initialTargetCell="A1"
        onConnectionChange={onConnectionChange}
        onExecuteInsert={jest.fn()}
        onClose={jest.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('sip-username-input'), { target: { value: 'operador' } });
    fireEvent.change(screen.getByTestId('sip-password-input'), { target: { value: 'senha123' } });

    expect(screen.getByTestId('sip-connect-button')).toBeEnabled();
    fireEvent.click(screen.getByTestId('sip-connect-button'));

    await waitFor(() => {
      expect(mockCreateOracleSession).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'operador',
          password: 'senha123',
        }),
        expect.anything()
      );
      expect(onConnectionChange).toHaveBeenCalledWith(true);
      expect(screen.getByTestId('sip-status-bar')).toBeInTheDocument();
      expect(screen.getByText('Conectado ao SIP')).toBeInTheDocument();
    });
  });

  it('exibe erro quando a conexão com o SIP falha', async () => {
    mockCreateOracleSession.mockRejectedValueOnce(new Error('Usuário ou senha inválidos'));

    render(
      <MiniSheetsSipDialog
        initialTargetCell="A1"
        onExecuteInsert={jest.fn()}
        onClose={jest.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('sip-username-input'), { target: { value: 'invalido' } });
    fireEvent.change(screen.getByTestId('sip-password-input'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByTestId('sip-connect-button'));

    await waitFor(() => {
      expect(screen.getByTestId('sip-connection-error')).toHaveTextContent('Usuário ou senha inválidos');
      expect(screen.getByTestId('sip-password-input')).toHaveValue('');
    });
  });

  it('renderiza o editor SQL e permite desconectar quando conectado', async () => {
    const onConnectionChange = jest.fn();

    render(
      <MiniSheetsSipDialog
        isConnected={true}
        initialTargetCell="B2"
        currentSelectionAddress="C5"
        onConnectionChange={onConnectionChange}
        onExecuteInsert={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByTestId('sip-status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('sip-sql-editor')).toBeInTheDocument();
    expect(screen.getByTestId('sip-max-rows')).toHaveValue(200);
    expect(screen.getByTestId('sip-target-cell')).toHaveValue('B2');
    expect(screen.getByTestId('sip-include-headers')).toBeChecked();

    // Clicar em usar seleção
    fireEvent.click(screen.getByTestId('sip-use-selection-target'));
    expect(screen.getByTestId('sip-target-cell')).toHaveValue('C5');

    // Desconectar
    fireEvent.click(screen.getByTestId('sip-disconnect-button'));
    await waitFor(() => {
      expect(mockCloseOracleSession).toHaveBeenCalledWith();
      expect(onConnectionChange).toHaveBeenCalledWith(false);
    });
  });

  it('limpa o SQL ao clicar no botão Limpar', () => {
    render(
      <MiniSheetsSipDialog
        isConnected={true}
        initialTargetCell="A1"
        onExecuteInsert={jest.fn()}
        onClose={jest.fn()}
      />
    );

    const editor = screen.getByTestId('sip-sql-editor') as HTMLTextAreaElement;
    expect(editor.value.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('sip-clear-button'));
    expect(editor.value).toBe('');
  });

  it('executa a consulta SQL e chama onExecuteInsert com os dados retornados', async () => {
    const onExecuteInsert = jest.fn();
    const mockResponse = {
      rows: [
        { TS: '2026-08-26 12:00', PIVALUE: 42.5, STATUS: 0 },
        { TS: '2026-08-26 12:05', PIVALUE: 43.1, STATUS: 0 },
      ],
      row_count: 2,
      max_rows: 200,
    };
    mockRunOracleQuery.mockResolvedValueOnce(mockResponse);

    render(
      <MiniSheetsSipDialog
        isConnected={true}
        initialTargetCell="A1"
        onExecuteInsert={onExecuteInsert}
        onClose={jest.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('sip-sql-editor'), {
      target: { value: 'SELECT TS, PIVALUE FROM TABLE' },
    });
    fireEvent.change(screen.getByTestId('sip-target-cell'), {
      target: { value: 'B2' },
    });
    fireEvent.change(screen.getByTestId('sip-max-rows'), {
      target: { value: '50' },
    });

    fireEvent.click(screen.getByTestId('sip-execute-button'));

    await waitFor(() => {
      expect(mockRunOracleQuery).toHaveBeenCalledWith(expect.objectContaining({
        sql: 'SELECT TS, PIVALUE FROM TABLE',
        max_rows: 50,
      }));
      expect(onExecuteInsert).toHaveBeenCalledWith(
        mockResponse,
        'B2',
        true,
        'SELECT TS, PIVALUE FROM TABLE',
        50
      );
      expect(screen.getByTestId('sip-execution-success')).toHaveTextContent('2 linhas inseridas a partir de B2');
    });
  });

  it('exibe erro se a consulta SQL falhar', async () => {
    mockRunOracleQuery.mockRejectedValueOnce(new Error('ORA-00942: tabela inexistente'));

    render(
      <MiniSheetsSipDialog
        isConnected={true}
        initialTargetCell="A1"
        onExecuteInsert={jest.fn()}
        onClose={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('sip-execute-button'));

    await waitFor(() => {
      expect(screen.getByTestId('sip-execution-error')).toHaveTextContent('ORA-00942: tabela inexistente');
    });
  });

  it('atualiza o sql e dispara onSqlChange sem persistir rascunho no localStorage', () => {
    const onSqlChange = jest.fn();
    render(
      <MiniSheetsSipDialog
        isConnected={true}
        initialTargetCell="A1"
        onSqlChange={onSqlChange}
        onExecuteInsert={jest.fn()}
        onClose={jest.fn()}
      />
    );

    const textarea = screen.getByTestId('sip-sql-editor');
    fireEvent.change(textarea, { target: { value: 'SELECT 1 FROM DUAL' } });

    expect(onSqlChange).toHaveBeenCalledWith('SELECT 1 FROM DUAL');
    expect(localStorage.getItem('pims_vision_minisheets_sip_sql')).toBeNull();
  });
});
