import React from 'react';
import { css } from '@emotion/css';
import { TabsBar, Tab, Field, Input, Switch } from '@grafana/ui';
import { SqlChartSettings } from '../../../components/SqlQuery/SqlChartSettings';
import type { SqlTableProperties } from '../../createSqlTable';

export interface SqlTablePropertiesPanelProps {
  properties: SqlTableProperties;
  onChange: (patch: Partial<SqlTableProperties>) => void;
}

export function SqlTablePropertiesPanel({ properties, onChange }: SqlTablePropertiesPanelProps) {
  const styles = getStyles();

  const columns = properties.result?.rows?.[0] ? Object.keys(properties.result.rows[0]) : [];
  const viewMode = properties.viewMode ?? 'table';

  return (
    <aside className={styles.panel} data-testid="sql-table-properties-panel" aria-label="Propriedades da Tabela SQL">
      <div className={styles.header}>Tabela SQL</div>
      
      <section className={styles.section}>
        <TabsBar>
          <Tab 
            label="Tabela" 
            active={viewMode === 'table'} 
            onChangeTab={() => onChange({ viewMode: 'table' })} 
            icon="table" 
          />
          <Tab 
            label="Gráfico XY" 
            active={viewMode === 'xy'} 
            onChangeTab={() => onChange({ viewMode: 'xy' })} 
            icon="gf-interpolation-linear" 
          />
          <Tab 
            label="Time Series" 
            active={viewMode === 'timeseries'} 
            onChangeTab={() => onChange({ viewMode: 'timeseries' })} 
            icon="chart-line" 
          />
        </TabsBar>
      </section>

      <section className={styles.section}>
        <Field label="Título">
          <Input 
            value={properties.title || ''} 
            onChange={(e) => onChange({ title: e.currentTarget.value })} 
            placeholder="Título padrão"
          />
        </Field>
      </section>

      {viewMode !== 'table' && (
        <section className={styles.section}>
          <Field label="Tamanho da Fonte (px)">
            <Input 
              type="number" 
              value={properties.fontSize ?? 12} 
              onChange={(e) => onChange({ fontSize: Number(e.currentTarget.value) })} 
              min={8}
            />
          </Field>

          <Field label="Itens por Página (Paginação)">
            <Input 
              type="number" 
              value={properties.paginationSize || ''} 
              onChange={(e) => onChange({ paginationSize: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })} 
              min={0}
              placeholder="Desativado"
            />
          </Field>

          <Field label="Marcador de Tendência (Arrastável)" description="Exibe uma linha vertical interativa.">
            <Switch 
              value={properties.showTrendMarker ?? false} 
              onChange={(e) => onChange({ showTrendMarker: e.currentTarget.checked })} 
            />
          </Field>
        </section>
      )}

      {viewMode !== 'table' && (
        <SqlChartSettings
          columns={columns}
          xAxis={properties.xAxis}
          yAxes={properties.yAxes ?? []}
          onXAxisChange={(val) => onChange({ xAxis: val })}
          onYAxesChange={(vals) => onChange({ yAxes: vals })}
        />
      )}
    </aside>
  );
}

function getStyles() { 
  return { 
    panel: css`
      flex: 0 0 300px;
      width: 300px;
      min-width: 0;
      min-height: 0;
      max-height: 100%;
      box-sizing: border-box;
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-gutter: stable;
      border-left: 1px solid var(--border-color);
      background: var(--panel-bg);
      color: var(--text-primary);
    `, 
    header: css`
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 600;
      display: flex;
      justify-content: space-between; 
    `, 
    section: css`
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px; 
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: var(--text-secondary);
      } 
      select, input {
        min-height: 28px;
        background: var(--input-bg);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        box-sizing: border-box;
      }
    `
  }; 
}
