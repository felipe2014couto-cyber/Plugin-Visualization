import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { RectangleProperties } from '../../createRectangle';
import type { MultistateConfig } from '../../multistate';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';
import { ColorControl } from './ColorControl';
import { RotationControl } from './RotationControl';

export interface RectanglePropertiesPanelProps {
  fill: string;
  stroke: string;
  shape: RectangleProperties['shape'];
  rotation?: number;
  pointName?: string;
  onChange: (patch: Partial<RectangleProperties>) => void;
  multistate?: MultistateConfig;
  onMultistateChange: (config: MultistateConfig) => void;
}

export function RectanglePropertiesPanel({ fill, stroke, shape, rotation = 0, pointName, onChange, multistate, onMultistateChange }: RectanglePropertiesPanelProps) {
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
        <ColorControl label="Preenchimento" color={fill} onChange={(value) => onChange({ fill: value })} testId="rectangle-fill" />
        <ColorControl label="Contorno" color={stroke} onChange={(value) => onChange({ stroke: value })} testId="rectangle-stroke" />
        <RotationControl value={rotation} onChange={(value) => onChange({ rotation })} testId="rectangle-rotation" />
      </div>
      {pointName ? (
        <MultistatePropertiesPanel config={multistate} onChange={onMultistateChange} />
      ) : (
        <div className={styles.hint}>Selecione um PI Point antes de inserir a forma para habilitar o Multistate.</div>
      )}
    </aside>
  );
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
