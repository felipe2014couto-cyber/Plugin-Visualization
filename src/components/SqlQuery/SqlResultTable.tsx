import React, { Suspense, useMemo, useState } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon } from '@grafana/ui';
import type { OracleQueryResponse } from './oracleApi';
import type { SqlTableProperties } from '../../display/createSqlTable';

// Recharts representa a maior dependencia do bundle. Ele so e necessario
// quando uma consulta SQL e exibida como grafico, portanto fica em um chunk
// separado e nao penaliza a abertura normal dos displays PI.
const SqlChartRender = React.lazy(async () => {
  const module = await import('./SqlChartRender');
  return { default: module.SqlChartRender };
});

interface SqlResultTableProps {
  result: OracleQueryResponse | null;
  isLoading: boolean;
  properties?: SqlTableProperties;
}

export function SqlResultTable({ result, isLoading, properties }: SqlResultTableProps) {
  const styles = useStyles2(getStyles);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  const allColumns = useMemo(() => {
    if (!result || !result.rows || result.rows.length === 0) {
      return [];
    }
    return Object.keys(result.rows[0]);
  }, [result]);

  // Filter columns if tableVisibleCols is set
  const columns = useMemo(() => {
    if (!properties?.tableVisibleCols || properties.tableVisibleCols === 'Todas') {
      return allColumns;
    }
    const filtered = allColumns.filter((c) => c === properties.tableVisibleCols);
    return filtered.length > 0 ? filtered : allColumns;
  }, [allColumns, properties?.tableVisibleCols]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!result?.rows) return [];
    let list = [...result.rows];

    // Filter by search term if tableColumnFilters is enabled
    if (properties?.tableColumnFilters && searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(term))
      );
    }

    // Sort by column
    const sortCol = typeof properties?.tableSortBy === 'string' ? properties.tableSortBy : undefined;
    if (sortCol && columns.includes(sortCol)) {
      const isAsc = properties?.tableOrder !== 'Decrescente';
      list.sort((a, b) => {
        const valA = (a as any)[sortCol];
        const valB = (b as any)[sortCol];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return isAsc ? valA - valB : valB - valA;
        }
        return isAsc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return list;
  }, [result?.rows, properties?.tableColumnFilters, searchTerm, properties?.tableSortBy, properties?.tableOrder, columns]);

  // Table pagination
  const pageSize = Number(properties?.tableRowsPerPage) || 25;
  const totalPages = Math.ceil(sortedRows.length / pageSize);

  const paginatedRows = useMemo(() => {
    if (totalPages <= 1) return sortedRows;
    const start = currentPage * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, pageSize, currentPage, totalPages]);

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
        <div className={styles.tableFlexWrapper}>
          {properties?.tableColumnFilters && (
            <div className={styles.filterRow}>
              <Icon name="search" />
              <input
                type="text"
                className={styles.filterInput}
                placeholder="Filtrar dados da tabela..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(0);
                }}
              />
            </div>
          )}

          <div className={styles.tableWrapper}>
            <table className={styles.table} style={{ tableLayout: properties?.tableAdjustWidth ? 'auto' : undefined }}>
              <thead>
                <tr>
                  <th className={styles.rowNumHeader}>#</th>
                  {columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, rowIndex) => {
                  const globalIndex = currentPage * pageSize + rowIndex + 1;
                  return (
                    <tr key={rowIndex}>
                      <td className={styles.rowNumCell}>{globalIndex}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button 
                className={styles.pageButton} 
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                title="Página Anterior"
              >
                &#9664;
              </button>
              <div className={styles.pageInfo}>
                <span>{pageSize} itens (Pág {currentPage + 1}/{totalPages})</span>
              </div>
              <button 
                className={styles.pageButton} 
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                title="Próxima Página"
              >
                &#9654;
              </button>
            </div>
          )}
        </div>
      ) : (
        <Suspense fallback={<div>Carregando gráfico...</div>}>
          <SqlChartRender
            data={result.rows}
            xAxis={xAxis}
            yAxes={yAxes}
            type={viewMode}
            properties={properties}
          />
        </Suspense>
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
  } else if (properties.style === 'dark') {
    vars['--sql-header-bg'] = '#1f2937';
    vars['--sql-row-bg'] = '#111827';
    vars['--sql-text-color'] = '#f3f4f6';
    vars['--sql-border-color'] = '#374151';
    vars['--sql-row-hover'] = '#1f2937';
  } else {
    // auto / theme-aware (default): follow the active Grafana theme variables
    vars['--sql-header-bg'] = 'var(--panel-header-bg, var(--surface-elevated))';
    vars['--sql-row-bg'] = 'var(--surface-primary)';
    vars['--sql-text-color'] = 'var(--text-primary)';
    vars['--sql-border-color'] = 'var(--border-color)';
    vars['--sql-row-hover'] = 'var(--button-hover, var(--selection-bg))';
  }

  return vars;
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    font-size: var(--sql-font-size, 13px);
    color: var(--sql-text-color, var(--text-primary));
    background: var(--sql-row-bg, var(--surface-primary));
    overflow: hidden;
  `,
  tableFlexWrapper: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  `,
  filterRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--sql-header-bg, var(--surface-elevated));
    border-bottom: 1px solid var(--sql-border-color, var(--border-color));
    color: var(--sql-text-color, var(--text-secondary));
  `,
  filterInput: css`
    background: transparent;
    border: none;
    outline: none;
    color: var(--sql-text-color, var(--text-primary));
    font-size: 12px;
    width: 100%;
    &::placeholder {
      color: var(--text-muted);
    }
  `,
  tableWrapper: css`
    flex: 1;
    overflow: auto;
  `,
  table: css`
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    
    th {
      position: sticky;
      top: 0;
      background: var(--sql-header-bg, var(--surface-elevated));
      color: var(--sql-text-color, var(--text-primary));
      font-weight: ${theme.typography.fontWeightMedium};
      padding: ${theme.spacing(1, 1.5)};
      border-bottom: 2px solid var(--sql-border-color, var(--border-color));
      white-space: nowrap;
      text-align: left !important;
      z-index: 1;
    }
    
    td {
      padding: ${theme.spacing(0.75, 1.5)};
      border-bottom: 1px solid var(--sql-border-color, var(--border-color));
      color: var(--sql-text-color, var(--text-primary));
      white-space: nowrap;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left !important;
    }
    
    tr:hover td {
      background-color: var(--sql-row-hover, var(--surface-secondary));
    }
  `,
  rowNumHeader: css`
    width: 40px;
    text-align: center;
    color: var(--text-secondary);
  `,
  rowNumCell: css`
    width: 40px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 11px;
    user-select: none;
  `,
  nullCell: css`
    color: var(--text-muted);
    font-style: italic;
    text-align: left;
  `,
  numberCell: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    text-align: left !important;
  `,
  pagination: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 38px;
    flex-shrink: 0;
    border-top: 1px solid var(--sql-border-color, var(--border-color));
    color: var(--sql-text-color, var(--text-primary));
    padding-top: 4px;
    background: var(--sql-header-bg, var(--surface-elevated));
  `,
  pageButton: css`
    background: var(--button-bg, var(--surface-secondary));
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--sql-text-color, var(--text-primary));
    width: 36px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
    
    &:hover:not(:disabled) {
      background: var(--button-hover, var(--selection-bg));
      border-color: var(--accent);
    }
    
    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  `,
  pageInfo: css`
    background: transparent;
    border: 1px solid var(--sql-border-color, var(--border-color));
    border-radius: 6px;
    color: var(--sql-text-color, var(--text-primary));
    padding: 0 10px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  `,
  emptyState: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    padding: ${theme.spacing(4)};
    color: var(--text-secondary);
    text-align: center;
    gap: ${theme.spacing(2)};
  `,
  emptyIcon: css`
    color: var(--text-muted);
  `,
});
