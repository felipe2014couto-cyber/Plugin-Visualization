import React, { useRef, useState, useEffect } from 'react';
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
  type OracleQueryResponse,
  OracleApiError,
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
  
  const [isConnected, setIsConnected] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
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

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestControllerRef.current?.abort();
    };
  }, []);

  const handleConnect = async (params: OracleConnectParams) => {
    setIsConnecting(true);
    setConnectionError(undefined);
    try {
      requestControllerRef.current?.abort();
      requestControllerRef.current = new AbortController();
      await createOracleSession(params, requestControllerRef.current.signal);
      if (mountedRef.current) setIsConnected(true);
    } catch (err: any) {
      if (mountedRef.current) {
        const msg = typeof err?.message === 'string' && err.message !== '[object Object]'
          ? err.message
          : (typeof err === 'string' ? err : 'Falha ao conectar ao banco de dados');
        setConnectionError(msg);
      }
    } finally {
      if (mountedRef.current) setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    requestControllerRef.current?.abort();
    await closeOracleSession();
    setIsConnected(false);
    setExecutionError(undefined);
  };

  const handleExecute = async (sql: string, maxRows: number, params?: Record<string, any>) => {
    if (!isConnected) {
      return null;
    }
    
    setIsExecuting(true);
    setExecutionError(undefined);
    
    try {
      requestControllerRef.current?.abort();
      requestControllerRef.current = new AbortController();
      const result = await runOracleQuery({
        sql,
        max_rows: maxRows,
        params,
        signal: requestControllerRef.current.signal,
      });
      if (!mountedRef.current) return null;
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
      if (!mountedRef.current) return null;
      if (err instanceof OracleApiError && err.code === 'SIP_SESSION_EXPIRED') {
        setIsConnected(false);
      }
      setExecutionError(err.message || 'Falha ao executar consulta');
      return null;
    } finally {
      if (mountedRef.current) setIsExecuting(false);
    }
  };

  return (
    <div className={styles.container}>
      {!isConnected ? (
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
