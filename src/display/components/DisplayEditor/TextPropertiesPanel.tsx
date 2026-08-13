import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { TextProperties } from '../../createText';

export function TextPropertiesPanel({ properties, onChange }: { properties: TextProperties; onChange: (patch: Partial<TextProperties>) => void }) {
  const styles = useStyles2(getStyles);
  return <aside className={styles.panel} data-testid="text-properties-panel" aria-label="Configuração do Texto">
    <div className={styles.header}>Texto</div>
    <label className={styles.field}>Conteúdo<textarea value={properties.text} onChange={(e) => onChange({ text: e.target.value })} data-testid="text-content" /></label>
    <label className={styles.field}>Cor<input type="color" value={properties.color} onChange={(e) => onChange({ color: e.target.value })} data-testid="text-color" /></label>
    <label className={styles.field}>Tamanho<input type="number" min="8" max="120" value={properties.fontSize} onChange={(e) => onChange({ fontSize: Math.max(8, Math.min(120, Number(e.target.value) || properties.fontSize)) })} data-testid="text-font-size" /></label>
    <label className={styles.field}>Alinhamento<select value={properties.textAlign} onChange={(e) => onChange({ textAlign: e.target.value as TextProperties['textAlign'] })} data-testid="text-align"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
  </aside>;
}
const getStyles = (theme: GrafanaTheme2) => ({ panel: css`flex: 0 0 232px; border-left: 1px solid var(--border-color); background: var(--panel-bg); color: var(--text-primary); overflow: auto;`, header: css`padding: 10px 12px; border-bottom: 1px solid var(--border-color); font-size: 12px; font-weight: ${theme.typography.fontWeightMedium};`, field: css`display: flex; flex-direction: column; gap: 4px; padding: 8px 12px 0; color: var(--text-secondary); font-size: 10px; textarea, input, select { box-sizing: border-box; width: 100%; min-height: 28px; color: var(--text-primary); background: var(--input-bg); border: 1px solid var(--border-color); } textarea { min-height: 60px; resize: vertical; }` });
