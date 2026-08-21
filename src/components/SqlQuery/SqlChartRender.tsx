import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import type { SqlTableProperties } from '../../display/createSqlTable';

export interface SqlChartRenderProps {
  data: Array<Record<string, any>>;
  xAxis: string | undefined;
  yAxes: string[];
  type: 'xy' | 'timeseries';
  properties?: SqlTableProperties;
}

// Generate some distinguishable colors for series
const COLORS = [
  '#3274D9', // Blue
  '#8F3BB8', // Purple
  '#38B2A6', // Teal
  '#F2CC0C', // Yellow
  '#E02F44', // Red
  '#FF780A', // Orange
  '#73BF69', // Green
  '#8E8E93', // Gray
];

export function SqlChartRender({ data, xAxis, yAxes, type, properties }: SqlChartRenderProps) {
  const styles = useStyles2(getStyles);
  const [currentPage, setCurrentPage] = useState(0);
  const [markerValue, setMarkerValue] = useState<any>(null);

  // Parse data for TimeSeries if needed
  const chartData = useMemo(() => {
    if (!xAxis || type !== 'timeseries') {
      return data;
    }
    
    // For timeseries, ensure X axis is sorted and parse dates if necessary
    const parsed = data.map(row => {
      let xVal = row[xAxis];
      if (typeof xVal === 'string') {
        const d = new Date(xVal);
        if (!isNaN(d.getTime())) {
          return { ...row, [xAxis]: d.getTime() };
        }
      }
      return row;
    });
    
    // Sort chronologically
    return parsed.sort((a, b) => {
      const valA = a[xAxis];
      const valB = b[xAxis];
      if (valA > valB) return 1;
      if (valA < valB) return -1;
      return 0;
    });
  }, [data, xAxis, type]);

  // Determinar se o Eixo Y deve ser de categoria (textos/estados discretos)
  const isCategoryY = useMemo(() => {
    if (chartData.length === 0 || yAxes.length === 0) return false;
    // Checar as primeiras linhas para ver se é string
    for (let i = 0; i < Math.min(10, chartData.length); i++) {
      const val = chartData[i][yAxes[0]];
      if (typeof val === 'string' && isNaN(Number(val))) {
        return true;
      }
    }
    return false;
  }, [chartData, yAxes]);

  const formatXAxis = (val: any) => {
    if (type === 'timeseries' && typeof val === 'number') {
      return new Date(val).toLocaleString();
    }
    return val;
  };

  const paginatedData = useMemo(() => {
    if (!properties?.paginationSize || properties.paginationSize <= 0) {
      return chartData;
    }
    const size = properties.paginationSize;
    const start = currentPage * size;
    return chartData.slice(start, start + size);
  }, [chartData, properties?.paginationSize, currentPage]);

  const totalPages = properties?.paginationSize && properties.paginationSize > 0 
    ? Math.ceil(chartData.length / properties.paginationSize) 
    : 1;

  const handleChartClick = (e: any) => {
    if (properties?.showTrendMarker && e && e.activeLabel !== undefined) {
      setMarkerValue(e.activeLabel);
    }
  };

  if (!xAxis || yAxes.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Selecione o Eixo X e pelo menos um Eixo Y na configuração acima para exibir o gráfico.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.chartWrapper}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* @ts-ignore - Recharts types conflict with React 17 */}
          <ResponsiveContainer width="100%" height="100%">
            {/* @ts-ignore */}
            <LineChart 
            data={paginatedData} 
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          onClick={handleChartClick}
        >
          {/* @ts-ignore */}
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sql-border-color, #374151)" />
          {/* @ts-ignore */}
          <XAxis 
            dataKey={xAxis} 
            tickFormatter={formatXAxis} 
            type={type === 'timeseries' ? 'number' : 'category'} 
            domain={type === 'timeseries' ? ['auto', 'auto'] : undefined}
            stroke="var(--sql-text-color, #f3f4f6)"
            tick={{ fontSize: properties?.fontSize ?? 12, fill: "var(--sql-text-color, #f3f4f6)" }}
          />
          {/* @ts-ignore */}
          <YAxis 
            stroke="var(--sql-text-color, #f3f4f6)" 
            type={isCategoryY ? 'category' : 'number'}
            width={isCategoryY ? Math.max(120, (properties?.fontSize ?? 12) * 10) : 60}
            tick={{ fontSize: properties?.fontSize ?? 12, fill: "var(--sql-text-color, #f3f4f6)" }}
          />
          {/* @ts-ignore */}
          <Tooltip 
            labelFormatter={(label) => formatXAxis(label)}
            contentStyle={{ backgroundColor: 'var(--sql-row-bg, #111827)', borderColor: 'var(--sql-border-color, #374151)' }}
          />
          {/* @ts-ignore */}
          <Legend />
          {yAxes.map((yCol, i) => (
            /* @ts-ignore */
            <Line 
              key={yCol}
              type="stepAfter" 
              dataKey={yCol} 
              stroke={COLORS[i % COLORS.length]} 
              activeDot={{ r: properties?.dotSize ?? 8 }}
              dot={type === 'xy' || properties?.dotSize ? { r: properties?.dotSize ?? 3 } : false}
              isAnimationActive={false}
            />
          ))}
          {properties?.showTrendMarker && markerValue !== null && (
            /* @ts-ignore */
            <ReferenceLine x={markerValue} stroke="var(--text-link, #3274D9)" strokeDasharray="3 3" />
          )}
        </LineChart>
      </ResponsiveContainer>
        </div>
      </div>
      
      {properties?.paginationSize && properties.paginationSize > 0 && totalPages > 1 && (
        <div className={styles.pagination}>
          <button 
            className={styles.pageButton} 
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            title="Página Anterior"
          >
            &#9664;
          </button>
          <div className={styles.pageInfo}>
            <span>{properties.paginationSize} itens</span>
          </div>
          <button 
            className={styles.pageButton} 
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            title="Próxima Página"
          >
            &#9654;
          </button>
        </div>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 300px;
    height: 100%;
    width: 100%;
    padding: ${theme.spacing(2)};
    background: var(--sql-row-bg, var(--surface-primary));
  `,
  chartWrapper: css`
    position: relative;
    flex: 1;
    min-height: 100px;
    width: 100%;
  `,
  emptyState: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 200px;
    color: var(--sql-text-color, var(--text-secondary));
    background: var(--sql-row-bg, var(--surface-primary));
  `,
  pagination: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 48px;
    flex-shrink: 0;
    border-top: 1px solid var(--sql-border-color, var(--border-color));
    color: var(--sql-text-color, var(--text-primary));
    padding-top: 8px;
  `,
  pageButton: css`
    background: transparent;
    border: 2px solid var(--sql-text-color, #3274D9);
    border-radius: 8px;
    color: var(--sql-text-color, #f3f4f6);
    width: 48px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 18px;
    transition: all 0.2s;
    
    &:hover:not(:disabled) {
      background: rgba(50, 116, 217, 0.1);
    }
    
    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
      border-color: var(--sql-border-color, var(--border-color));
    }
  `,
  pageInfo: css`
    background: transparent;
    border: 1px solid var(--sql-border-color, var(--border-color));
    border-radius: 8px;
    color: var(--sql-text-color, #f3f4f6);
    min-width: 120px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  `,
});
