import React, { useRef } from 'react';
import { css } from '@emotion/css';

interface ColorControlProps {
  label: string;
  color: string;
  fallback?: string;
  onChange: (color: string) => void;
  testId?: string;
}

/** Color input with an explicit transparent state, while retaining the last opaque color. */
export function ColorControl({ label, color, fallback = '#ffffff', onChange, testId }: ColorControlProps) {
  const lastColor = useRef(toColorInputValue(color, fallback));
  if (color !== 'transparent') {
    lastColor.current = toColorInputValue(color, fallback);
  }
  const transparent = color === 'transparent';

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        <span>{label}</span>
        <input
          type="color"
          value={transparent ? lastColor.current : toColorInputValue(color, fallback)}
          onChange={(event) => onChange(event.target.value)}
          data-testid={testId}
        />
      </label>
      <label className={styles.transparent}>
        <input
          type="checkbox"
          checked={transparent}
          onChange={(event) => onChange(event.target.checked ? 'transparent' : lastColor.current)}
          data-testid={testId ? `${testId}-transparent` : undefined}
        />
        Transparente
      </label>
    </div>
  );
}

function toColorInputValue(value: string, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(trimmed);
  if (rgb) {
    const hex = (channel: string) => Number(channel).toString(16).padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(fallback)) {
    return fallback;
  }
  return '#ffffff';
}

const styles = {
  container: css`display: flex; flex-direction: column; gap: 4px;`,
  label: css`display: flex; flex-direction: column; gap: 3px; color: var(--text-secondary); font-size: 10px; input { width: 100%; height: 27px; box-sizing: border-box; padding: 2px; border: 1px solid var(--border-color); border-radius: 0; background: var(--input-bg); }`,
  transparent: css`display: flex; align-items: center; gap: 5px; color: var(--text-secondary); font-size: 10px; input { width: 14px; height: 14px; margin: 0; }`,
};
