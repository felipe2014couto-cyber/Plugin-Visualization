import React, { useMemo } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon } from '@grafana/ui';
import type { OracleQueryResponse } from './oracleApi';

interface SqlResultTableProps {
  result: OracleQueryResponse | null;
  isLoading: boolean;
}

export function SqlResultTable({ result, isLoading }: SqlResultTableProps) {
  const styles = useStyles2(getStyles);

  const columns = useMemo(() => {
    if (!result || !result.rows || result.rows.length === 0) {
      return [];
    }
    return Object.keys(result.rows[0]);
  }, [result]);

  if (isLoading) {
    return (
      <div className={styles.emptyState}>
        <Icon name="sync" className="fa-spin" size="xl" />
        <p>Executando consulta...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={styles.emptyState}>
        <Icon name="table" size="xl" className={styles.emptyIcon} />
        <p>Nenhum resultado. Execute uma consulta para visualizar os dados.</p>
      </div>
    );
  }

  if (result.rows.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Icon name="info-circle" size="xl" className={styles.emptyIcon} />
        <p>A consulta foi executada com sucesso, mas não retornou nenhuma linha.</p>
      </div>
    );
  }

  const reachedMaxRows = result.row_count >= result.max_rows;

  return (
    <div className={styles.container}>
      <div className={styles.statusBar}>
        <span>
          Retornou <strong>{result.row_count}</strong> linhas.
        </span>
        {reachedMaxRows && (
          <span className={styles.warningText}>
            <Icon name="exclamation-triangle" /> Limite de {result.max_rows} linhas atingido.
          </span>
        )}
      </div>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.rowNumHeader}>#</th>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className={styles.rowNumCell}>{rowIndex + 1}</td>
                {columns.map((col) => {
                  const val = row[col];
                  const displayVal = val === null ? 'NULL' : String(val);
                  const isNull = val === null;
                  const isNumber = typeof val === 'number';
                  
                  return (
                    <td 
                      key={col} 
                      className={cx(
                        isNull && styles.nullCell, 
                        isNumber && styles.numberCell
                      )}
                      title={displayVal}
                    >
                      {displayVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: ${theme.shape.borderRadius(1)};
    background: var(--surface-primary);
  `,
  emptyState: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    color: var(--text-secondary);
    background: var(--surface-primary);
    border: 1px solid var(--border-color);
    border-radius: ${theme.shape.borderRadius(1)};
    padding: ${theme.spacing(4)};
    text-align: center;
  `,
  emptyIcon: css`
    margin-bottom: ${theme.spacing(2)};
    opacity: 0.5;
  `,
  statusBar: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ${theme.spacing(1)} ${theme.spacing(2)};
    background: var(--surface-secondary);
    border-bottom: 1px solid var(--border-color);
    font-size: ${theme.typography.size.sm};
    color: var(--text-secondary);
  `,
  warningText: css`
    color: var(--warning, #f59e0b);
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.5)};
  `,
  tableWrapper: css`
    flex: 1;
    overflow: auto;
    min-height: 0;
  `,
  table: css`
    width: 100%;
    min-width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 13px;
    
    th, td {
      padding: ${theme.spacing(1)} ${theme.spacing(2)};
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      white-space: normal;
      max-width: none;
      overflow-wrap: anywhere;
      word-break: break-word;
      vertical-align: top;
      overflow: hidden;
      text-overflow: ellipsis;
      
      &:last-child {
        border-right: none;
      }
    }
    
    th {
      background: var(--surface-secondary);
      position: sticky;
      top: 0;
      z-index: 1;
      border-bottom: 1px solid var(--border-color);
      text-align: left;
      font-weight: ${theme.typography.fontWeightMedium};
      color: var(--text-primary);
    }
    
    tbody tr:hover {
      background: var(--button-hover);
    }
  `,
  rowNumHeader: css`
    width: 40px;
    text-align: center !important;
  `,
  rowNumCell: css`
    text-align: center;
    color: var(--text-muted);
    background: var(--surface-secondary);
    position: sticky;
    left: 0;
    z-index: 0;
  `,
  nullCell: css`
    color: var(--text-muted);
    font-style: italic;
  `,
  numberCell: css`
    text-align: right;
  `,
});
