import React from 'react';
import { css } from '@emotion/css';

export function LinkField({ value, onChange, testId = 'element-link-url' }: { value?: string; onChange: (value: string) => void; testId?: string }) {
  return <label className={styles.field}><span>Link</span><input type="url" value={value ?? ''} placeholder="https://..." onChange={(event) => onChange(event.target.value)} data-testid={testId} /></label>;
}

const styles = { field: css`display:flex; flex-direction:column; gap:3px; color:var(--text-secondary); font-size:10px; input { box-sizing:border-box; width:100%; min-height:27px; padding:3px 6px; border:1px solid var(--border-color); background:var(--input-bg); color:var(--text-primary); }` };
