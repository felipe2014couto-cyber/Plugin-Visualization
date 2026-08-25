import React from 'react';
import { css } from '@emotion/css';
import type { ImageProperties } from '../../createImage';
import { RotationControl } from './RotationControl';
import { LinkField } from './LinkField';

export function ImagePropertiesPanel({ properties, onChange }: { properties: ImageProperties; onChange: (patch: Partial<ImageProperties>) => void }) {
  return <aside className={styles.panel} data-testid="image-properties-panel" aria-label="Configuração da Imagem">
    <div className={styles.header}>Imagem</div>
    <div className={styles.fields}>
      <RotationControl value={properties.rotation} onChange={(rotation) => onChange({ rotation })} testId="image-rotation" />
      <LinkField value={typeof properties.linkUrl === 'string' ? properties.linkUrl : undefined} openInNewTab={properties.openInNewTab !== false} onChange={(linkUrl) => onChange({ linkUrl })} onOpenInNewTabChange={(openInNewTab) => onChange({ openInNewTab })} testId="image-link-url" />
    </div>
  </aside>;
}

const styles = {
  panel: css`width:300px; flex:0 0 300px; min-width:0; min-height:0; max-height:100%; box-sizing:border-box; border-left:1px solid var(--border-color); background:var(--panel-bg); color:var(--text-primary); overflow-x:hidden; overflow-y:auto; scrollbar-gutter:stable;`,
  header: css`padding:12px 14px; border-bottom:1px solid var(--border-color); background:var(--panel-header-bg); font-size:12px; font-weight:600;`,
  fields: css`display:flex; flex-direction:column; gap:12px; padding:14px;`,
};
