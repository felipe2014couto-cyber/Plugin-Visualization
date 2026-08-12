import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { RectangleProperties } from '../../createRectangle';
import type { MultistateConfig } from '../../multistate';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';

export interface RectanglePropertiesPanelProps {
  fill: string;
  stroke: string;
  shape: RectangleProperties['shape'];
  pointName?: string;
  onChange: (patch: Partial<RectangleProperties>) => void;
  multistate?: MultistateConfig;
  onMultistateChange: (config: MultistateConfig) => void;
}

export function RectanglePropertiesPanel({ fill, stroke, shape, pointName, onChange, multistate, onMultistateChange }: RectanglePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  return (
    <aside className={styles.panel} data-testid="rectangle-properties-panel" aria-label="Configuração do Rectangle">
      <div className={styles.header}>
        <span className={styles.title}>Forma geométrica</span>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Forma</span>
          <select value={shape} data-testid="geometric-shape-type" onChange={(event) => onChange({ shape: event.target.value as RectangleProperties['shape'] })}>
            <option value="rectangle">Retângulo</option>
            <option value="ellipse">Elipse</option>
            <option value="triangle">Triângulo</option>
          </select>
        </label>
        {pointName && <div className={styles.binding}>PI Point: {pointName}</div>}
        <label className={styles.field}>
          <span>Preenchimento</span>
          <input type="color" value={toColorInputValue(fill)} onChange={(event) => onChange({ fill: event.target.value })} data-testid="rectangle-fill" />
        </label>
        <label className={styles.field}>
          <span>Contorno</span>
          <input type="color" value={toColorInputValue(stroke)} onChange={(event) => onChange({ stroke: event.target.value })} data-testid="rectangle-stroke" />
        </label>
      </div>
      {pointName ? (
        <MultistatePropertiesPanel config={multistate} onChange={onMultistateChange} />
      ) : (
        <div className={styles.hint}>Selecione um PI Point antes de inserir a forma para habilitar o Multistate.</div>
      )}
    </aside>
  );
}

function toColorInputValue(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
    return trimmed;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,[^)]*)?\)$/i.exec(trimmed);
  if (rgb) {
    const toHex = (channel: string) => Number(channel).toString(16).padStart(2, '0');
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
  }
  return '#6e9fff';
}

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    flex: 0 0 232px;
    min-width: 0;
    border-left: 1px solid var(--border-color);
    background: var(--panel-bg);
    color: var(--text-primary);
    overflow: auto;
  `,
  header: css`
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color);
    background: var(--panel-header-bg);
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
    color: var(--text-secondary);
    font-size: 10px;

    input[type='color'], select {
      width: 100%;
      height: 27px;
      padding: 2px;
      border: 1px solid var(--border-color);
      border-radius: 0;
      background: var(--input-bg);
      color: var(--text-primary);
      color-scheme: inherit;
    }

    select option {
      background: var(--input-bg);
      color: var(--text-primary);
    }
  `,
  binding: css`color: var(--text-secondary); font-size: 10px; overflow-wrap: anywhere;`,
  hint: css`border-top: 1px solid var(--border-color); padding: 10px 12px; color: var(--text-secondary); font-size: 9px; line-height: 1.4;`,
});
