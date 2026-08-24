import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import type { SqlTableProperties, SqlViewMode } from '../../display/createSqlTable';

export interface SqlChartRenderProps {
  data: Array<Record<string, any>>;
  xAxis: string | undefined;
  yAxes: string[];
  type: SqlViewMode;
  properties?: SqlTableProperties;
}

const DEFAULT_COLORS = [
  '#b4167e', // Magenta/Pink
  '#3274D9', // Blue
  '#8F3BB8', // Purple
  '#38B2A6', // Teal
  '#F2CC0C', // Yellow
  '#E02F44', // Red
  '#FF780A', // Orange
  '#73BF69', // Green
];

export function SqlChartRender({ data, xAxis, yAxes, type, properties }: SqlChartRenderProps) {
  const styles = useStyles2(getStyles);
  const [currentPage, setCurrentPage] = useState(0);
  const [markerValue, setMarkerValue] = useState<any>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string | number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | number | null>(null);
  const [zoomDomain, setZoomDomain] = useState<{ left: string | number; right: string | number } | null>(null);
  const [isZooming, setIsZooming] = useState(false);

  // Pagination size: default based on mode (xyRowsPerPage, barRowsPerPage, scatterRowsPerPage, paginationSize or tableRowsPerPage)
  const pageSize = Number(
    (type === 'xy' ? properties?.xyRowsPerPage : undefined) ||
    (type === 'bar' ? properties?.barRowsPerPage : undefined) ||
    (type === 'scatter' ? properties?.scatterRowsPerPage : undefined) ||
    properties?.paginationSize || 
    properties?.tableRowsPerPage || 
    (type === 'table' ? 25 : 100)
  ) || 100;

  // Available column names in data
  const availableCols = useMemo(() => {
    return data && data.length > 0 ? Object.keys(data[0]) : [];
  }, [data]);

  // Robust column resolution: exact match, case-insensitive match, or smart fallback
  const resolveCol = useMemo(() => {
    return (colName?: string, isY = false): string | undefined => {
      if (availableCols.length === 0) return undefined;
      if (colName) {
        if (availableCols.includes(colName)) return colName;
        const caseMatch = availableCols.find((c) => c.toLowerCase() === colName.toLowerCase());
        if (caseMatch) return caseMatch;
      }
      if (isY) {
        const valCol = availableCols.find((c) => {
          const lower = c.toLowerCase();
          return lower === 'pi_value' || lower === 'valor' || lower === 'val' || lower === 'value' || lower === 'y' || lower.includes('medida');
        }) || availableCols.find((c) => typeof data[0]?.[c] === 'number') || (availableCols.length > 1 ? availableCols[1] : availableCols[0]);
        return valCol;
      } else {
        const timeCol = availableCols.find((c) => {
          const lower = c.toLowerCase();
          return lower === 'ts' || lower === 'time' || lower === 'data' || lower.includes('date') || lower.includes('dth') || lower.includes('hora') || lower.includes('tempo');
        }) || availableCols[0];
        return timeCol;
      }
    };
  }, [availableCols, data]);

  const effXAxis = resolveCol(xAxis, false);
  const effYAxes = useMemo(() => {
    if (availableCols.length === 0) return [];
    if (yAxes && yAxes.length > 0) {
      const resolved = yAxes.map((y) => resolveCol(y, true)).filter((y): y is string => Boolean(y));
      if (resolved.length > 0) return Array.from(new Set(resolved));
    }
    const defY = resolveCol(undefined, true);
    return defY ? [defY] : [availableCols[0]];
  }, [yAxes, availableCols, resolveCol]);

  // Parse data: ensure numeric fields are numbers, parse timestamps
  const chartData = useMemo(() => {
    if (!effXAxis || data.length === 0) return data;

    const parsed = data.map((row) => {
      const newRow: Record<string, any> = { ...row };

      // Convert numeric string values to numbers
      effYAxes.forEach((yCol) => {
        const val = row[yCol];
        if (val !== null && val !== undefined) {
          if (typeof val === 'string') {
            const cleanVal = val.replace(',', '.').trim();
            const num = Number(cleanVal);
            if (!isNaN(num) && cleanVal !== '') {
              newRow[yCol] = num;
            }
          } else if (typeof val === 'number') {
            newRow[yCol] = val;
          }
        }
      });

      // For timeseries, parse date to milliseconds
      if (type === 'timeseries') {
        const xVal = row[effXAxis];
        if (typeof xVal === 'string') {
          const d = new Date(xVal);
          if (!isNaN(d.getTime())) {
            newRow[effXAxis] = d.getTime();
          }
        }
      }

      return newRow;
    });

    if (type === 'timeseries') {
      return parsed.sort((a, b) => {
        const valA = a[effXAxis];
        const valB = b[effXAxis];
        if (valA > valB) return 1;
        if (valA < valB) return -1;
        return 0;
      });
    }

    return parsed;
  }, [data, effXAxis, effYAxes, type]);

  // Determine if Y axis is categorical
  const isCategoryY = useMemo(() => {
    if (chartData.length === 0 || effYAxes.length === 0) return false;
    for (let i = 0; i < Math.min(10, chartData.length); i++) {
      const val = chartData[i][effYAxes[0]];
      if (typeof val === 'string' && isNaN(Number(val))) {
        return true;
      }
    }
    return false;
  }, [chartData, effYAxes]);

  const totalPages = Math.ceil(chartData.length / pageSize);

  const paginatedData = useMemo(() => {
    if (type === 'gauge') return chartData;
    if (totalPages <= 1) return chartData;
    const start = currentPage * pageSize;
    return chartData.slice(start, start + pageSize);
  }, [chartData, pageSize, currentPage, totalPages, type]);

  const handleMouseDown = (e: any) => {
    if (e && e.activeLabel !== undefined) {
      setRefAreaLeft(e.activeLabel);
      setRefAreaRight(null);
      setIsZooming(true);
    }
  };

  const handleMouseMove = (e: any) => {
    if (isZooming && e && e.activeLabel !== undefined) {
      setRefAreaRight(e.activeLabel);
    }
  };

  const handleMouseUp = () => {
    if (!isZooming || !effXAxis) return;
    setIsZooming(false);

    if (refAreaLeft !== null && refAreaRight !== null && refAreaLeft !== refAreaRight) {
      if (type === 'timeseries' && typeof refAreaLeft === 'number' && typeof refAreaRight === 'number') {
        const [left, right] = refAreaLeft < refAreaRight ? [refAreaLeft, refAreaRight] : [refAreaRight, refAreaLeft];
        setZoomDomain({ left, right });
      } else {
        const xKey = effXAxis;
        const leftIdx = chartData.findIndex((r) => String(r[xKey]) === String(refAreaLeft));
        const rightIdx = chartData.findIndex((r) => String(r[xKey]) === String(refAreaRight));
        if (leftIdx !== -1 && rightIdx !== -1 && leftIdx !== rightIdx) {
          const [startIdx, endIdx] = leftIdx < rightIdx ? [leftIdx, rightIdx] : [rightIdx, leftIdx];
          setZoomDomain({ left: chartData[startIdx][xKey], right: chartData[endIdx][xKey] });
        }
      }
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const handleResetZoom = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoomDomain(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const displayedData = useMemo(() => {
    if (!effXAxis) return paginatedData;
    const xKey = effXAxis;
    if (zoomDomain) {
      if (type === 'timeseries' && typeof zoomDomain.left === 'number' && typeof zoomDomain.right === 'number') {
        return chartData.filter((r) => {
          const val = r[xKey];
          return val >= (zoomDomain.left as number) && val <= (zoomDomain.right as number);
        });
      } else {
        const startIdx = chartData.findIndex((r) => String(r[xKey]) === String(zoomDomain.left));
        const endIdx = chartData.findIndex((r) => String(r[xKey]) === String(zoomDomain.right));
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          return chartData.slice(from, to + 1);
        }
      }
    }
    return paginatedData;
  }, [chartData, paginatedData, zoomDomain, effXAxis, type]);

  const formatXAxis = (val: any) => {
    if (type === 'timeseries' && typeof val === 'number') {
      return new Date(val).toLocaleString();
    }
    return val;
  };

  const handleChartClick = (e: any) => {
    if (properties?.showTrendMarker && e && e.activeLabel !== undefined) {
      setMarkerValue(e.activeLabel);
    }
  };

  if (!effXAxis || effYAxes.length === 0 || chartData.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Selecione as colunas na configuração para exibir os dados.</p>
      </div>
    );
  }

  // Check valid date column for TimeSeries
  if (type === 'timeseries') {
    const hasValidDate = data.some((row) => {
      const val = row[effXAxis];
      if (typeof val === 'number') return true;
      if (typeof val === 'string') {
        const d = new Date(val);
        return !isNaN(d.getTime());
      }
      return false;
    });

    if (!hasValidDate) {
      return (
        <div className={styles.emptyState}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 24, textAlign: 'center' }}>
            <span style={{ fontSize: 32 }}>⚠️</span>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f87171' }}>
              Nenhuma coluna de data/tempo disponível (ex: &apos;TS&apos;, &apos;DATA&apos;) para a Série Temporal
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 420, lineHeight: 1.5 }}>
              Para montar a Série Temporal, sua consulta SQL deve retornar ao menos uma coluna com data ou timestamp válido. Você também pode usar a visualização <strong>Gráfico XY</strong> ou <strong>Tabela</strong>.
            </div>
          </div>
        </div>
      );
    }
  }

  // Render Gauge Mode
  if (type === 'gauge') {
    const rawVal = chartData[chartData.length - 1]?.[effYAxes[0]] ?? chartData[0]?.[effYAxes[0]] ?? 0;
    const numVal = typeof rawVal === 'number' ? rawVal : (parseFloat(rawVal) || 0);
    const min = typeof properties?.gaugeMin === 'number' ? properties.gaugeMin : 0;
    const max = typeof properties?.gaugeMax === 'number' ? properties.gaugeMax : 100;
    const decimals = typeof properties?.gaugeDecimals === 'number' ? properties.gaugeDecimals : 1;
    const unit = (properties?.gaugeUnit as string) || '%';
    const showValue = properties?.gaugeShowValue !== false;
    const showLegend = properties?.gaugeLegend !== false;

    const clamped = Math.max(min, Math.min(max, numVal));
    const pct = max > min ? (clamped - min) / (max - min) : 0;

    // Semicircle gauge calculation: start angle -180 deg, end angle 0 deg (total 180 deg)
    const radius = 80;
    const strokeWidth = 14;
    const circumference = Math.PI * radius;
    const strokeDashoffset = circumference * (1 - pct);

    const color1 = (properties?.gaugeColor1 as string) || '#22c55e';
    const color2 = (properties?.gaugeColor2 as string) || '#eab308';
    const color3 = (properties?.gaugeColor3 as string) || '#ef4444';

    let progressColor = color1;
    if (pct >= 0.85) {
      progressColor = color3;
    } else if (pct >= 0.6) {
      progressColor = color2;
    }

    return (
      <div className={styles.gaugeContainer}>
        <div className={styles.gaugeSvgWrapper}>
          <svg width="220" height="130" viewBox="0 0 220 130">
            {/* Background Arc */}
            <path
              d="M 20 115 A 80 80 0 0 1 200 115"
              fill="none"
              stroke="var(--border-color, #334155)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Value Arc */}
            <path
              d="M 20 115 A 80 80 0 0 1 200 115"
              fill="none"
              stroke={progressColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
            />
          </svg>
          
          {showValue && (
            <div className={styles.gaugeValueDisplay}>
              <span className={styles.gaugeNumber}>{numVal.toFixed(decimals)}</span>
              <span className={styles.gaugeUnit}>{unit}</span>
            </div>
          )}
        </div>

        {showLegend && (
          <div className={styles.gaugeLimits}>
            <span>{min}{unit}</span>
            <span className={styles.gaugeFieldLabel}>{effYAxes[0]}</span>
            <span>{max}{unit}</span>
          </div>
        )}
      </div>
    );
  }

  // Line Curve Type
  let lineCurve: 'linear' | 'monotone' | 'stepAfter' = 'linear';
  if (properties?.xyLineType === 'Suave') lineCurve = 'monotone';
  else if (properties?.xyLineType === 'Degrau') lineCurve = 'stepAfter';
  else if (type === 'timeseries') lineCurve = 'linear';

  const showPoints = properties?.xyShowPoints !== false;
  const isHorizontalBar = type === 'bar' && properties?.barOrientation === 'Horizontal';
  const barCustomColor = (properties?.barColor as string) || '#b4167e';
  const showLegend = properties?.xyLegend !== false && properties?.barLegend !== false && properties?.scatterLegend !== false && properties?.timeLegend !== false;

  return (
    <div className={styles.container}>
      <div className={styles.chartWrapper}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {React.createElement(ResponsiveContainer as any, { width: '100%', height: '100%' }, (
            type === 'bar' ? (
              /* @ts-ignore */
              <BarChart
                data={paginatedData}
                layout={isHorizontalBar ? 'vertical' : 'horizontal'}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                onClick={handleChartClick}
              >
                {/* @ts-ignore */}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sql-border-color, var(--border-subtle, #374151))" />
                {/* @ts-ignore */}
                <XAxis
                  dataKey={isHorizontalBar ? undefined : effXAxis}
                  type={isHorizontalBar ? 'number' : 'category'}
                  stroke="var(--sql-text-color, var(--text-secondary, #94a3b8))"
                  tick={{ fontSize: properties?.fontSize ?? 12, fill: 'var(--sql-text-color, var(--text-secondary, #94a3b8))' }}
                />
                {/* @ts-ignore */}
                <YAxis
                  dataKey={isHorizontalBar ? effXAxis : undefined}
                  stroke="var(--sql-text-color, var(--text-secondary, #94a3b8))"
                  type={isHorizontalBar ? 'category' : (isCategoryY ? 'category' : 'number')}
                  width={isHorizontalBar ? 110 : (isCategoryY ? 120 : 60)}
                  tick={{ fontSize: properties?.fontSize ?? 12, fill: 'var(--sql-text-color, var(--text-secondary, #94a3b8))' }}
                />
                {/* @ts-ignore */}
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--sql-row-bg, var(--surface-elevated, #111827))', borderColor: 'var(--sql-border-color, var(--border-color, #374151))', color: 'var(--sql-text-color, var(--text-primary, #f3f4f6))' }}
                />
                {showLegend && React.createElement(Legend as any)}
                {effYAxes.map((yCol, i) => (
                  /* @ts-ignore */
                  <Bar
                    key={yCol}
                    dataKey={yCol}
                    fill={effYAxes.length === 1 ? barCustomColor : DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            ) : (
              /* @ts-ignore */
              <LineChart 
                data={displayedData} 
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                onClick={handleChartClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                {/* @ts-ignore */}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sql-border-color, var(--border-subtle, #374151))" />
                {/* @ts-ignore */}
                <XAxis 
                  dataKey={effXAxis} 
                  tickFormatter={formatXAxis} 
                  type={type === 'timeseries' ? 'number' : 'category'} 
                  domain={type === 'timeseries' ? (zoomDomain ? [zoomDomain.left, zoomDomain.right] : ['auto', 'auto']) : undefined}
                  stroke="var(--sql-text-color, var(--text-secondary, #94a3b8))"
                  tick={{ fontSize: properties?.fontSize ?? 12, fill: 'var(--sql-text-color, var(--text-secondary, #94a3b8))' }}
                />
                {/* @ts-ignore */}
                <YAxis 
                  stroke="var(--sql-text-color, var(--text-secondary, #94a3b8))" 
                  type={isCategoryY ? 'category' : 'number'}
                  domain={['auto', 'auto']}
                  width={isCategoryY ? Math.max(120, (properties?.fontSize ?? 12) * 10) : 60}
                  tick={{ fontSize: properties?.fontSize ?? 12, fill: 'var(--sql-text-color, var(--text-secondary, #94a3b8))' }}
                />
                {/* @ts-ignore */}
                <Tooltip 
                  labelFormatter={(label) => formatXAxis(label)}
                  contentStyle={{ backgroundColor: 'var(--sql-row-bg, var(--surface-elevated, #111827))', borderColor: 'var(--sql-border-color, var(--border-color, #374151))', color: 'var(--sql-text-color, var(--text-primary, #f3f4f6))' }}
                />
                {showLegend && React.createElement(Legend as any)}
                {effYAxes.map((yCol, i) => {
                  const dotRadius = Number(properties?.scatterPointSize || properties?.dotSize) || 5;
                  const seriesColor = effYAxes.length === 1 ? barCustomColor : DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                  return (
                    /* @ts-ignore */
                    <Line 
                      key={yCol}
                      type={type === 'scatter' ? 'linear' : lineCurve} 
                      dataKey={yCol} 
                      connectNulls={true}
                      stroke={type === 'scatter' ? 'transparent' : seriesColor} 
                      strokeWidth={2}
                      activeDot={{ r: dotRadius + 3 }}
                      dot={type === 'scatter' ? { r: dotRadius, fill: seriesColor } : (showPoints ? { r: Number(properties?.dotSize) || 3, stroke: seriesColor, fill: seriesColor } : false)}
                      isAnimationActive={false}
                    />
                  );
                })}
                {properties?.showTrendMarker && markerValue !== null && (
                  /* @ts-ignore */
                  <ReferenceLine x={markerValue} stroke="var(--text-link, #3274D9)" strokeDasharray="3 3" />
                )}
                {refAreaLeft && refAreaRight && (
                  /* @ts-ignore */
                  <ReferenceArea
                    x1={refAreaLeft}
                    x2={refAreaRight}
                    strokeOpacity={0.5}
                    stroke="#b4167e"
                    fill="#b4167e"
                    fillOpacity={0.3}
                  />
                )}
              </LineChart>
            )
          ))}
          {zoomDomain && (
            <button
              type="button"
              className={styles.resetZoomBtn}
              onClick={handleResetZoom}
              title="Resetar zoom"
            >
              <span>↺</span> Resetar Zoom
            </button>
          )}
        </div>
      </div>
      
      {/* Pagination Controls - Always shown when there are multiple pages */}
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
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 200px;
    height: 100%;
    width: 100%;
    padding: ${theme.spacing(1.5)};
    background: var(--sql-row-bg, var(--surface-primary));
    box-sizing: border-box;
  `,
  chartWrapper: css`
    position: relative;
    flex: 1;
    min-height: 140px;
    width: 100%;
  `,
  resetZoomBtn: css`
    position: absolute;
    top: 8px;
    right: 18px;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(180, 22, 126, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    transition: background 0.2s, transform 0.15s;

    &:hover {
      background: #b4167e;
      transform: scale(1.05);
    }
  `,
  emptyState: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 150px;
    color: var(--sql-text-color, var(--text-secondary));
    background: var(--sql-row-bg, var(--surface-primary));
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
    padding-top: 6px;
    margin-top: 4px;
  `,
  pageButton: css`
    background: var(--button-bg, var(--surface-secondary));
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--sql-text-color, var(--text-primary));
    width: 36px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 14px;
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
    padding: 0 12px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
  `,
  gaugeContainer: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    height: 100%;
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
  `,
  gaugeSvgWrapper: css`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 220px;
    height: 130px;
  `,
  gaugeValueDisplay: css`
    position: absolute;
    bottom: 16px;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
  `,
  gaugeNumber: css`
    font-size: 28px;
    font-weight: 700;
    color: var(--sql-text-color, var(--text-primary, #f8fafc));
  `,
  gaugeUnit: css`
    font-size: 14px;
    font-weight: 500;
    color: var(--sql-text-color, var(--text-secondary, #94a3b8));
  `,
  gaugeLimits: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 190px;
    font-size: 12px;
    color: var(--sql-text-color, var(--text-secondary, #94a3b8));
    margin-top: 4px;
  `,
  gaugeFieldLabel: css`
    color: var(--sql-text-color, var(--text-primary, #cbd5e1));
    font-weight: 500;
    font-size: 13px;
  `,
});
