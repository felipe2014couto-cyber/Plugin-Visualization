import React from 'react';
import { css } from '@emotion/css';

export function LinkField({ value, onChange, openInNewTab = true, onOpenInNewTabChange, testId = 'element-link-url' }: { value?: string; onChange: (value: string) => void; openInNewTab?: boolean; onOpenInNewTabChange?: (value: boolean) => void; testId?: string }) {
  return <div className={styles.container}>
    <label className={styles.field}><span>Link</span><input type="url" value={value ?? ''} placeholder="https://..." onChange={(event) => onChange(event.target.value)} data-testid={testId} /></label>
    {onOpenInNewTabChange && <label className={styles.checkbox}><input type="checkbox" checked={openInNewTab} onChange={(event) => onOpenInNewTabChange(event.target.checked)} data-testid={`${testId}-new-tab`} /><span>Abrir em uma nova guia</span></label>}
  </div>;
}

const styles = { container: css`display:flex; flex-direction:column; gap:7px;`, field: css`display:flex; flex-direction:column; gap:4px; color:var(--text-secondary); font-size:10px; input { box-sizing:border-box; width:100%; min-height:27px; padding:3px 6px; border:1px solid var(--border-color); background:var(--input-bg); color:var(--text-primary); }`, checkbox: css`display:flex; align-items:center; gap:6px; color:var(--text-secondary); font-size:10px; input { width:14px; height:14px; margin:0; }` };
