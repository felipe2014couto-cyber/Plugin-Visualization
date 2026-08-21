import React from 'react';
import { css } from '@emotion/css';
import { TransparentColorPicker } from './TransparentColorPicker';

interface ColorControlProps {
  label: string;
  color: string;
  fallback?: string;
  onChange: (color: string) => void;
  testId?: string;
}

/** Shared SVG-style color control with palette, hex input and transparency. */
export function ColorControl({ label, color, fallback = '#ffffff', onChange, testId }: ColorControlProps) {
  const pickerColor = color === 'transparent' ? color : toHexColor(color, fallback);
  return (
    <div className={styles.container}>
      <span className={styles.label}>{label}</span>
      <TransparentColorPicker color={pickerColor} fallbackColor={toHexColor(fallback, '#ffffff')} onChange={onChange} testId={testId ?? 'color'} />
    </div>
  );
}

const styles = {
  container: css`display: flex; flex-direction: column; gap: 4px;`,
  label: css`display:block; color:var(--text-secondary); font-size:10px;`,
};

function toHexColor(value: string, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(trimmed);
  if (rgb) {
    const channel = (part: string) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0');
    return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
  }
  return /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : '#ffffff';
}
