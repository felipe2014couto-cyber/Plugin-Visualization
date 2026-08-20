import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { HexColorPicker } from 'react-colorful';

export interface TransparentColorPickerProps {
  color: string;
  fallbackColor: string;
  onChange: (color: string) => void;
  testId: string;
}

export function TransparentColorPicker({ color, fallbackColor, onChange, testId }: TransparentColorPickerProps) {
  const styles = useStyles2(getStyles);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const transparent = color === 'transparent';
  const selectedColor = isHexColor(color) ? color : fallbackColor;
  const portalTarget = rootRef.current?.closest('[data-visualization-theme]') ?? globalThis.document?.body;

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeWhenOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      return;
    }
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const pickerWidth = 236;
      const pickerHeight = 270;
      const leftOfField = rect.left - pickerWidth - 8;
      const left = leftOfField >= 8
        ? leftOfField
        : Math.max(8, Math.min(rect.right + 8, window.innerWidth - pickerWidth - 8));
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - pickerHeight - 8));
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        data-testid={testId}
        aria-label="Selecionar cor"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={transparent ? styles.transparentSwatch : styles.swatch} style={transparent ? undefined : { background: selectedColor }} />
      </button>
      {open && portalTarget && createPortal(
        <div ref={popoverRef} className={styles.popover} style={position} data-testid={`${testId}-popover`} role="dialog" aria-label="Selecionar cor">
          <HexColorPicker color={selectedColor} onChange={onChange} />
          <div className={styles.hexRow}>
            <span className={styles.preview} style={{ background: transparent ? '#F0F0F0' : selectedColor }} />
            <input
              type="text"
              value={selectedColor.toUpperCase()}
              maxLength={7}
              aria-label="Código hexadecimal"
              onChange={(event) => {
                const next = normalizeHex(event.target.value);
                if (next) {
                  onChange(next);
                }
              }}
            />
          </div>
          <label className={styles.transparentOption}>
            <input
              type="checkbox"
              checked={transparent}
              data-testid={`${testId}-transparent`}
              onChange={(event) => onChange(event.target.checked ? 'transparent' : fallbackColor)}
            />
            Transparente
          </label>
        </div>,
        portalTarget,
      )}
    </div>
  );
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeHex(value: string): string | undefined {
  const normalized = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
  return isHexColor(normalized) ? normalized.toLowerCase() : undefined;
}

const getStyles = (_theme: GrafanaTheme2) => ({
  root: css`position: relative; width: 100%;`,
  trigger: css`
    display: flex;
    align-items: center;
    width: 100%;
    height: 27px;
    padding: 3px;
    border: 1px solid var(--border-color);
    border-radius: 0;
    background: var(--input-bg);
    cursor: pointer;
  `,
  swatch: css`display: block; width: 100%; height: 100%;`,
  transparentSwatch: css`
    display: block;
    width: 100%;
    height: 100%;
    background-color: #F0F0F0;
    background-image: linear-gradient(45deg, #a6a6a6 25%, transparent 25%), linear-gradient(-45deg, #a6a6a6 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #a6a6a6 75%), linear-gradient(-45deg, transparent 75%, #a6a6a6 75%);
    background-position: 0 0, 0 5px, 5px -5px, -5px 0;
    background-size: 10px 10px;
  `,
  popover: css`
    position: fixed;
    z-index: 30;
    width: 236px;
    box-sizing: border-box;
    padding: 10px;
    border: 1px solid var(--border-color, #718096);
    background: var(--surface-elevated, #202a36);
    color: var(--text-primary, #f8fafc);
    box-shadow: var(--shadow, 0 12px 28px rgba(0, 0, 0, 0.45));
    .react-colorful { width: 100%; }
    .react-colorful__saturation { height: 148px; border-radius: 0; }
    .react-colorful__hue { height: 12px; margin-top: 8px; border-radius: 0; }
    .react-colorful__pointer { width: 14px; height: 14px; }
  `,
  hexRow: css`display: flex; align-items: center; gap: 8px; margin-top: 10px; input { flex: 1; min-width: 0; height: 30px; border: 1px solid var(--border-color, #718096); border-radius: 0; color: var(--text-primary, #f8fafc); background: var(--input-bg, #111827); font-family: monospace; font-weight: 400; text-align: center; }`,
  preview: css`flex: 0 0 30px; width: 30px; height: 30px; border: 1px solid var(--border-color, #94a3b8); opacity: 0.9;`,
  transparentOption: css`display: flex; align-items: center; gap: 7px; margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--border-color, #516173); color: var(--text-primary, #f8fafc); font-size: 12px; font-weight: 400; input { width: 14px; height: 14px; accent-color: var(--accent, #d33b91); }`,
});
