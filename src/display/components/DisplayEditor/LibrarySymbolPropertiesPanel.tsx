import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { PiPointSearchResult } from '../../../pi/piDataSource';
import { createPiPointBinding, isPiPointBinding } from '../../../pi/piPointBinding';
import { DEFAULT_LIBRARY_SYMBOL_COLOR, type LibrarySymbolProperties } from '../../createLibrarySymbol';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';
import { TransparentColorPicker } from './TransparentColorPicker';
import type { MultistateConfig } from '../../multistate';
import { RotationControl } from './RotationControl';
import { LinkField } from './LinkField';
import type { PiDigitalStatesResult } from '../../../pi/piDataSource';

export interface LibrarySymbolPropertiesPanelProps {
  properties: LibrarySymbolProperties;
  selectedPiPoint?: PiPointSearchResult | null;
  calculationName?: string;
  loadDigitalStates?: (binding: import('../../../pi/piPointBinding').PiPointBinding) => Promise<PiDigitalStatesResult>;
  onChange: (patch: Partial<LibrarySymbolProperties>) => void;
  onMultistateChange: (config: MultistateConfig) => void;
}

export function LibrarySymbolPropertiesPanel({
  properties,
  selectedPiPoint,
  calculationName,
  loadDigitalStates,
  onChange,
  onMultistateChange,
}: LibrarySymbolPropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const binding = isPiPointBinding(properties.binding) ? properties.binding : undefined;
  const selectedBinding = selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined;
  const isBound = Boolean(binding || properties.calculationId);

  return (
    <aside className={styles.panel} data-testid="library-symbol-properties-panel" aria-label="Configuração do símbolo">
      <div className={styles.header}>
        <span className={styles.title}>Símbolo</span>
        <span className={styles.name}>{properties.name}</span>
      </div>
      <div className={styles.fields}>
        <RotationControl value={properties.rotation} onChange={(rotation) => onChange({ rotation })} testId="library-symbol-rotation" />
        <div className={styles.mirrorGroup}>
          <span>Espelhar</span>
          <div className={styles.mirrorButtons}>
            <button
              type="button"
              className={`${styles.mirrorButton} ${properties.flipHorizontal ? styles.mirrorButtonActive : ''}`}
              onClick={() => onChange({ flipHorizontal: !properties.flipHorizontal })}
              title="Espelhar horizontalmente"
              data-testid="library-symbol-flip-h"
            >
              ↔ Horizontal
            </button>
            <button
              type="button"
              className={`${styles.mirrorButton} ${properties.flipVertical ? styles.mirrorButtonActive : ''}`}
              onClick={() => onChange({ flipVertical: !properties.flipVertical })}
              title="Espelhar verticalmente"
              data-testid="library-symbol-flip-v"
            >
              ↕ Vertical
            </button>
          </div>
        </div>
        <LinkField value={typeof properties.linkUrl === 'string' ? properties.linkUrl : undefined} openInNewTab={properties.openInNewTab !== false} onChange={(linkUrl) => onChange({ linkUrl })} onOpenInNewTabChange={(openInNewTab) => onChange({ openInNewTab })} testId="library-symbol-link-url" />
        <label className={styles.field}>
          <span>Cor do símbolo</span>
          <TransparentColorPicker color={properties.color} fallbackColor={DEFAULT_LIBRARY_SYMBOL_COLOR} testId="library-symbol-color" onChange={(color) => onChange({ color })} />
        </label>
        {binding ? (
          <div className={styles.bindingRow}>
            <span className={styles.binding}>PI Point: {binding.pointName}</span>
            <button
              type="button"
              className={styles.unbindButton}
              data-testid="library-symbol-unbind-point"
              onClick={() => onChange({ binding: undefined, calculationId: undefined })}
            >
              Desvincular
            </button>
          </div>
        ) : properties.calculationId ? (
          <div className={styles.bindingRow}>
            <span className={styles.binding}>Cálculo: {calculationName || properties.calculationId}</span>
            <button
              type="button"
              className={styles.unbindButton}
              data-testid="library-symbol-unbind-calc"
              onClick={() => onChange({ binding: undefined, calculationId: undefined })}
            >
              Desvincular
            </button>
          </div>
        ) : selectedBinding ? (
          <button type="button" className={styles.bindButton} data-testid="library-symbol-bind-point" onClick={() => onChange({ binding: selectedBinding })}>
            Vincular PI Point selecionado
          </button>
        ) : (
          <div className={styles.hint}>Arraste uma Tag PI ou de Cálculo sobre o símbolo para habilitar o Multistate.</div>
        )}
      </div>
      {isBound ? (
        <MultistatePropertiesPanel config={properties.multistate} binding={binding} loadDigitalStates={loadDigitalStates} onChange={onMultistateChange} />
      ) : (
        <div className={styles.hint}>Depois de vincular um PI Point ou Cálculo, você poderá criar regras de cor.</div>
      )}
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
  title: css`font-size: 12px; font-weight: ${theme.typography.fontWeightMedium};`,
  name: css`color: var(--text-secondary); font-size: 10px; overflow-wrap: anywhere;`,
  fields: css`display: flex; flex-direction: column; gap: 12px; padding: 14px;`,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--text-secondary);
    font-size: 10px;
    input[type='color'] { width: 100%; height: 27px; padding: 2px; border: 1px solid var(--border-color); border-radius: 0; background: var(--input-bg); }
  `,
  bindingRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  `,
  binding: css`color: var(--text-secondary); font-size: 10px; overflow-wrap: anywhere; flex: 1;`,
  bindButton: css`width: 100%; min-height: 27px; padding: 3px 6px; border: 1px solid var(--border-color); border-radius: 0; background: var(--button-bg); color: var(--text-primary); font-size: 10px; cursor: pointer;`,
  unbindButton: css`
    padding: 2px 6px;
    border: 1px solid var(--border-color);
    border-radius: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 9px;
    cursor: pointer;
    &:hover {
      color: #ff5555;
      border-color: #ff5555;
    }
  `,
  hint: css`border-top: 1px solid var(--border-color); padding: 10px 12px; color: var(--text-secondary); font-size: 9px; line-height: 1.4;`,
  mirrorGroup: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-secondary);
    font-size: 10px;
  `,
  mirrorButtons: css`
    display: flex;
    gap: 6px;
  `,
  mirrorButton: css`
    flex: 1;
    min-height: 27px;
    padding: 3px 6px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--button-bg);
    color: var(--text-primary);
    font-size: 10px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    &:hover {
      background: var(--button-hover-bg, rgba(255, 255, 255, 0.1));
    }
  `,
  mirrorButtonActive: css`
    background: var(--accent, #6e9fff) !important;
    color: #ffffff !important;
    border-color: var(--accent, #6e9fff) !important;
  `,
});
