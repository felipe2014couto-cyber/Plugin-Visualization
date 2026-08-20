import React, { useState, useEffect } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { SqlConnectionForm } from './SqlConnectionForm';
import { SqlEditor } from './SqlEditor';
import { 
  createOracleSession, 
  closeOracleSession, 
  runOracleQuery, 
  type OracleConnectParams, 
  type OracleQueryResponse 
} from './oracleApi';

interface SqlQueryPanelProps {
  onResultChange?: (result: OracleQueryResponse, sql: string) => void;
  sqlToLoad?: string;
}

export function SqlQueryPanel({ onResultChange, sqlToLoad }: SqlQueryPanelProps) {
  const styles = useStyles2(getStyles);
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>();
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string>();
  const [lastResult, setLastResult] = useState<OracleQueryResponse | null>(null);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (sessionId) {
        closeOracleSession(sessionId);
      }
    };
  }, [sessionId]);

  const handleConnect = async (params: OracleConnectParams) => {
    setIsConnecting(true);
    setConnectionError(undefined);
    try {
      const result = await createOracleSession(params);
      setSessionId(result.session_id);
    } catch (err: any) {
      setConnectionError(err.message || 'Falha ao conectar ao banco de dados');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (sessionId) {
      await closeOracleSession(sessionId);
    }
    setSessionId(null);
    setExecutionError(undefined);
  };

  const handleExecute = async (sql: string, maxRows: number) => {
    if (!sessionId) {
      return null;
    }
    
    setIsExecuting(true);
    setExecutionError(undefined);
    
    try {
      const result = await runOracleQuery({
        session_id: sessionId,
        sql,
        max_rows: maxRows
      });
      setLastResult(result);
      onResultChange?.(result, sql);
      return result;
    } catch (err: any) {
      setExecutionError(err.message || 'Falha ao executar consulta');
      return null;
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className={styles.container}>
      {!sessionId ? (
        <SqlConnectionForm 
          onConnect={handleConnect} 
          isConnecting={isConnecting} 
          error={connectionError} 
        />
      ) : (
        <SqlEditor 
          onExecute={handleExecute}
          onDisconnect={handleDisconnect}
          isExecuting={isExecuting}
          error={executionError}
          lastResult={lastResult}
          showResult={false}
          sqlToLoad={sqlToLoad}
        />
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    color: var(--text-primary);
    background-color: var(--surface-primary);
  `,
});
