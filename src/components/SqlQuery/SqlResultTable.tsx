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
    if (!result || !result.rows || result.rows.length === 0) return [];
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
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.borderRadius(1)};
    background: ${theme.colors.background.primary};
  `,
  emptyState: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    color: ${theme.colors.text.secondary};
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
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
    background: ${theme.colors.background.secondary};
    border-bottom: 1px solid ${theme.colors.border.weak};
    font-size: ${theme.typography.size.sm};
    color: ${theme.colors.text.secondary};
  `,
  warningText: css`
    color: ${theme.colors.warning.text};
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
    border-collapse: separate;
    border-spacing: 0;
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: 13px;
    
    th, td {
      padding: ${theme.spacing(1)} ${theme.spacing(2)};
      border-bottom: 1px solid ${theme.colors.border.weak};
      border-right: 1px solid ${theme.colors.border.weak};
      white-space: nowrap;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      
      &:last-child {
        border-right: none;
      }
    }
    
    th {
      background: ${theme.colors.background.secondary};
      position: sticky;
      top: 0;
      z-index: 1;
      border-bottom: 1px solid ${theme.colors.border.medium};
      text-align: left;
      font-weight: ${theme.typography.fontWeightMedium};
      color: ${theme.colors.text.primary};
    }
    
    tbody tr:hover {
      background: ${theme.colors.action.hover};
    }
  `,
  rowNumHeader: css`
    width: 40px;
    text-align: center !important;
  `,
  rowNumCell: css`
    text-align: center;
    color: ${theme.colors.text.disabled};
    background: ${theme.colors.background.secondary};
    position: sticky;
    left: 0;
    z-index: 0;
  `,
  nullCell: css`
    color: ${theme.colors.text.disabled};
    font-style: italic;
  `,
  numberCell: css`
    text-align: right;
  `,
});
