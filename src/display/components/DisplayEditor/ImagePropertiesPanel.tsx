import React from 'react';
import { css } from '@emotion/css';
import type { ImageProperties } from '../../createImage';
import { RotationControl } from './RotationControl';

export function ImagePropertiesPanel({ properties, onChange }: { properties: ImageProperties; onChange: (patch: Partial<ImageProperties>) => void }) {
  return <aside className={styles.panel} data-testid="image-properties-panel" aria-label="Configuração da Imagem">
    <div className={styles.header}>Imagem</div>
    <RotationControl value={properties.rotation} onChange={(rotation) => onChange({ rotation })} testId="image-rotation" />
  </aside>;
}

const styles = { panel: css`flex:0 0 232px; border-left:1px solid var(--border-color); background:var(--panel-bg); color:var(--text-primary); overflow:auto;`, header: css`padding:10px 12px; border-bottom:1px solid var(--border-color); font-size:12px; font-weight:600;` };
