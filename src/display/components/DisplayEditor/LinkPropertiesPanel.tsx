import React from 'react';
import { css } from '@emotion/css';

export function LinkPropertiesPanel({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return <section className={styles.panel} data-testid="link-properties-panel">
    <div className={styles.title}>Link</div>
    <label className={styles.field}><span>URL</span><input type="url" value={value ?? ''} placeholder="https://..." onChange={(event) => onChange(event.target.value)} data-testid="element-link-url" /></label>
    {value && <button type="button" className={styles.clear} onClick={() => onChange('')} data-testid="element-link-clear">Remover link</button>}
  </section>;
}

const styles = { panel: css`box-sizing:border-box; width:280px; flex:0 0 280px; min-width:0; overflow-x:hidden; border-top:1px solid var(--border-color); padding:12px; background:var(--panel-bg);`, title: css`margin-bottom:8px; color:var(--text-primary); font-size:11px; font-weight:600;`, field: css`display:flex; flex-direction:column; gap:4px; color:var(--text-secondary); font-size:10px; input { box-sizing:border-box; width:100%; max-width:100%; min-height:27px; padding:3px 6px; border:1px solid var(--border-color); background:var(--input-bg); color:var(--text-primary); }`, clear: css`margin-top:8px; min-height:24px; border:1px solid var(--border-color); background:var(--button-bg); color:var(--text-primary); font-size:10px;` };
