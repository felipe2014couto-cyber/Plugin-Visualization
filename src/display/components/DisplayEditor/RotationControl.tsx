import React from 'react';
import { css } from '@emotion/css';

export function RotationControl({ value = 0, onChange, testId = 'rotation' }: { value?: number; onChange: (value: number) => void; testId?: string }) {
  const rotation = Number.isFinite(value) ? value : 0;
  return <div className={styles.container}>
    <label className={styles.field}>
      <span>Rotação ({Math.round(rotation)}°)</span>
      <input type="range" min="-180" max="180" step="1" value={rotation} onChange={(event) => onChange(Number(event.target.value))} data-testid={testId} />
    </label>
    <button type="button" className={styles.reset} onClick={() => onChange(0)} data-testid={`${testId}-reset`}>Restaurar 0°</button>
  </div>;
}

const styles = {
  container: css`display:flex; flex-direction:column; gap:5px;`,
  field: css`display:flex; flex-direction:column; gap:3px; color:var(--text-secondary); font-size:10px; input[type='range'] { width:100%; accent-color:var(--accent); }`,
  reset: css`align-self:flex-start; min-height:24px; padding:2px 7px; border:1px solid var(--border-color); border-radius:3px; background:var(--button-bg); color:var(--text-primary); font-size:10px; cursor:pointer;`,
};
