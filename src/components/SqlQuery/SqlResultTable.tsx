import React, { useMemo } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon } from '@grafana/ui';
import { SqlChartRender } from './SqlChartRender';
import type { OracleQueryResponse } from './oracleApi';
import type { SqlTableProperties } from '../../display/createSqlTable';

interface SqlResultTableProps {
  result: OracleQueryResponse | null;
  isLoading: boolean;
  properties?: SqlTableProperties;
}

export function SqlResultTable({ result, isLoading, properties }: SqlResultTableProps) {
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

  const styleObj = getDynamicStyles(properties);

  const viewMode = properties?.viewMode ?? 'table';
  const xAxis = properties?.xAxis;
  const yAxes = properties?.yAxes ?? [];

  return (
    <div className={styles.container} style={styleObj}>
      {viewMode === 'table' ? (
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
      ) : (
        <SqlChartRender 
          data={result.rows}
          xAxis={xAxis}
          yAxes={yAxes}
          type={viewMode}
          properties={properties}
        />
      )}
    </div>
  );
}

export function getDynamicStyles(properties?: SqlTableProperties): React.CSSProperties {
  if (!properties) return {};

  const vars: any = {};
  
  if (properties.fontSize) {
    vars['--sql-font-size'] = `${properties.fontSize}px`;
  }
  
  if (properties.style === 'custom') {
    if (properties.customHeaderColor) vars['--sql-header-bg'] = properties.customHeaderColor;
    if (properties.customRowColor) vars['--sql-row-bg'] = properties.customRowColor;
    if (properties.customTextColor) vars['--sql-text-color'] = properties.customTextColor;
    if (properties.customBorderColor) vars['--sql-border-color'] = properties.customBorderColor;
  } else if (properties.style === 'light') {
    vars['--sql-header-bg'] = '#e5e7eb';
    vars['--sql-row-bg'] = '#ffffff';
    vars['--sql-text-color'] = '#111827';
    vars['--sql-border-color'] = '#d1d5db';
    vars['--sql-row-hover'] = '#f3f4f6';
  } else if (properties.style === 'striped') {
    vars['--sql-header-bg'] = '#3f3f46';
    vars['--sql-row-bg'] = '#52525b';
    vars['--sql-row-alt-bg'] = '#3f3f46';
    vars['--sql-text-color'] = '#f4f4f5';
    vars['--sql-border-color'] = '#27272a';
    vars['--sql-row-hover'] = '#71717a';
  } else {
    // dark (default)
    vars['--sql-header-bg'] = '#1f2937';
    vars['--sql-row-bg'] = '#111827';
    vars['--sql-text-color'] = '#f3f4f6';
    vars['--sql-border-color'] = '#374151';
    vars['--sql-row-hover'] = '#374151';
  }
  
  return vars;
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--sql-text-color, var(--text-primary));
    border: 1px solid var(--sql-border-color, var(--border-color));
    border-radius: ${theme.shape.borderRadius(1)};
    background: var(--sql-row-bg, var(--surface-primary));
  `,
  emptyState: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    color: var(--sql-text-color, var(--text-secondary));
    background: var(--sql-row-bg, var(--surface-primary));
    border: 1px solid var(--sql-border-color, var(--border-color));
    border-radius: ${theme.shape.borderRadius(1)};
    padding: ${theme.spacing(4)};
    text-align: center;
  `,
  emptyIcon: css`
    margin-bottom: ${theme.spacing(2)};
    opacity: 0.5;
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
    font-size: var(--sql-font-size, 13px);
    
    th, td {
      padding: ${theme.spacing(1)} ${theme.spacing(2)};
      color: var(--sql-text-color, var(--text-primary));
      border-bottom: 1px solid var(--sql-border-color, var(--border-color));
      border-right: 1px solid var(--sql-border-color, var(--border-color));
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
      background: var(--sql-header-bg, var(--surface-secondary));
      position: sticky;
      top: 0;
      z-index: 1;
      border-bottom: 1px solid var(--sql-border-color, var(--border-color));
      text-align: left;
      font-weight: ${theme.typography.fontWeightMedium};
      color: var(--sql-text-color, var(--text-primary));
    }
    
    tbody tr {
      background: var(--sql-row-bg, transparent);
    }
    tbody tr:nth-child(even) {
      background: var(--sql-row-alt-bg, var(--sql-row-bg, transparent));
    }
    tbody tr:hover {
      background: var(--sql-row-hover, var(--button-hover));
    }
  `,
  rowNumHeader: css`
    width: 40px;
    text-align: center !important;
  `,
  rowNumCell: css`
    text-align: center;
    color: var(--sql-text-color, var(--text-muted));
    background: var(--sql-header-bg, var(--surface-secondary));
    position: sticky;
    left: 0;
    z-index: 0;
  `,
  nullCell: css`
    color: var(--sql-text-color, var(--text-muted));
    font-style: italic;
    opacity: 0.6;
  `,
  numberCell: css`
    text-align: right;
  `,
});
