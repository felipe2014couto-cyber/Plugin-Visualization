import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  getValueVisualOptions,
  normalizeValueVisualOptions,
  type ValueVisualOptions,
} from '../../createValue';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';
import type { MultistateConfig } from '../../multistate';
import { ColorControl } from './ColorControl';
import { LinkField } from './LinkField';
import type { PiPointBinding } from '../../../pi/piPointBinding';
import type { PiDigitalStatesResult } from '../../../pi/piDataSource';

export interface ValuePropertiesPanelProps {
  options: ValueVisualOptions;
  pointName: string;
  binding?: PiPointBinding;
  loadDigitalStates?: (binding: PiPointBinding) => Promise<PiDigitalStatesResult>;
  onChange: (patch: Partial<ValueVisualOptions>) => void;
  multistate?: MultistateConfig;
  onMultistateChange: (config: MultistateConfig) => void;
  backgroundMultistate?: MultistateConfig;
  onBackgroundMultistateChange?: (config: MultistateConfig) => void;
  linkUrl?: string;
  onLinkChange: (value: string) => void;
  openInNewTab?: boolean;
  onOpenInNewTabChange: (value: boolean) => void;
}

export function ValuePropertiesPanel({
  options,
  pointName,
  binding,
  loadDigitalStates,
  onChange,
  multistate,
  onMultistateChange,
  backgroundMultistate,
  onBackgroundMultistateChange,
  linkUrl,
  onLinkChange,
  openInNewTab = true,
  onOpenInNewTabChange,
}: ValuePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const visual = getValueVisualOptions({ visual: options });

  return (
    <aside className={styles.panel} data-testid="value-properties-panel" aria-label="Formatação do Value">
      <div className={styles.panelHeader}>
        <span className={styles.title}>Value</span>
        <span className={styles.pointName}>{pointName}</span>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Casas decimais</span>
          <select
            data-testid="value-decimals"
            value={visual.decimals === null ? '' : String(visual.decimals)}
            onChange={(event) => onChange({ decimals: event.target.value === '' ? null : Number(event.target.value) })}
          >
            <option value="">Padrão</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((decimal) => (
              <option key={decimal} value={decimal}>{decimal}</option>
            ))}
          </select>
        </label>
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            data-testid="value-show-tag-name"
            checked={visual.showTagName}
            onChange={(event) => onChange({ showTagName: event.target.checked })}
          />
          <span>Rótulo</span>
        </label>
        <label className={styles.field}>
          <span>Nome do rótulo</span>
          <select value={visual.labelMode} onChange={(event) => onChange({ labelMode: event.target.value as ValueVisualOptions['labelMode'], ...(event.target.value === 'custom' && !visual.customLabel ? { customLabel: pointName } : {}) })} data-testid="value-label-mode">
            <option value="tag">Nome da tag</option><option value="custom">Personalizado</option>
          </select>
        </label>
        {visual.labelMode === 'custom' && <label className={styles.field}><span>Rótulo personalizado</span><input value={visual.customLabel || pointName} onChange={(event) => onChange({ customLabel: event.target.value })} data-testid="value-custom-label" /></label>}
        <label className={styles.checkboxField}><input type="checkbox" checked={visual.showUnit} onChange={(event) => onChange({ showUnit: event.target.checked })} data-testid="value-show-unit" /><span>Unidades</span></label>
        <label className={styles.checkboxField}><input type="checkbox" checked={visual.showTimestamp} onChange={(event) => onChange({ showTimestamp: event.target.checked })} data-testid="value-show-timestamp" /><span>Timestamp</span></label>
        <label className={styles.checkboxField}><input type="checkbox" checked={visual.showValue} onChange={(event) => onChange({ showValue: event.target.checked })} data-testid="value-show-value" /><span>Valor</span></label>
        <LinkField value={linkUrl} openInNewTab={openInNewTab} onChange={onLinkChange} onOpenInNewTabChange={onOpenInNewTabChange} testId="value-link-url" />
        <label className={styles.field}>
          <span>Tamanho da fonte</span>
          <input
            type="number"
            min={8}
            max={96}
            step={1}
            data-testid="value-font-size"
            value={visual.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </label>
        <ColorControl label="Cor do texto" color={visual.color} onChange={(value) => onChange({ color: value })} testId="value-color" />
        <ColorControl label="Cor do fundo" color={visual.backgroundColor || 'transparent'} onChange={(value) => onChange({ backgroundColor: value })} testId="value-bg-color" />
        <label className={styles.field}>
          <span>Alinhamento</span>
          <select
            data-testid="value-text-align"
            value={visual.textAlign}
            onChange={(event) => onChange({
              textAlign: normalizeValueVisualOptions({ textAlign: event.target.value as ValueVisualOptions['textAlign'] }).textAlign,
            })}
          >
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
        </label>
      </div>
      <MultistatePropertiesPanel title="Multistate (Texto)" testIdPrefix="value-text-multistate" config={multistate} binding={binding} loadDigitalStates={loadDigitalStates} onChange={onMultistateChange} />
      <MultistatePropertiesPanel title="Multistate (Fundo)" testIdPrefix="value-bg-multistate" config={backgroundMultistate} binding={binding} loadDigitalStates={loadDigitalStates} onChange={onBackgroundMultistateChange ?? (() => {})} />
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
  panelHeader: css`
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
    color: var(--text-secondary);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  fields: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--text-secondary);
    font-size: 10px;

    select,
    input[type='number'],
    input[type='url'] {
      width: 100%;
      box-sizing: border-box;
      min-height: 27px;
      padding: 3px 6px;
      border: 1px solid var(--border-color);
      border-radius: 0;
      background: var(--input-bg);
      color: var(--text-primary);
    }

    input[type='color'] {
      width: 100%;
      height: 27px;
      padding: 2px;
      border: 1px solid var(--border-color);
      border-radius: 0;
      background: var(--input-bg);
    }
  `,
  checkboxField: css`
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 10px;
  `,
});
