import React from 'react';
import { css } from '@emotion/css';
import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { DisplaySurface } from '../../displaySurface';
import { TransparentColorPicker } from './TransparentColorPicker';

export interface CanvasPropertiesPanelProps {
  surface: DisplaySurface;
  onChange: (patch: Partial<DisplaySurface>) => void;
  onClose?: () => void;
}

const PRESET_COLORS = [
  { label: 'Padrão do Tema', value: '#1f1f1f' },
  { label: 'Preto', value: '#000000' },
  { label: 'Cinza Escuro', value: '#111923' },
  { label: 'Branco', value: '#ffffff' },
  { label: 'Transparente', value: 'transparent' },
];

export function CanvasPropertiesPanel({ surface, onChange, onClose }: CanvasPropertiesPanelProps) {
  const styles = useStyles2(getStyles);

  return (
    <aside className={styles.panel} data-testid="canvas-properties-panel" aria-label="Configuração da tela">
      <div className={styles.header}>
        <div className={styles.headerTitleRow}>
          <span className={styles.title}>Tela / Plano de Fundo</span>
          {onClose && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              title="Fechar painel"
              aria-label="Fechar painel"
              data-testid="canvas-panel-close"
            >
              ✕
            </button>
          )}
        </div>
        <span className={styles.subtitle}>Configurações globais do display</span>
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Cor do fundo da tela</span>
          <TransparentColorPicker
            color={surface.backgroundColor || '#1f1f1f'}
            fallbackColor="#1f1f1f"
            testId="canvas-bg-color"
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />
        </label>

        <div className={styles.presetGroup}>
          <span>Cores rápidas:</span>
          <div className={styles.presetButtons}>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`${styles.presetButton} ${surface.backgroundColor?.toLowerCase() === preset.value.toLowerCase() ? styles.presetButtonActive : ''}`}
                onClick={() => onChange({ backgroundColor: preset.value })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.dimensionSection}>
          <span className={styles.sectionTitle}>Dimensões (Resolução)</span>
          <div className={styles.dimensionRow}>
            <label className={styles.dimensionField}>
              <span>Largura (px)</span>
              <input
                type="number"
                min="100"
                max="10000"
                step="10"
                value={surface.width}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val > 0) {
                    onChange({ width: val });
                  }
                }}
                className={styles.numberInput}
              />
            </label>
            <label className={styles.dimensionField}>
              <span>Altura (px)</span>
              <input
                type="number"
                min="100"
                max="10000"
                step="10"
                value={surface.height}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val > 0) {
                    onChange({ height: val });
                  }
                }}
                className={styles.numberInput}
              />
            </label>
          </div>
        </div>
      </div>
    </aside>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    flex: 0 0 300px;
    width: 300px;
    min-width: 0;
    min-height: 0;
    max-height: 100%;
    box-sizing: border-box;
    border-left: 1px solid var(--border-color);
    background: var(--panel-bg);
    color: var(--text-primary);
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
  `,
  header: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-color);
    background: var(--panel-header-bg);
  `,
  headerTitleRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  `,
  title: css`font-size: 12px; font-weight: ${theme.typography.fontWeightMedium};`,
  closeButton: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    line-height: 1;
    &:hover {
      background: var(--button-hover-bg, rgba(255, 255, 255, 0.1));
      color: var(--text-primary);
    }
  `,
  subtitle: css`color: var(--text-secondary); font-size: 10px;`,
  fields: css`display: flex; flex-direction: column; gap: 14px; padding: 14px;`,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-secondary);
    font-size: 10px;
  `,
  presetGroup: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 10px;
  `,
  presetButtons: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  `,
  presetButton: css`
    padding: 3px 7px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--button-bg);
    color: var(--text-primary);
    font-size: 9px;
    cursor: pointer;
    &:hover {
      background: var(--button-hover-bg, rgba(255, 255, 255, 0.1));
    }
  `,
  presetButtonActive: css`
    background: var(--accent, #6e9fff) !important;
    color: #ffffff !important;
    border-color: var(--accent, #6e9fff) !important;
  `,
  dimensionSection: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--border-color);
    padding-top: 12px;
  `,
  sectionTitle: css`
    font-size: 11px;
    font-weight: ${theme.typography.fontWeightMedium};
    color: var(--text-primary);
  `,
  dimensionRow: css`
    display: flex;
    gap: 8px;
  `,
  dimensionField: css`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--text-secondary);
    font-size: 10px;
  `,
  numberInput: css`
    width: 100%;
    height: 27px;
    padding: 3px 6px;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    background: var(--input-bg);
    color: var(--text-primary);
    font-size: 11px;
  `,
});
