import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  getValueVisualOptions,
  normalizeValueVisualOptions,
  type ValueVisualOptions,
} from '../../createValue';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';
import type { MultistateConfig } from '../../multistate';

export interface ValuePropertiesPanelProps {
  options: ValueVisualOptions;
  pointName: string;
  onChange: (patch: Partial<ValueVisualOptions>) => void;
  multistate?: MultistateConfig;
  onMultistateChange: (config: MultistateConfig) => void;
}

export function ValuePropertiesPanel({ options, pointName, onChange, multistate, onMultistateChange }: ValuePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const visual = getValueVisualOptions({ visual: options });

  return (
    <aside className={styles.panel} data-testid="value-properties-panel" aria-label="Formatação do Value">
      <div className={styles.panelHeader}>
        <span className={styles.title}>Value</span>
        <span className={styles.pointName}>{pointName}</span>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Casas decimais</span>
          <select
            data-testid="value-decimals"
            value={visual.decimals === null ? '' : String(visual.decimals)}
            onChange={(event) => onChange({ decimals: event.target.value === '' ? null : Number(event.target.value) })}
          >
            <option value="">Padrão</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((decimal) => (
              <option key={decimal} value={decimal}>{decimal}</option>
            ))}
          </select>
        </label>
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            data-testid="value-show-tag-name"
            checked={visual.showTagName}
            onChange={(event) => onChange({ showTagName: event.target.checked })}
          />
          <span>Mostrar nome da tag</span>
        </label>
        <label className={styles.field}>
          <span>Tamanho da fonte</span>
          <input
            type="number"
            min={8}
            max={96}
            step={1}
            data-testid="value-font-size"
            value={visual.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </label>
        <label className={styles.field}>
          <span>Cor do texto</span>
          <input
            type="color"
            data-testid="value-color"
            value={visual.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>Alinhamento</span>
          <select
            data-testid="value-text-align"
            value={visual.textAlign}
            onChange={(event) => onChange({
              textAlign: normalizeValueVisualOptions({ textAlign: event.target.value as ValueVisualOptions['textAlign'] }).textAlign,
            })}
          >
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
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
  panelHeader: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-bottom: 1px solid #c0c7cf;
    background: #d3d9e2;
  `,
  title: css`
    font-size: 12px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  pointName: css`
    color: #52657a;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

    select,
    input[type='number'] {
      width: 100%;
      box-sizing: border-box;
      min-height: 27px;
      padding: 3px 6px;
      border: 1px solid #aab4c0;
      border-radius: 0;
      background: #f4f5f6;
      color: #263c54;
    }

    input[type='color'] {
      width: 100%;
      height: 27px;
      padding: 2px;
      border: 1px solid #aab4c0;
      border-radius: 0;
      background: #f4f5f6;
    }
  `,
  checkboxField: css`
    display: flex;
    align-items: center;
    gap: 6px;
    color: #52657a;
    font-size: 10px;
  `,
});
