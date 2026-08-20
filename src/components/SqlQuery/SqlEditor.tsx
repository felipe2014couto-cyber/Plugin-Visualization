import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon, Button, Input, Field } from '@grafana/ui';
import { SqlResultTable } from './SqlResultTable';
import type { OracleQueryResponse } from './oracleApi';

interface SqlEditorProps {
  onExecute: (sql: string, maxRows: number) => Promise<OracleQueryResponse | null>;
  onDisconnect: () => void;
  isExecuting: boolean;
  error?: string;
  lastResult: OracleQueryResponse | null;
}

export function SqlEditor({ onExecute, onDisconnect, isExecuting, error, lastResult }: SqlEditorProps) {
  const styles = useStyles2(getStyles);
  
  const [sql, setSql] = useState('');
  const [maxRows, setMaxRows] = useState(200);
  
  const handleExecute = async () => {
    if (!sql.trim() || isExecuting) return;
    await onExecute(sql, maxRows);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Icon name="database" />
          <span className={styles.connectionStatus}>Conectado ao Banco de Dados</span>
          <Button variant="destructive" size="sm" onClick={onDisconnect} icon="signout" fill="text">
            Desconectar
          </Button>
        </div>
      </div>
      
      <div className={styles.editorArea}>
        <textarea
          className={styles.textarea}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua consulta SQL aqui (Apenas SELECT / WITH)...&#10;Pressione Ctrl+Enter para executar."
          spellCheck={false}
          disabled={isExecuting}
        />
        
        <div className={styles.editorControls}>
          <div className={styles.limitControl}>
            <Field label="Limite de linhas" style={{ marginBottom: 0 }}>
              <Input
                type="number"
                min={1}
                max={2000}
                value={maxRows}
                onChange={(e) => setMaxRows(parseInt(e.currentTarget.value, 10) || 200)}
                width={15}
                disabled={isExecuting}
              />
            </Field>
          </div>
          
          <div className={styles.actionButtons}>
            <Button variant="secondary" onClick={() => setSql('')} disabled={isExecuting || !sql}>
              Limpar
            </Button>
            <Button 
              variant="primary" 
              onClick={handleExecute} 
              disabled={isExecuting || !sql.trim()}
              icon="play"
            >
              {isExecuting ? 'Executando...' : 'Executar (Ctrl+Enter)'}
            </Button>
          </div>
        </div>
        
        {error && (
          <div className={styles.errorAlert}>
            <Icon name="exclamation-triangle" />
            <span>{error}</span>
          </div>
        )}
      </div>
      
      <div className={styles.resultArea}>
        <SqlResultTable result={lastResult} isLoading={isExecuting} />
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  `,
  toolbar: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ${theme.spacing(1)} ${theme.spacing(2)};
    background: ${theme.colors.background.secondary};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  toolbarLeft: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(2)};
  `,
  connectionStatus: css`
    color: ${theme.colors.success.text};
    font-size: ${theme.typography.size.sm};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  editorArea: css`
    display: flex;
    flex-direction: column;
    padding: ${theme.spacing(2)};
    border-bottom: 1px solid ${theme.colors.border.weak};
  `,
  textarea: css`
    width: 100%;
    min-height: 150px;
    background-color: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.borderRadius(1)};
    padding: ${theme.spacing(1)};
    color: ${theme.colors.text.primary};
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 14px;
    resize: vertical;
    margin-bottom: ${theme.spacing(2)};
    
    &:focus {
      outline: 2px solid ${theme.colors.primary.border};
      outline-offset: -1px;
    }
    
    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  `,
  editorControls: css`
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  `,
  limitControl: css`
    display: flex;
    align-items: center;
  `,
  actionButtons: css`
    display: flex;
    gap: ${theme.spacing(1)};
  `,
  errorAlert: css`
    background-color: ${theme.colors.error.transparent};
    color: ${theme.colors.error.text};
    padding: ${theme.spacing(2)};
    border-radius: ${theme.shape.borderRadius(1)};
    border-left: 4px solid ${theme.colors.error.main};
    margin-top: ${theme.spacing(2)};
    display: flex;
    align-items: flex-start;
    gap: ${theme.spacing(1)};
    font-size: ${theme.typography.size.sm};
  `,
  resultArea: css`
    flex: 1;
    min-height: 0;
    padding: ${theme.spacing(2)};
    background: ${theme.colors.background.primary};
  `,
});
