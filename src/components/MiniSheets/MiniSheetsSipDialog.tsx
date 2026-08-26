import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  createOracleSession,
  closeOracleSession,
  runOracleQuery,
  type OracleQueryResponse,
} from '../SqlQuery/oracleApi';
import { parseCellAddress, parseRangeAddresses } from './miniSheetFormula';

const DEFAULT_DSN = `(DESCRIPTION =
  (ADDRESS_LIST =
    (ADDRESS =
      (PROTOCOL = TCP)
      (HOST = 10.247.0.236)
      (PORT = 1521)
    )
  )
  (CONNECT_DATA =
    (SERVICE_NAME = po40)
  )
)`;
export const DEFAULT_SQL_TEMPLATE = `SELECT 
  HU.DTH_INIC_PROCE as TS,
  OEE.TEMPO_SETUP as PIVALUE,
  0 as status
FROM 
  ACEFCDSED.OEE_TEMPOS_POR_UM_OEE`;

export interface MiniSheetsSipDialogProps {
  embedded?: boolean;
  initialTargetCell: string;
  currentSelectionAddress?: string;
  sessionId?: string | null;
  onSessionIdChange?: (sessionId: string | null) => void;
  sql?: string;
  onSqlChange?: (sql: string) => void;
  maxRows?: number;
  onMaxRowsChange?: (maxRows: number) => void;
  includeHeaders?: boolean;
  onIncludeHeadersChange?: (includeHeaders: boolean) => void;
  onExecuteInsert: (
    result: OracleQueryResponse,
    targetAddress: string,
    includeHeaders: boolean,
    querySql?: string,
    queryMaxRows?: number
  ) => void;
  onClose: () => void;
}

export function MiniSheetsSipDialog({
  embedded = false,
  initialTargetCell,
  currentSelectionAddress,
  sessionId: externalSessionId,
  onSessionIdChange,
  sql: externalSql,
  onSqlChange,
  maxRows: externalMaxRows,
  onMaxRowsChange,
  includeHeaders: externalIncludeHeaders,
  onIncludeHeadersChange,
  onExecuteInsert,
  onClose,
}: MiniSheetsSipDialogProps) {
  const styles = useStyles2(getStyles);

  // Session state
  const [internalSessionId, setInternalSessionId] = useState<string | null>(externalSessionId ?? null);
  const activeSessionId = externalSessionId !== undefined ? externalSessionId : internalSessionId;

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>();

  // Query editor state
  const [sql, setSql] = useState<string>(externalSql !== undefined ? externalSql : DEFAULT_SQL_TEMPLATE);
  const [maxRows, setMaxRows] = useState<number>(externalMaxRows !== undefined ? externalMaxRows : 200);
  const [targetCell, setTargetCell] = useState(initialTargetCell || 'A1');
  const [includeHeaders, setIncludeHeaders] = useState<boolean>(externalIncludeHeaders !== undefined ? externalIncludeHeaders : true);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  useEffect(() => {
    if (externalSessionId !== undefined) {
      setInternalSessionId(externalSessionId);
    }
  }, [externalSessionId]);

  useEffect(() => {
    if (externalSql !== undefined) {
      setSql(externalSql);
    }
  }, [externalSql]);

  useEffect(() => {
    if (externalMaxRows !== undefined) {
      setMaxRows(externalMaxRows);
    }
  }, [externalMaxRows]);

  useEffect(() => {
    if (externalIncludeHeaders !== undefined) {
      setIncludeHeaders(externalIncludeHeaders);
    }
  }, [externalIncludeHeaders]);

  useEffect(() => {
    if (initialTargetCell) {
      setTargetCell(initialTargetCell);
    }
  }, [initialTargetCell]);

  const handleSqlChange = (newSql: string) => {
    setSql(newSql);
    onSqlChange?.(newSql);
  };

  const handleMaxRowsChange = (newMaxRows: number) => {
    setMaxRows(newMaxRows);
    onMaxRowsChange?.(newMaxRows);
  };

  const handleIncludeHeadersChange = (newHeaders: boolean) => {
    setIncludeHeaders(newHeaders);
    onIncludeHeadersChange?.(newHeaders);
  };

  const updateSession = (id: string | null) => {
    setInternalSessionId(id);
    onSessionIdChange?.(id);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      return;
    }

    setIsConnecting(true);
    setConnectionError(undefined);

    try {
      const result = await createOracleSession({
        dsn: DEFAULT_DSN,
        username: username.trim(),
        password,
      });
      updateSession(result.session_id);
    } catch (err: any) {
      setConnectionError(err?.message || 'Falha ao conectar ao banco SIP');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (activeSessionId) {
      await closeOracleSession(activeSessionId);
    }
    updateSession(null);
    setExecutionError(undefined);
    setSuccessMessage(undefined);
  };

  const handleExecute = async () => {
    if (!activeSessionId || !sql.trim() || isExecuting) {
      return;
    }

    setIsExecuting(true);
    setExecutionError(undefined);
    setSuccessMessage(undefined);

    try {
      const result = await runOracleQuery({
        session_id: activeSessionId,
        sql: sql.trim(),
        max_rows: Number(maxRows) || 200,
      });

      const effectiveTarget = targetCell.trim() || 'A1';
      onExecuteInsert(result, effectiveTarget, includeHeaders, sql.trim(), Number(maxRows) || 200);
      setSuccessMessage(
        `${result.row_count} ${result.row_count === 1 ? 'linha inserida' : 'linhas inseridas'} a partir de ${effectiveTarget}.`
      );
    } catch (err: any) {
      setExecutionError(err?.message || 'Erro ao executar consulta SQL');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClearSql = () => {
    handleSqlChange('');
    setExecutionError(undefined);
    setSuccessMessage(undefined);
  };

  const content = (
    <div
      className={embedded ? styles.embeddedDialog : styles.dialog}
      data-testid="mini-sheets-sip-dialog"
      role="dialog"
      aria-label="Consulta SIP (SQL)"
    >
      <header className={embedded ? styles.embeddedHeader : styles.header}>
        <div className={styles.headerTitleGroup}>
          <DatabaseIcon />
          <h2 className={styles.title}>Consulta SIP (SQL)</h2>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Fechar"
          data-testid="datalink-sip-close"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <div className={embedded ? styles.embeddedBody : styles.body}>
        {!activeSessionId ? (
          // LOGIN VIEW
          <form onSubmit={handleConnect} className={styles.loginForm} data-testid="sip-login-form">
            <div className={styles.loginHeader}>
              <div className={styles.loginIconWrapper}>
                <DatabaseIcon size={28} />
              </div>
              <h3 className={styles.loginTitle}>Conexão SIP</h3>
              <p className={styles.loginSubtitle}>
                Conecte-se com seu usuário do SIP para executar consultas na planilha.
              </p>
            </div>

            {connectionError && (
              <div className={styles.errorAlert} role="alert" data-testid="sip-connection-error">
                <AlertIcon />
                <span>{connectionError}</span>
              </div>
            )}

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="sip-username">
                Usuário
              </label>
              <input
                id="sip-username"
                className={styles.input}
                value={username}
                placeholder="usuario"
                autoComplete="off"
                required
                data-testid="sip-username-input"
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="sip-password">
                Senha
              </label>
              <input
                id="sip-password"
                type="password"
                className={styles.input}
                value={password}
                placeholder="senha"
                autoComplete="new-password"
                required
                data-testid="sip-password-input"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className={styles.loginActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isConnecting || !username.trim() || !password}
                data-testid="sip-connect-button"
              >
                {isConnecting ? 'Conectando ao SIP...' : 'Conectar ao SIP'}
              </button>
            </div>
          </form>
        ) : (
          // QUERY VIEW
          <>
            {/* Status Bar */}
            <div className={styles.statusBar} data-testid="sip-status-bar">
              <div className={styles.statusConnected}>
                <DatabaseIcon size={16} />
                <span className={styles.statusDot} />
                <span>Conectado ao SIP</span>
              </div>
              <button
                type="button"
                className={styles.disconnectButton}
                onClick={handleDisconnect}
                data-testid="sip-disconnect-button"
                title="Desconectar da sessão SIP"
              >
                <DisconnectIcon />
                <span>Desconectar</span>
              </button>
            </div>

            {/* Error or Success alerts */}
            {executionError && (
              <div className={styles.errorAlert} role="alert" data-testid="sip-execution-error">
                <AlertIcon />
                <span>{executionError}</span>
              </div>
            )}

            {successMessage && (
              <div className={styles.successAlert} role="status" data-testid="sip-execution-success">
                <CheckIcon />
                <span>{successMessage}</span>
              </div>
            )}

            {/* SQL Query Editor */}
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="sip-sql-editor">
                Instrução SQL
              </label>
              <textarea
                id="sip-sql-editor"
                className={styles.sqlTextarea}
                value={sql}
                rows={6}
                placeholder="SELECT ..."
                data-testid="sip-sql-editor"
                onChange={(e) => handleSqlChange(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleExecute();
                  }
                }}
              />
            </div>

            {/* Limit Rows & Output Cell */}
            <div className={styles.gridTwoCols}>
              <label className={styles.label} htmlFor="sip-max-rows">
                Limite de linhas
              </label>

              <div className={styles.labelWithAction}>
                <label className={styles.label} htmlFor="sip-target-cell">
                  Célula de saída
                </label>
                {currentSelectionAddress && (
                  <button
                    type="button"
                    className={styles.linkButton}
                    data-testid="sip-use-selection-target"
                    title={`Usar seleção atual (${currentSelectionAddress.split(':')[0]})`}
                    onClick={() => {
                      const parsed = parseRangeAddresses(currentSelectionAddress)[0] ?? parseCellAddress(currentSelectionAddress);
                      if (parsed) {
                        setTargetCell(currentSelectionAddress.split(':')[0]);
                      }
                    }}
                  >
                    Usar ({currentSelectionAddress.split(':')[0]})
                  </button>
                )}
              </div>

              <input
                id="sip-max-rows"
                type="number"
                min={1}
                max={50000}
                className={styles.input}
                value={maxRows}
                data-testid="sip-max-rows"
                onChange={(e) => handleMaxRowsChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />

              <input
                id="sip-target-cell"
                className={styles.input}
                value={targetCell}
                placeholder="Ex: A1"
                data-testid="sip-target-cell"
                onChange={(e) => setTargetCell(e.target.value.toUpperCase())}
              />
            </div>

            {/* Checkbox: Include column headers */}
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={includeHeaders}
                data-testid="sip-include-headers"
                onChange={(e) => handleIncludeHeadersChange(e.target.checked)}
              />
              <span>Incluir cabeçalhos das colunas na 1ª linha</span>
            </label>
          </>
        )}
      </div>

      {activeSessionId && (
        <footer className={embedded ? styles.embeddedFooter : styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleClearSql}
            data-testid="sip-clear-button"
          >
            Limpar
          </button>
          <div className={styles.footerRight}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isExecuting || !sql.trim()}
              data-testid="sip-execute-button"
              onClick={handleExecute}
            >
              <PlayIcon />
              <span>{isExecuting ? 'Executando...' : 'Executar (Ctrl+Enter)'}</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );

  if (embedded) {
    return <aside className={styles.embeddedShell}>{content}</aside>;
  }

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {content}
    </div>
  );
}

const getStyles = (_theme: GrafanaTheme2) => ({
  backdrop: css`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `,
  dialog: css`
    width: 480px;
    max-width: 95vw;
    background: var(--surface-primary, #111923);
    border: 1px solid var(--border-color, #2b394a);
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `,
  embeddedShell: css`
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--surface-primary, #111923);
    overflow: hidden;
  `,
  embeddedDialog: css`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    flex: 1 1 0%;
    overflow: hidden;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--assets-header-bg, #1e2837);
    border-bottom: 1px solid var(--border-color, #2b394a);
    color: var(--assets-header-text, #ffffff);
  `,
  embeddedHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--assets-header-bg, #1e2837);
    border-bottom: 1px solid var(--border-color, #2b394a);
    color: var(--assets-header-text, #ffffff);
    flex: 0 0 auto;
  `,
  headerTitleGroup: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: #5794f2;
  `,
  title: css`
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #ffffff);
  `,
  closeButton: css`
    background: transparent;
    border: none;
    color: var(--text-secondary, #aeb3bf);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 4px 6px;
    border-radius: 4px;
    &:hover {
      color: var(--text-primary, #ffffff);
      background: var(--button-hover, #223146);
    }
  `,
  body: css`
    padding: 16px;
    background: var(--surface-primary, #111923);
    color: var(--text-primary, #f1f2f5);
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 75vh;
    overflow-y: auto;
  `,
  embeddedBody: css`
    padding: 12px 14px;
    background: var(--surface-primary, #111923);
    color: var(--text-primary, #f1f2f5);
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  `,
  loginForm: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  loginHeader: css`
    text-align: center;
    padding: 8px 0 12px;
  `,
  loginIconWrapper: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(87, 148, 242, 0.12);
    color: #5794f2;
    margin-bottom: 8px;
  `,
  loginTitle: css`
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary, #ffffff);
  `,
  loginSubtitle: css`
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, #aeb3bf);
    line-height: 1.35;
  `,
  loginActions: css`
    display: flex;
    margin-top: 6px;
  `,
  statusBar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(115, 191, 105, 0.1);
    border: 1px solid rgba(115, 191, 105, 0.25);
    font-size: 12px;
  `,
  statusConnected: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
    color: var(--success, #73bf69);
  `,
  statusDot: css`
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success, #73bf69);
    box-shadow: 0 0 6px var(--success, #73bf69);
  `,
  disconnectButton: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 500;
    color: var(--danger, #f2495c);
    cursor: pointer;
    border-radius: 4px;
    &:hover {
      background: rgba(242, 73, 92, 0.12);
      text-decoration: underline;
    }
  `,
  errorAlert: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(242, 73, 92, 0.15);
    border: 1px solid var(--danger, #f2495c);
    color: var(--danger, #f2495c);
    font-size: 12px;
  `,
  successAlert: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    background: rgba(115, 191, 105, 0.15);
    border: 1px solid var(--success, #73bf69);
    color: var(--success, #73bf69);
    font-size: 12px;
  `,
  formRow: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  gridTwoCols: css`
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 4px;
    align-items: end;
  `,
  label: css`
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #aeb3bf);
    white-space: nowrap;
    line-height: 1.2;
  `,
  labelWithAction: css`
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
  `,
  linkButton: css`
    background: none;
    border: none;
    padding: 0;
    font-size: 10.5px;
    color: var(--accent, #d33b91);
    cursor: pointer;
    text-decoration: underline;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
    &:hover {
      color: var(--accent-hover, #ed62ad);
    }
  `,
  input: css`
    width: 100%;
    height: 30px;
    padding: 4px 8px;
    border: 1px solid var(--border-color, #2b394a);
    border-radius: 6px;
    background: var(--input-bg, #0b1219);
    color: var(--text-primary, #f1f2f5);
    font-size: 12px;
    box-sizing: border-box;
    outline: none;
    &:focus {
      border-color: var(--accent, #d33b91);
      box-shadow: 0 0 0 2px var(--focus-ring, rgba(211, 59, 145, 0.25));
    }
  `,
  sqlTextarea: css`
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border-color, #2b394a);
    border-radius: 6px;
    background: var(--input-bg, #0b1219);
    color: var(--text-primary, #f1f2f5);
    font-family: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
    font-size: 11.5px;
    line-height: 1.45;
    box-sizing: border-box;
    outline: none;
    resize: vertical;
    min-height: 90px;
    max-height: 220px;
    &:focus {
      border-color: var(--accent, #d33b91);
      box-shadow: 0 0 0 2px var(--focus-ring, rgba(211, 59, 145, 0.25));
    }
  `,
  checkboxLabel: css`
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-primary, #f1f2f5);
    cursor: pointer;
    user-select: none;
    & input {
      margin: 0;
      cursor: pointer;
    }
  `,
  footer: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--surface-secondary, #15202d);
    border-top: 1px solid var(--border-color, #2b394a);
  `,
  embeddedFooter: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--surface-secondary, #15202d);
    border-top: 1px solid var(--border-color, #2b394a);
    flex: 0 0 auto;
    margin-top: auto;
  `,
  footerRight: css`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  `,
  primaryButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: 6px;
    background: var(--accent, #9c1f77);
    color: var(--accent-contrast, #ffffff);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
    &:hover:not(:disabled) {
      background: var(--accent-hover, #b8288e);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
  secondaryButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border-color, #2b394a);
    border-radius: 6px;
    background: var(--button-bg, #1a2533);
    color: var(--text-primary, #f1f2f5);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    &:hover:not(:disabled) {
      background: var(--button-hover, #223146);
    }
  `,
});

function DatabaseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
