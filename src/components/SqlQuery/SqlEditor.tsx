import React, { useEffect, useState } from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, Icon, Input } from '@grafana/ui';
import { SqlParamsModal } from './SqlParamsModal';
import type { OracleQueryResponse } from './oracleApi';
import type { SqlViewMode } from '../../display/createSqlTable';

export interface SqlConfig {
  viewMode?: SqlViewMode;
  xAxis?: string;
  yAxes?: string[];
  [key: string]: any;
}

interface SqlEditorProps {
  onExecute: (sql: string, maxRows: number, params?: Record<string, any>) => Promise<OracleQueryResponse | null>;
  onDisconnect: () => void;
  isExecuting: boolean;
  error?: string;
  lastResult: OracleQueryResponse | null;
  showResult?: boolean;
  sqlToLoad?: string;
  onConfigChange?: (config: SqlConfig) => void;
  onApplyToDashboard?: (config: SqlConfig) => void;
  initialConfig?: SqlConfig;
}

interface VisualCardOption {
  id: SqlViewMode;
  label: string;
  renderIcon: () => React.ReactNode;
}

const VISUAL_CARDS: VisualCardOption[] = [
  {
    id: 'table',
    label: 'Tabela',
    renderIcon: () => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
  },
  {
    id: 'xy',
    label: 'Gráfico XY',
    renderIcon: () => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <polyline points="5 15 10 9 14 13 19 6" />
        <circle cx="5" cy="15" r="1.5" fill="currentColor" />
        <circle cx="10" cy="9" r="1.5" fill="currentColor" />
        <circle cx="14" cy="13" r="1.5" fill="currentColor" />
        <circle cx="19" cy="6" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'timeseries',
    label: 'Série temporal',
    renderIcon: () => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 13 7 8 11 11 15 6 18 8" />
        <circle cx="16" cy="16" r="4.5" />
        <polyline points="16 13.5 16 16 18 16" />
      </svg>
    ),
  },
  {
    id: 'bar',
    label: 'Gráfico de barras',
    renderIcon: () => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="20" x2="21" y2="20" />
        <rect x="5" y="11" width="3" height="9" rx="0.5" />
        <rect x="9.5" y="5" width="3" height="15" rx="0.5" />
        <rect x="14" y="8" width="3" height="12" rx="0.5" />
        <rect x="18.5" y="13" width="2" height="7" rx="0.5" />
      </svg>
    ),
  },
  {
    id: 'gauge',
    label: 'Gauge',
    renderIcon: () => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" strokeDasharray="2.5 2.5" />
        <line x1="12" y1="12" x2="16.5" y2="7.5" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'scatter',
    label: 'Dispersão',
    renderIcon: () => (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <circle cx="7" cy="14" r="1.5" fill="currentColor" />
        <circle cx="10" cy="8" r="1.5" fill="currentColor" />
        <circle cx="12" cy="15" r="1.5" fill="currentColor" />
        <circle cx="14" cy="10" r="1.5" fill="currentColor" />
        <circle cx="16" cy="6" r="1.5" fill="currentColor" />
        <circle cx="18" cy="13" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
];

const COLOR_PALETTE = [
  '#22c55e', // Green
  '#eab308', // Yellow
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#b4167e', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#10b981', // Emerald
  '#f43f5e', // Rose
  '#64748b', // Slate
  '#ffffff', // White
];

export function SqlEditor({ 
  onExecute, 
  onDisconnect, 
  isExecuting, 
  error, 
  lastResult, 
  sqlToLoad, 
  onConfigChange, 
  onApplyToDashboard, 
  initialConfig 
}: SqlEditorProps) {
  const styles = useStyles2(getStyles);
  
  const [sql, setSql] = useState<string>(sqlToLoad !== undefined ? sqlToLoad : '');

  const handleSqlChange = (val: string) => {
    setSql(val);
  };

  const [maxRows, setMaxRows] = useState(200);
  
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  const [detectedParams, setDetectedParams] = useState<string[]>([]);
  
  const [viewMode, setViewMode] = useState<SqlViewMode>(initialConfig?.viewMode ?? 'table');
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);
  
  // Columns detection
  const columns = lastResult?.rows?.[0] 
    ? Object.keys(lastResult.rows[0]) 
    : ['DTH_INIC_PROCE', 'VALOR', 'COD_EQPMT_PRODC', 'TS', 'COD_IDENT_UNMET'];

  // Form states
  // Common / Axes
  const [xAxis, setXAxis] = useState<string>(initialConfig?.xAxis || columns[0] || 'DTH_INIC_PROCE');
  const [yAxis, setYAxis] = useState<string>(initialConfig?.yAxes?.[0] || columns[1] || 'VALOR');

  // 1. Tabela
  const [tableVisibleCols, setTableVisibleCols] = useState<string>('Todas');
  const [tableSortBy, setTableSortBy] = useState<string>(columns[0] || 'DTH_INIC_PROCE');
  const [tableOrder, setTableOrder] = useState<'Crescente' | 'Decrescente'>('Crescente');
  const [tableRowsPerPage, setTableRowsPerPage] = useState<string>('25');
  const [tableColumnFilters, setTableColumnFilters] = useState<boolean>(true);
  const [tableAdjustWidth, setTableAdjustWidth] = useState<boolean>(true);

  // 2. Gráfico XY
  const [xyRowsPerPage, setXyRowsPerPage] = useState<string>('100');
  const [xyLineType, setXyLineType] = useState<string>('Linear');
  const [xyShowPoints, setXyShowPoints] = useState<boolean>(true);
  const [xyLegend, setXyLegend] = useState<boolean>(true);

  // 3. Série temporal
  const [timeDateField, setTimeDateField] = useState<string>(columns[0] || 'DTH_INIC_PROCE');
  const [timeValueField, setTimeValueField] = useState<string>(columns[1] || 'VALOR');
  const [timeInterval, setTimeInterval] = useState<string>('Automático');
  const [timeFillGaps, setTimeFillGaps] = useState<boolean>(false);
  const [timeLegend, setTimeLegend] = useState<boolean>(true);

  // 4. Gráfico de barras
  const [barXAxis, setBarXAxis] = useState<string>(columns[0] || 'DTH_INIC_PROCE');
  const [barYAxis, setBarYAxis] = useState<string>(columns[1] || 'VALOR');
  const [barRowsPerPage, setBarRowsPerPage] = useState<string>('100');
  const [barGroupBy, setBarGroupBy] = useState<string>('Nenhum');
  const [barOrientation, setBarOrientation] = useState<'Vertical' | 'Horizontal'>('Vertical');
  const [barLegend, setBarLegend] = useState<boolean>(true);
  const [barShowValues, setBarShowValues] = useState<boolean>(false);
  const [barColor, setBarColor] = useState<string>('#b4167e');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // 5. Gauge
  const [gaugeNumericField, setGaugeNumericField] = useState<string>(columns[1] || 'VALOR');
  const [gaugeMin, setGaugeMin] = useState<number>(0);
  const [gaugeMax, setGaugeMax] = useState<number>(100);
  const [gaugeUnit, setGaugeUnit] = useState<string>('%');
  const [gaugeShowValue, setGaugeShowValue] = useState<boolean>(true);
  const [gaugeDecimals, setGaugeDecimals] = useState<string>('1');
  const [gaugeColor1, setGaugeColor1] = useState<string>('#22c55e');
  const [gaugeColor2, setGaugeColor2] = useState<string>('#eab308');
  const [gaugeColor3, setGaugeColor3] = useState<string>('#ef4444');
  const [activeThresholdPicker, setActiveThresholdPicker] = useState<number | null>(null);
  const [gaugeLegend, setGaugeLegend] = useState<boolean>(true);

  // 6. Dispersão
  const [scatterXAxis, setScatterXAxis] = useState<string>(columns[0] || 'DTH_INIC_PROCE');
  const [scatterYAxis, setScatterYAxis] = useState<string>(columns[1] || 'VALOR');
  const [scatterRowsPerPage, setScatterRowsPerPage] = useState<string>('100');
  const [scatterPointSize, setScatterPointSize] = useState<string>('5');
  const [scatterColorBy, setScatterColorBy] = useState<string>('Nenhum');
  const [scatterGroupBy, setScatterGroupBy] = useState<string>('Nenhum');
  const [scatterTrendLine, setScatterTrendLine] = useState<boolean>(false);
  const [scatterLegend, setScatterLegend] = useState<boolean>(true);

  useEffect(() => {
    if (sqlToLoad !== undefined) {
      setSql(sqlToLoad);
    }
  }, [sqlToLoad]);

  // Smart auto-detection for axes whenever new results arrive
  useEffect(() => {
    if (lastResult?.rows && lastResult.rows.length > 0) {
      const cols = Object.keys(lastResult.rows[0]);
      if (cols.length > 0) {
        // Find best candidate for time/X-axis (ts, time, date, timestamp, dth_...)
        const timeCandidate = cols.find((c) => {
          const lower = c.toLowerCase();
          return lower === 'ts' || lower === 'time' || lower === 'data' || lower.includes('date') || lower.includes('dth') || lower.includes('hora') || lower.includes('tempo');
        }) || cols[0];

        // Find best candidate for value/Y-axis (pi_value, valor, val, value, y, qtde)
        const valueCandidate = cols.find((c) => {
          const lower = c.toLowerCase();
          return lower === 'pi_value' || lower === 'valor' || lower === 'val' || lower === 'value' || lower === 'y' || lower.includes('medida') || lower.includes('total') || lower.includes('qtde');
        }) || cols.find((c) => c !== timeCandidate && typeof lastResult.rows[0][c] === 'number') || (cols.length > 1 ? cols[1] : cols[0]);

        setXAxis(timeCandidate);
        setYAxis(valueCandidate);
        setTableSortBy(timeCandidate);
        setTimeDateField(timeCandidate);
        setTimeValueField(valueCandidate);
        setBarXAxis(timeCandidate);
        setBarYAxis(valueCandidate);
        setGaugeNumericField(valueCandidate);
        setScatterXAxis(timeCandidate);
        setScatterYAxis(valueCandidate);
      }
    }
  }, [lastResult]);

  // Build current config object
  const getCurrentConfig = (): SqlConfig => {
    let effectiveXAxis = xAxis;
    let effectiveYAxes = [yAxis];

    if (viewMode === 'bar') {
      effectiveXAxis = barXAxis;
      effectiveYAxes = [barYAxis];
    } else if (viewMode === 'timeseries') {
      effectiveXAxis = timeDateField;
      effectiveYAxes = [timeValueField];
    } else if (viewMode === 'gauge') {
      effectiveXAxis = columns[0];
      effectiveYAxes = [gaugeNumericField];
    } else if (viewMode === 'scatter') {
      effectiveXAxis = scatterXAxis;
      effectiveYAxes = [scatterYAxis];
    }

    return {
      viewMode,
      xAxis: effectiveXAxis,
      yAxes: effectiveYAxes,
      // Tabela
      tableVisibleCols,
      tableSortBy,
      tableOrder,
      tableRowsPerPage: Number(tableRowsPerPage) || 25,
      tableColumnFilters,
      tableAdjustWidth,
      // XY
      xyRowsPerPage: Number(xyRowsPerPage) || 100,
      paginationSize: viewMode === 'xy' ? (Number(xyRowsPerPage) || 100) : (Number(tableRowsPerPage) || 25),
      xyLineType,
      xyShowPoints,
      xyLegend,
      // Série temporal
      timeDateField,
      timeValueField,
      timeInterval,
      timeFillGaps,
      timeLegend,
      // Barras
      barXAxis,
      barYAxis,
      barRowsPerPage: Number(barRowsPerPage) || 100,
      barGroupBy,
      barOrientation,
      barLegend,
      barShowValues,
      barColor,
      // Gauge
      gaugeNumericField,
      gaugeMin,
      gaugeMax,
      gaugeUnit,
      gaugeShowValue,
      gaugeDecimals: Number(gaugeDecimals) || 1,
      gaugeColor1,
      gaugeColor2,
      gaugeColor3,
      gaugeLegend,
      // Dispersão
      scatterXAxis,
      scatterYAxis,
      scatterRowsPerPage: Number(scatterRowsPerPage) || 100,
      scatterPointSize: Number(scatterPointSize) || 5,
      scatterColorBy,
      scatterGroupBy,
      scatterTrendLine,
      scatterLegend,
    };
  };

  useEffect(() => {
    onConfigChange?.(getCurrentConfig());
  }, [
    viewMode, xAxis, yAxis,
    tableVisibleCols, tableSortBy, tableOrder, tableRowsPerPage, tableColumnFilters, tableAdjustWidth,
    xyLineType, xyShowPoints, xyLegend, xyRowsPerPage,
    timeDateField, timeValueField, timeInterval, timeFillGaps, timeLegend,
    barXAxis, barYAxis, barRowsPerPage, barGroupBy, barOrientation, barLegend, barShowValues, barColor,
    gaugeNumericField, gaugeMin, gaugeMax, gaugeUnit, gaugeShowValue, gaugeDecimals, gaugeColor1, gaugeColor2, gaugeColor3, gaugeLegend,
    scatterXAxis, scatterYAxis, scatterRowsPerPage, scatterPointSize, scatterColorBy, scatterGroupBy, scatterTrendLine, scatterLegend
  ]);
  
  const handleExecute = async () => {
    if (!sql.trim() || isExecuting) {
      return;
    }
    
    const paramRegex = /(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const matches = Array.from(sql.matchAll(paramRegex));
    const uniqueParams = Array.from(new Set(matches.map(m => m[1])));
    
    if (uniqueParams.length > 0) {
      setDetectedParams(uniqueParams);
      setIsParamsModalOpen(true);
    } else {
      await onExecute(sql, maxRows);
    }
  };
  
  const handleConfirmParams = async (params: Record<string, any>) => {
    setIsParamsModalOpen(false);
    await onExecute(sql, maxRows, params);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleApply = async () => {
    if (!lastResult && sql.trim()) {
      await handleExecute();
    }
    onApplyToDashboard?.(getCurrentConfig());
  };

  // Reusable UI Elements
  const renderToggle = (checked: boolean, onChange: (val: boolean) => void) => (
    <button
      type="button"
      className={cx(styles.switchTrack, checked && styles.switchTrackActive)}
      onClick={() => onChange(!checked)}
      aria-checked={checked}
      role="switch"
    >
      <span className={cx(styles.switchKnob, checked && styles.switchKnobActive)} />
    </button>
  );

  const renderSegmented = <T extends string>(
    options: [T, T], 
    value: T, 
    onChange: (val: T) => void
  ) => (
    <div className={styles.segmentedContainer}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={cx(styles.segmentedBtn, value === opt && styles.segmentedBtnActive)}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const renderSelect = (value: string, onChange: (val: string) => void, options: string[]) => (
    <div className={styles.selectWrapper}>
      <select 
        className={styles.nativeSelect} 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <span className={styles.selectChevron}>
        <Icon name="angle-down" />
      </span>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Icon name="database" className={styles.dbIcon} />
          <span className={styles.statusDot} />
          <span className={styles.connectionStatus}>Conectado ao SIP</span>
        </div>
        <button type="button" className={styles.disconnectButton} onClick={onDisconnect} title="Desconectar">
          <Icon name="signout" />
          <span>Desconectar</span>
        </button>
      </div>
      
      {/* Content Area */}
      <div className={styles.editorArea}>
        <textarea
          className={styles.textarea}
          value={sql}
          onChange={(e) => handleSqlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua consulta SQL aqui (SELECT / WITH; final opcional)...&#10;Pressione Ctrl+Enter para executar."
          spellCheck={false}
          disabled={isExecuting}
        />
        
        {/* Controls row */}
        <div className={styles.editorControls}>
          <div className={styles.limitControl}>
            <span className={styles.limitLabel}>Limite de linhas</span>
            <Input
              type="number"
              min={1}
              max={5000}
              value={maxRows}
              onChange={(e) => setMaxRows(parseInt(e.currentTarget.value, 10) || 200)}
              className={styles.limitInput}
              disabled={isExecuting}
            />
          </div>
          
          <div className={styles.actionButtons}>
            <button 
              type="button"
              className={styles.clearButton} 
              onClick={() => handleSqlChange('')} 
              disabled={isExecuting || !sql}
            >
              Limpar
            </button>
            <button 
              type="button"
              className={styles.runButton} 
              onClick={handleExecute} 
              disabled={isExecuting || !sql.trim()}
            >
              <Icon name="play" />
              <span>{isExecuting ? 'Executando...' : 'Executar (Ctrl+Enter)'}</span>
            </button>
          </div>
        </div>
        
        {error && (
          <div className={styles.errorAlert}>
            <Icon name="exclamation-triangle" />
            <span>{error}</span>
          </div>
        )}

        {/* 6 Visual Modes Grid */}
        <div className={styles.visualGrid}>
          {VISUAL_CARDS.map((card) => {
            const isSelected = viewMode === card.id;
            return (
              <button
                key={card.id}
                type="button"
                className={cx(styles.visualCard, isSelected && styles.visualCardActive)}
                onClick={() => setViewMode(card.id)}
              >
                <div className={styles.visualCardIcon}>
                  {card.renderIcon()}
                </div>
                <span className={styles.visualCardLabel}>{card.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Mode-Specific Settings Card */}
        <div className={styles.configContainer}>
          <div 
            className={styles.configHeader} 
            onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}
          >
            <span>Configurações do gráfico</span>
            <Icon name={isConfigCollapsed ? 'angle-down' : 'angle-up'} />
          </div>

          {!isConfigCollapsed && (
            <div className={styles.configBody}>
              {/* 1. Tabela */}
              {viewMode === 'table' && (
                <>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Colunas visíveis</span>
                    {renderSelect(tableVisibleCols, setTableVisibleCols, ['Todas', ...columns])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Ordenar por</span>
                    {renderSelect(tableSortBy, setTableSortBy, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Ordem</span>
                    {renderSegmented(['Crescente', 'Decrescente'], tableOrder, setTableOrder)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Linhas por página</span>
                    {renderSelect(tableRowsPerPage, setTableRowsPerPage, ['10', '25', '50', '100'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Filtros por coluna</span>
                    {renderToggle(tableColumnFilters, setTableColumnFilters)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Ajustar largura</span>
                    {renderToggle(tableAdjustWidth, setTableAdjustWidth)}
                  </div>
                </>
              )}

              {/* 2. Gráfico XY */}
              {viewMode === 'xy' && (
                <>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Eixo X</span>
                    {renderSelect(xAxis, setXAxis, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Eixo Y</span>
                    {renderSelect(yAxis, setYAxis, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Linhas por página</span>
                    {renderSelect(xyRowsPerPage, setXyRowsPerPage, ['10', '25', '50', '100', '200', '500'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Tipo de linha</span>
                    {renderSelect(xyLineType, setXyLineType, ['Linear', 'Suave', 'Degrau'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Mostrar pontos</span>
                    {renderToggle(xyShowPoints, setXyShowPoints)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Legenda</span>
                    {renderToggle(xyLegend, setXyLegend)}
                  </div>
                </>
              )}

              {/* 3. Série temporal */}
              {viewMode === 'timeseries' && (
                <>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Campo de data</span>
                    {renderSelect(timeDateField, setTimeDateField, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Campo de valor</span>
                    {renderSelect(timeValueField, setTimeValueField, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Intervalo</span>
                    {renderSelect(timeInterval, setTimeInterval, ['Automático', '1m', '5m', '15m', '1h', '1d'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Preencher lacunas</span>
                    {renderToggle(timeFillGaps, setTimeFillGaps)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Legenda</span>
                    {renderToggle(timeLegend, setTimeLegend)}
                  </div>
                </>
              )}

              {/* 4. Gráfico de barras */}
              {viewMode === 'bar' && (
                <>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Eixo X</span>
                    {renderSelect(barXAxis, setBarXAxis, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Eixo Y</span>
                    {renderSelect(barYAxis, setBarYAxis, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Linhas por página</span>
                    {renderSelect(barRowsPerPage, setBarRowsPerPage, ['10', '25', '50', '100', '200', '500'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Agrupamento</span>
                    {renderSelect(barGroupBy, setBarGroupBy, ['Nenhum', ...columns])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Orientação</span>
                    {renderSegmented(['Vertical', 'Horizontal'], barOrientation, setBarOrientation)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Legenda</span>
                    {renderToggle(barLegend, setBarLegend)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Mostrar valores</span>
                    {renderToggle(barShowValues, setBarShowValues)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Cor das barras</span>
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        className={styles.colorPickerBtn}
                        onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
                      >
                        <span className={styles.colorPreview} style={{ backgroundColor: barColor }} />
                        <Icon name="angle-down" />
                      </button>
                      {isColorPickerOpen && (
                        <div className={styles.colorDropdown}>
                          {COLOR_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={styles.colorSwatch}
                              style={{ backgroundColor: c }}
                              onClick={() => {
                                setBarColor(c);
                                setIsColorPickerOpen(false);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* 5. Gauge */}
              {viewMode === 'gauge' && (
                <>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Campo numérico</span>
                    {renderSelect(gaugeNumericField, setGaugeNumericField, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Valor mínimo</span>
                    <input
                      type="number"
                      className={styles.numberInput}
                      value={gaugeMin}
                      onChange={(e) => setGaugeMin(Number(e.target.value))}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Valor máximo</span>
                    <input
                      type="number"
                      className={styles.numberInput}
                      value={gaugeMax}
                      onChange={(e) => setGaugeMax(Number(e.target.value))}
                    />
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Unidade</span>
                    {renderSelect(gaugeUnit, setGaugeUnit, ['%', '°C', 'bar', 'kg/h', 'rpm', 'm³/h', 'V', 'A', 'kW'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Faixas</span>
                    <div style={{ position: 'relative' }}>
                      <div className={styles.thresholdsRow}>
                        <button
                          type="button"
                          className={styles.thresholdBoxBtn}
                          style={{ backgroundColor: gaugeColor1 }}
                          title="Faixa Normal (clique para trocar a cor)"
                          onClick={() => setActiveThresholdPicker(activeThresholdPicker === 1 ? null : 1)}
                        />
                        <button
                          type="button"
                          className={styles.thresholdBoxBtn}
                          style={{ backgroundColor: gaugeColor2 }}
                          title="Faixa Alerta (clique para trocar a cor)"
                          onClick={() => setActiveThresholdPicker(activeThresholdPicker === 2 ? null : 2)}
                        />
                        <button
                          type="button"
                          className={styles.thresholdBoxBtn}
                          style={{ backgroundColor: gaugeColor3 }}
                          title="Faixa Crítica (clique para trocar a cor)"
                          onClick={() => setActiveThresholdPicker(activeThresholdPicker === 3 ? null : 3)}
                        />
                      </div>

                      {activeThresholdPicker !== null && (
                        <div className={styles.colorDropdown}>
                          {COLOR_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={styles.colorSwatch}
                              style={{ backgroundColor: c }}
                              onClick={() => {
                                if (activeThresholdPicker === 1) setGaugeColor1(c);
                                else if (activeThresholdPicker === 2) setGaugeColor2(c);
                                else if (activeThresholdPicker === 3) setGaugeColor3(c);
                                setActiveThresholdPicker(null);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Legenda</span>
                    {renderToggle(gaugeLegend, setGaugeLegend)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Mostrar valor</span>
                    {renderToggle(gaugeShowValue, setGaugeShowValue)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Casas decimais</span>
                    {renderSelect(gaugeDecimals, setGaugeDecimals, ['0', '1', '2', '3'])}
                  </div>
                </>
              )}

              {/* 6. Dispersão */}
              {viewMode === 'scatter' && (
                <>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Eixo X</span>
                    {renderSelect(scatterXAxis, setScatterXAxis, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Eixo Y</span>
                    {renderSelect(scatterYAxis, setScatterYAxis, columns)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Linhas por página</span>
                    {renderSelect(scatterRowsPerPage, setScatterRowsPerPage, ['10', '25', '50', '100', '200', '500'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Tamanho do ponto</span>
                    {renderSelect(scatterPointSize, setScatterPointSize, ['3', '5', '8', '10', '12'])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Cor por</span>
                    {renderSelect(scatterColorBy, setScatterColorBy, ['Nenhum', ...columns])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Agrupar por</span>
                    {renderSelect(scatterGroupBy, setScatterGroupBy, ['Nenhum', ...columns])}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Linha de tendência</span>
                    {renderToggle(scatterTrendLine, setScatterTrendLine)}
                  </div>
                  <div className={styles.formRow}>
                    <span className={styles.fieldLabel}>Legenda</span>
                    {renderToggle(scatterLegend, setScatterLegend)}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Pink Apply Visualization Button */}
        <button
          type="button"
          className={styles.applyButton}
          onClick={handleApply}
          disabled={Boolean(isExecuting)}
        >
          <Icon name="play" />
          <span>Aplicar visualização</span>
        </button>
      </div>
      
      <SqlParamsModal
        isOpen={isParamsModalOpen}
        params={detectedParams}
        onConfirm={handleConfirmParams}
        onDismiss={() => setIsParamsModalOpen(false)}
      />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow-y: auto;
    background: var(--surface-primary);
    color: var(--text-primary);
  `,
  toolbar: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--panel-header-bg, var(--surface-secondary));
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  `,
  toolbarLeft: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  dbIcon: css`
    color: var(--text-secondary);
    font-size: 16px;
  `,
  statusDot: css`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--success, #22c55e);
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.7);
    display: inline-block;
  `,
  connectionStatus: css`
    color: var(--success, #22c55e);
    font-size: 13px;
    font-weight: 500;
  `,
  disconnectButton: css`
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--danger, #f43f5e);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: opacity 0.2s, background-color 0.2s;

    &:hover {
      background-color: rgba(244, 63, 94, 0.1);
      opacity: 0.9;
    }
  `,
  editorArea: css`
    display: flex;
    flex-direction: column;
    padding: 14px;
    gap: 12px;
  `,
  textarea: css`
    width: 100%;
    min-height: 140px;
    background-color: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 12px;
    color: var(--text-primary);
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
    box-sizing: border-box;
    
    &:focus {
      outline: none;
      border-color: var(--accent, #b4167e);
      box-shadow: 0 0 0 1px var(--accent, #b4167e);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,
  editorControls: css`
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 10px;
  `,
  limitControl: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  limitLabel: css`
    color: var(--text-secondary);
    font-size: 12px;
  `,
  limitInput: css`
    width: 110px;
    input {
      background: var(--input-bg) !important;
      border-color: var(--border-color) !important;
      color: var(--text-primary) !important;
      height: 34px !important;
      border-radius: 4px !important;
      font-size: 13px !important;
    }
  `,
  actionButtons: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  clearButton: css`
    background: var(--button-bg);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    height: 34px;
    padding: 0 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: var(--button-hover);
      border-color: var(--accent, #b4167e);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
  runButton: css`
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--accent, #b4167e);
    border: 1px solid var(--accent, #b4167e);
    color: var(--accent-contrast, #ffffff);
    height: 34px;
    padding: 0 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: var(--accent-hover, #9d126e);
      border-color: var(--accent-hover, #9d126e);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
  errorAlert: css`
    background-color: rgba(239, 68, 68, 0.15);
    color: var(--danger, #f87171);
    padding: 10px 12px;
    border-radius: 6px;
    border-left: 3px solid var(--danger, #ef4444);
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
  `,
  visualGrid: css`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 4px;
  `,
  visualCard: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--surface-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 14px 6px;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    color: var(--text-secondary);

    &:hover {
      border-color: var(--accent, #b4167e);
      background: var(--selection-bg);
      color: var(--text-primary);
    }
  `,
  visualCardActive: css`
    border: 2px solid var(--accent, #b4167e) !important;
    background: var(--selection-bg) !important;
    color: var(--accent, #b4167e) !important;
    box-shadow: 0 0 10px var(--focus-ring);
  `,
  visualCardIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  `,
  visualCardLabel: css`
    font-size: 12px;
    font-weight: 500;
    margin-top: 8px;
    text-align: center;
    color: inherit;
  `,
  configContainer: css`
    background: var(--surface-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  `,
  configHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  `,
  configBody: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 6px;
  `,
  formRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
  `,
  fieldLabel: css`
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 400;
    flex: 1;
    white-space: nowrap;
  `,
  selectWrapper: css`
    position: relative;
    width: 60%;
    max-width: 190px;
  `,
  nativeSelect: css`
    width: 100%;
    height: 32px;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 30px;
    padding: 0 28px 0 12px;
    appearance: none;
    cursor: pointer;
    outline: none;
    text-align: left;

    &:focus {
      border-color: var(--accent, #b4167e);
    }
  `,
  selectChevron: css`
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--text-secondary);
    font-size: 12px;
  `,
  segmentedContainer: css`
    display: flex;
    width: 60%;
    max-width: 190px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    overflow: hidden;
    background: var(--input-bg);
  `,
  segmentedBtn: css`
    flex: 1;
    height: 30px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0 4px;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      color: var(--text-primary);
    }
  `,
  segmentedBtnActive: css`
    background: var(--accent, #b4167e) !important;
    color: var(--accent-contrast, #ffffff) !important;
    font-weight: 600 !important;
  `,
  switchTrack: css`
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--border-color, #94a3b8);
    border: none;
    cursor: pointer;
    position: relative;
    padding: 0;
    transition: background-color 0.2s;
  `,
  switchTrackActive: css`
    background: var(--accent, #b4167e) !important;
  `,
  switchKnob: css`
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    transition: left 0.2s;
  `,
  switchKnobActive: css`
    left: 18px !important;
  `,
  numberInput: css`
    width: 60%;
    max-width: 190px;
    height: 32px;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 12px;
    padding: 0 10px;
    outline: none;
    box-sizing: border-box;

    &:focus {
      border-color: var(--accent, #b4167e);
    }
  `,
  colorPickerBtn: css`
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    color: var(--text-secondary);
  `,
  colorPreview: css`
    width: 28px;
    height: 18px;
    border-radius: 3px;
    display: inline-block;
  `,
  colorDropdown: css`
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--surface-elevated, var(--card-bg, #1e293b));
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    z-index: 50;
    box-shadow: var(--shadow, 0 4px 12px rgba(0, 0, 0, 0.25));
  `,
  colorSwatch: css`
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 0;

    &:hover {
      transform: scale(1.1);
    }
  `,
  thresholdsRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  thresholdBoxBtn: css`
    width: 28px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    padding: 0;

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
    }
  `,
  thresholdBox: css`
    width: 24px;
    height: 20px;
    border-radius: 4px;
    display: inline-block;
  `,
  applyButton: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 38px;
    background: var(--accent, #b4167e);
    border: 1px solid var(--accent, #b4167e);
    border-radius: 6px;
    color: var(--accent-contrast, #ffffff);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s, opacity 0.2s;
    margin-top: 6px;

    &:hover:not(:disabled) {
      background: var(--accent-hover, #9d126e);
      border-color: var(--accent-hover, #9d126e);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
});
