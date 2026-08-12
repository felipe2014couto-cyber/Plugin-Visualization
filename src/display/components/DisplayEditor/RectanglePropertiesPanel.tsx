import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { RectangleProperties } from '../../createRectangle';

export interface RectanglePropertiesPanelProps {
  fill: string;
  stroke: string;
  onChange: (patch: Partial<RectangleProperties>) => void;
}

export function RectanglePropertiesPanel({ fill, stroke, onChange }: RectanglePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  return (
    <aside className={styles.panel} data-testid="rectangle-properties-panel" aria-label="Configuração do Rectangle">
      <div className={styles.header}>
        <span className={styles.title}>Rectangle</span>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Preenchimento</span>
          <input type="color" value={toColorInputValue(fill)} onChange={(event) => onChange({ fill: event.target.value })} data-testid="rectangle-fill" />
        </label>
        <label className={styles.field}>
          <span>Contorno</span>
          <input type="color" value={toColorInputValue(stroke)} onChange={(event) => onChange({ stroke: event.target.value })} data-testid="rectangle-stroke" />
        </label>
      </div>
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

    input[type='color'] {
      width: 100%;
      height: 27px;
      padding: 2px;
      border: 1px solid var(--border-color);
      border-radius: 0;
      background: var(--input-bg);
    }
  `,
});
