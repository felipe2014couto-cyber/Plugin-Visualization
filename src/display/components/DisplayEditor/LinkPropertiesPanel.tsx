import React from 'react';
import { css } from '@emotion/css';
import { LinkField } from './LinkField';

export function LinkPropertiesPanel({ value, openInNewTab = true, onChange, onOpenInNewTabChange }: { value?: string; openInNewTab?: boolean; onChange: (value: string) => void; onOpenInNewTabChange?: (value: boolean) => void }) {
  return <section className={styles.panel} data-testid="link-properties-panel">
    <div className={styles.title}>Link</div>
    <LinkField value={value} openInNewTab={openInNewTab} onChange={onChange} onOpenInNewTabChange={onOpenInNewTabChange} testId="element-link-url" />
    {value && <button type="button" className={styles.clear} onClick={() => onChange('')} data-testid="element-link-clear">Remover link</button>}
  </section>;
}

const styles = { panel: css`box-sizing:border-box; width:300px; flex:0 0 300px; min-width:0; min-height:0; max-height:100%; overflow-x:hidden; overflow-y:auto; scrollbar-gutter:stable; border-top:1px solid var(--border-color); border-left:1px solid var(--border-color); padding:14px; background:var(--panel-bg);`, title: css`margin-bottom:10px; color:var(--text-primary); font-size:12px; font-weight:600;`, clear: css`margin-top:10px; min-height:28px; border:1px solid var(--border-color); background:var(--button-bg); color:var(--text-primary); font-size:10px;` };
