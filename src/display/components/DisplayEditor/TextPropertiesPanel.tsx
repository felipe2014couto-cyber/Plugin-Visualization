import React from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { TextProperties } from '../../createText';
import type { MultistateConfig } from '../../multistate';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';
import { ColorControl } from './ColorControl';
import { RotationControl } from './RotationControl';
import { LinkField } from './LinkField';
import type { PiPointBinding } from '../../../pi/piPointBinding';
import type { PiDigitalStatesResult, PiPointSearchResult } from '../../../pi/piDataSource';
import { createPiPointBinding, isPiPointBinding } from '../../../pi/piPointBinding';

export interface TextPropertiesPanelProps {
  properties: TextProperties;
  onChange: (patch: Partial<TextProperties>) => void;
  selectedPiPoint?: PiPointSearchResult | null;
  pointName?: string;
  binding?: PiPointBinding;
  loadDigitalStates?: (binding: PiPointBinding) => Promise<PiDigitalStatesResult>;
  multistate?: MultistateConfig;
  onMultistateChange?: (config: MultistateConfig) => void;
  backgroundMultistate?: MultistateConfig;
  onBackgroundMultistateChange?: (config: MultistateConfig) => void;
}

export function TextPropertiesPanel({
  properties,
  onChange,
  selectedPiPoint,
  pointName,
  binding: propBinding,
  loadDigitalStates,
  multistate,
  onMultistateChange,
  backgroundMultistate,
  onBackgroundMultistateChange,
}: TextPropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const binding = isPiPointBinding(properties.binding) ? properties.binding : (propBinding ?? undefined);
  const effectivePointName = pointName ?? binding?.pointName;
  const selectedBinding = selectedPiPoint ? createPiPointBinding(selectedPiPoint) : undefined;

  return (
    <aside className={styles.panel} data-testid="text-properties-panel" aria-label="Configuração do Texto">
      <div className={styles.header}>
        <span className={styles.title}>Texto</span>
        {effectivePointName && <span className={styles.pointName}>{effectivePointName}</span>}
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          Conteúdo
          <textarea value={properties.text} onChange={(e) => onChange({ text: e.target.value })} data-testid="text-content" />
        </label>
        <LinkField
          value={typeof properties.linkUrl === 'string' ? properties.linkUrl : undefined}
          openInNewTab={properties.openInNewTab !== false}
          onChange={(linkUrl) => onChange({ linkUrl })}
          onOpenInNewTabChange={(openInNewTab) => onChange({ openInNewTab })}
          testId="text-link-url"
        />
        {binding ? (
          <div className={styles.bindingRow}>
            <span className={styles.binding}>PI Point: {binding.pointName}</span>
            <button
              type="button"
              className={styles.unbindButton}
              data-testid="text-unbind-point"
              onClick={() => onChange({ binding: undefined })}
            >
              Desvincular
            </button>
          </div>
        ) : selectedBinding ? (
          <button
            type="button"
            className={styles.bindButton}
            data-testid="text-bind-point"
            onClick={() => onChange({ binding: selectedBinding })}
          >
            Vincular PI Point selecionado
          </button>
        ) : null}
        <ColorControl label="Cor do texto" color={properties.color} onChange={(color) => onChange({ color })} testId="text-color" />
        <ColorControl
          label="Cor do fundo"
          color={properties.backgroundColor || 'transparent'}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
          testId="text-bg-color"
        />
        <label className={styles.field}>
          Tamanho
          <input
            type="number"
            min="8"
            max="120"
            value={properties.fontSize}
            onChange={(e) => onChange({ fontSize: Math.max(8, Math.min(120, Number(e.target.value) || properties.fontSize)) })}
            data-testid="text-font-size"
          />
        </label>
        <label className={styles.field}>
          Alinhamento
          <select
            value={properties.textAlign}
            onChange={(e) => onChange({ textAlign: e.target.value as TextProperties['textAlign'] })}
            data-testid="text-align"
          >
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
        </label>
        <RotationControl value={properties.rotation} onChange={(rotation) => onChange({ rotation })} testId="text-rotation" />
      </div>
      {binding ? (
        <>
          <MultistatePropertiesPanel
            title="Multistate (Texto)"
            testIdPrefix="text-multistate"
            config={multistate}
            binding={binding}
            loadDigitalStates={loadDigitalStates}
            onChange={onMultistateChange ?? (() => {})}
          />
          <MultistatePropertiesPanel
            title="Multistate (Fundo)"
            testIdPrefix="text-bg-multistate"
            config={backgroundMultistate}
            binding={binding}
            loadDigitalStates={loadDigitalStates}
            onChange={onBackgroundMultistateChange ?? (() => {})}
          />
        </>
      ) : (
        <div className={styles.hint}>Arraste uma tag para o texto ou selecione um PI Point para habilitar o Multistate.</div>
      )}
    </aside>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    width: 300px;
    flex: 0 0 300px;
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
  title: css`
    font-size: 12px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  pointName: css`
    font-size: 10px;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  `,
  fields: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    min-width: 0;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text-secondary);
    font-size: 10px;
    textarea,
    input,
    select {
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-height: 28px;
      color: var(--text-primary);
      background: var(--input-bg);
      border: 1px solid var(--border-color);
    }
    textarea {
      min-height: 60px;
      resize: vertical;
    }
  `,
  bindingRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  `,
  binding: css`
    color: var(--text-secondary);
    font-size: 10px;
    overflow-wrap: anywhere;
    flex: 1;
  `,
  bindButton: css`
    width: 100%;
    min-height: 27px;
    padding: 3px 6px;
    border: 1px solid var(--border-color);
    border-radius: 0;
    background: var(--button-bg);
    color: var(--text-primary);
    font-size: 10px;
    cursor: pointer;
  `,
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
  hint: css`
    border-top: 1px solid var(--border-color);
    padding: 10px 12px;
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.4;
  `,
});
