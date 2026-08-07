import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { BarOrientation } from '../../scaleOptions';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';
import type { MultistateConfig } from '../../multistate';

export interface ScalePropertiesPanelProps {
  kind: 'Gauge' | 'Bar';
  minimum: number;
  maximum: number;
  showValue: boolean;
  showTagName: boolean;
  decimals: number | null;
  orientation?: BarOrientation;
  onChange: (patch: {
    minimum?: number;
    maximum?: number;
    showValue?: boolean;
    showTagName?: boolean;
    decimals?: number | null;
    orientation?: BarOrientation;
  }) => void;
  multistate?: MultistateConfig;
  onMultistateChange: (config: MultistateConfig) => void;
}

export function ScalePropertiesPanel({
  kind,
  minimum,
  maximum,
  showValue,
  showTagName,
  decimals,
  orientation,
  onChange,
  multistate,
  onMultistateChange,
}: ScalePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  return (
    <aside className={styles.panel} data-testid={`${kind.toLowerCase()}-properties-panel`} aria-label={`Configuração do ${kind}`}>
      <div className={styles.header}>
        <span className={styles.title}>{kind}</span>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Mínimo</span>
          <input type="number" value={minimum} onChange={(event) => onChange({ minimum: Number(event.target.value) })} data-testid={`${kind.toLowerCase()}-minimum`} />
        </label>
        <label className={styles.field}>
          <span>Máximo</span>
          <input type="number" value={maximum} onChange={(event) => onChange({ maximum: Number(event.target.value) })} data-testid={`${kind.toLowerCase()}-maximum`} />
        </label>
        <label className={styles.field}>
          <span>Casas decimais</span>
          <select value={decimals === null ? '' : String(decimals)} onChange={(event) => onChange({ decimals: event.target.value === '' ? null : Number(event.target.value) })} data-testid={`${kind.toLowerCase()}-decimals`}>
            <option value="">Padrão</option>
            {[0, 1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {kind === 'Bar' && (
          <label className={styles.field}>
            <span>Orientação</span>
            <select value={orientation ?? 'vertical'} onChange={(event) => onChange({ orientation: event.target.value as BarOrientation })} data-testid="bar-orientation">
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
        )}
        <label className={styles.checkbox}>
          <input type="checkbox" checked={showValue} onChange={(event) => onChange({ showValue: event.target.checked })} data-testid={`${kind.toLowerCase()}-show-value`} />
          <span>Mostrar valor</span>
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={showTagName} onChange={(event) => onChange({ showTagName: event.target.checked })} data-testid={`${kind.toLowerCase()}-show-tag-name`} />
          <span>Mostrar tag</span>
        </label>
      </div>
      <MultistatePropertiesPanel config={multistate} onChange={onMultistateChange} />
    </aside>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    flex: 0 0 232px;
    min-width: 0;
    border-left: 1px solid #aeb7c3;
    background: #e3e5e8;
    color: ${theme.colors.text.primary};
    overflow: auto;
  `,
  header: css`
    padding: 10px 12px;
    border-bottom: 1px solid #c0c7cf;
    background: #d3d9e2;
  `,
  title: css`
    font-size: 12px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  fields: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: #52657a;
    font-size: 10px;

    input,
    select {
      box-sizing: border-box;
      min-height: 27px;
      padding: 3px 6px;
      border: 1px solid #aab4c0;
      border-radius: 0;
      background: #f4f5f6;
      color: #263c54;
    }
  `,
  checkbox: css`
    display: flex;
    align-items: center;
    gap: 6px;
    color: #52657a;
    font-size: 10px;
  `,
});
