import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { TextProperties } from '../../createText';
import { ColorControl } from './ColorControl';
import { RotationControl } from './RotationControl';

export function TextPropertiesPanel({ properties, onChange }: { properties: TextProperties; onChange: (patch: Partial<TextProperties>) => void }) {
  const styles = useStyles2(getStyles);
  return <aside className={styles.panel} data-testid="text-properties-panel" aria-label="Configuração do Texto">
    <div className={styles.header}>Texto</div>
    <div className={styles.fields}>
      <label className={styles.field}>Conteúdo<textarea value={properties.text} onChange={(e) => onChange({ text: e.target.value })} data-testid="text-content" /></label>
      <ColorControl label="Cor" color={properties.color} onChange={(color) => onChange({ color })} testId="text-color" />
      <label className={styles.field}>Tamanho<input type="number" min="8" max="120" value={properties.fontSize} onChange={(e) => onChange({ fontSize: Math.max(8, Math.min(120, Number(e.target.value) || properties.fontSize)) })} data-testid="text-font-size" /></label>
      <label className={styles.field}>Alinhamento<select value={properties.textAlign} onChange={(e) => onChange({ textAlign: e.target.value as TextProperties['textAlign'] })} data-testid="text-align"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
      <RotationControl value={properties.rotation} onChange={(rotation) => onChange({ rotation })} testId="text-rotation" />
    </div>
  </aside>;
}
const getStyles = (theme: GrafanaTheme2) => ({ panel: css`width:280px; flex: 0 0 280px; min-width:0; border-left: 1px solid var(--border-color); background: var(--panel-bg); color: var(--text-primary); overflow-x:hidden; overflow-y:auto;`, header: css`padding: 10px 12px; border-bottom: 1px solid var(--border-color); background:var(--panel-header-bg); font-size: 12px; font-weight: ${theme.typography.fontWeightMedium};`, fields: css`display:flex; flex-direction:column; gap:12px; padding:12px; min-width:0;`, field: css`display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); font-size: 10px; textarea, input, select { box-sizing: border-box; width: 100%; max-width:100%; min-height: 28px; color: var(--text-primary); background: var(--input-bg); border: 1px solid var(--border-color); } textarea { min-height: 60px; resize: vertical; }` });
