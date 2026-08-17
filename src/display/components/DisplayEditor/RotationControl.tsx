import React from 'react';
import { css } from '@emotion/css';

export function RotationControl({ value = 0, onChange, testId = 'rotation' }: { value?: number; onChange: (value: number) => void; testId?: string }) {
  const rotation = Number.isFinite(value) ? value : 0;
  return <label className={styles.field}>
    <span>Rotação ({Math.round(rotation)}°)</span>
    <input type="range" min="-180" max="180" step="1" value={rotation} onChange={(event) => onChange(Number(event.target.value))} data-testid={testId} />
  </label>;
}

const styles = { field: css`display:flex; flex-direction:column; gap:3px; color:var(--text-secondary); font-size:10px; input[type='range'] { width:100%; accent-color:var(--accent); }` };
