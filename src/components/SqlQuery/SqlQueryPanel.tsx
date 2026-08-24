import React, { useState, useEffect } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { SqlConnectionForm } from './SqlConnectionForm';
import { SqlEditor, type SqlConfig } from './SqlEditor';
import { 
  createOracleSession, 
  closeOracleSession, 
  runOracleQuery, 
  type OracleConnectParams, 
  type OracleQueryResponse 
} from './oracleApi';

interface SqlQueryPanelProps {
  onResultChange?: (result: OracleQueryResponse, sql: string, config?: SqlConfig) => void;
  onApplyToDashboard?: (config: SqlConfig) => void;
  onConfigChange?: (config: SqlConfig) => void;
  sqlToLoad?: string;
  initialConfig?: SqlConfig;
}

export function SqlQueryPanel({ onResultChange, onApplyToDashboard, onConfigChange, sqlToLoad, initialConfig }: SqlQueryPanelProps) {
  const styles = useStyles2(getStyles);
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>();
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string>();
  const [lastResult, setLastResult] = useState<OracleQueryResponse | null>(null);
  const [currentConfig, setCurrentConfig] = useState<SqlConfig | undefined>(initialConfig);

  const handleConfigChange = (cfg: SqlConfig) => {
    setCurrentConfig(cfg);
    onConfigChange?.(cfg);
  };

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

  const handleExecute = async (sql: string, maxRows: number, params?: Record<string, any>) => {
    if (!sessionId) {
      return null;
    }
    
    setIsExecuting(true);
    setExecutionError(undefined);
    
    try {
      const result = await runOracleQuery({
        session_id: sessionId,
        sql,
        max_rows: maxRows,
        params
      });
      setLastResult(result);

      // Auto-resolve axes from result columns immediately
      let autoX = currentConfig?.xAxis;
      let autoY = currentConfig?.yAxes?.[0];
      if (result.rows && result.rows.length > 0) {
        const cols = Object.keys(result.rows[0]);
        if (cols.length > 0) {
          const timeCandidate = cols.find((c) => {
            const lower = c.toLowerCase();
            return lower === 'ts' || lower === 'time' || lower === 'data' || lower.includes('date') || lower.includes('dth') || lower.includes('hora') || lower.includes('tempo');
          }) || cols[0];

          const valueCandidate = cols.find((c) => {
            const lower = c.toLowerCase();
            return lower === 'pi_value' || lower === 'valor' || lower === 'val' || lower === 'value' || lower === 'y' || lower.includes('medida') || lower.includes('total') || lower.includes('qtde');
          }) || cols.find((c) => c !== timeCandidate && typeof result.rows[0][c] === 'number') || (cols.length > 1 ? cols[1] : cols[0]);

          autoX = (!autoX || !cols.includes(autoX)) ? timeCandidate : autoX;
          autoY = (!autoY || !cols.includes(autoY)) ? valueCandidate : autoY;
        }
      }

      const effectiveConfig: SqlConfig = {
        viewMode: currentConfig?.viewMode ?? 'xy',
        ...(currentConfig || {}),
        xAxis: autoX,
        yAxes: autoY ? [autoY] : [],
      };

      onResultChange?.(result, sql, effectiveConfig);
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
          onConfigChange={handleConfigChange}
          onApplyToDashboard={onApplyToDashboard}
          isExecuting={isExecuting}
          error={executionError}
          lastResult={lastResult}
          showResult={true}
          sqlToLoad={sqlToLoad}
          initialConfig={initialConfig}
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
