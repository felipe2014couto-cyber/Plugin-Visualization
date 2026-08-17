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

export interface LibrarySymbolPropertiesPanelProps {
  properties: LibrarySymbolProperties;
  selectedPiPoint?: PiPointSearchResult | null;
  onChange: (patch: Partial<LibrarySymbolProperties>) => void;
  onMultistateChange: (config: MultistateConfig) => void;
}

export function LibrarySymbolPropertiesPanel({ properties, selectedPiPoint, onChange, onMultistateChange }: LibrarySymbolPropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const binding = isPiPointBinding(properties.binding) ? properties.binding : undefined;
  const selectedBinding = selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined;

  return (
    <aside className={styles.panel} data-testid="library-symbol-properties-panel" aria-label="Configuração do símbolo">
      <div className={styles.header}>
        <span className={styles.title}>Símbolo</span>
        <span className={styles.name}>{properties.name}</span>
      </div>
      <div className={styles.fields}>
        <RotationControl value={properties.rotation} onChange={(rotation) => onChange({ rotation })} testId="library-symbol-rotation" />
        <label className={styles.field}>
          <span>Cor do símbolo</span>
          <TransparentColorPicker color={properties.color} fallbackColor={DEFAULT_LIBRARY_SYMBOL_COLOR} testId="library-symbol-color" onChange={(color) => onChange({ color })} />
        </label>
        {binding ? (
          <div className={styles.binding}>PI Point: {binding.pointName}</div>
        ) : selectedBinding ? (
          <button type="button" className={styles.bindButton} data-testid="library-symbol-bind-point" onClick={() => onChange({ binding: selectedBinding })}>
            Vincular PI Point selecionado
          </button>
        ) : (
          <div className={styles.hint}>Selecione um PI Point para habilitar o Multistate.</div>
        )}
      </div>
      {binding ? (
        <MultistatePropertiesPanel config={properties.multistate} onChange={onMultistateChange} />
      ) : (
        <div className={styles.hint}>Depois de vincular um PI Point, você poderá criar regras de cor.</div>
      )}
    </aside>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    flex: 0 0 232px;
    min-width: 0;
    border-left: 1px solid var(--border-color);
    background: var(--panel-bg);
    color: var(--text-primary);
    overflow: auto;
  `,
  header: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color);
    background: var(--panel-header-bg);
  `,
  title: css`font-size: 12px; font-weight: ${theme.typography.fontWeightMedium};`,
  name: css`color: var(--text-secondary); font-size: 10px; overflow-wrap: anywhere;`,
  fields: css`display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;`,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--text-secondary);
    font-size: 10px;
    input[type='color'] { width: 100%; height: 27px; padding: 2px; border: 1px solid var(--border-color); border-radius: 0; background: var(--input-bg); }
  `,
  binding: css`color: var(--text-secondary); font-size: 10px; overflow-wrap: anywhere;`,
  bindButton: css`width: 100%; min-height: 27px; padding: 3px 6px; border: 1px solid var(--border-color); border-radius: 0; background: var(--button-bg); color: var(--text-primary); font-size: 10px;`,
  hint: css`border-top: 1px solid var(--border-color); padding: 10px 12px; color: var(--text-secondary); font-size: 9px; line-height: 1.4;`,
});
