import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { BarOrientation } from '../../scaleOptions';
import { MultistatePropertiesPanel } from './MultistatePropertiesPanel';
import type { MultistateConfig } from '../../multistate';
import { ColorControl } from './ColorControl';
import type { GaugeStyle } from '../../createGauge';
import { LinkField } from './LinkField';
import type { PiPointBinding } from '../../../pi/piPointBinding';
import type { PiDigitalStatesResult } from '../../../pi/piDataSource';

export interface ScalePropertiesPanelProps {
  kind: 'Gauge' | 'Bar';
  pointName?: string;
  binding?: PiPointBinding;
  loadDigitalStates?: (binding: PiPointBinding) => Promise<PiDigitalStatesResult>;
  minimum: number;
  maximum: number;
  showValue: boolean;
  showTagName: boolean;
  showUnit?: boolean;
  showTimestamp?: boolean;
  decimals: number | null;
  color: string;
  orientation?: BarOrientation;
  scaleMode?: 'custom' | 'database';
  showScale?: boolean;
  tagNameMode?: 'tag' | 'custom';
  customTagName?: string;
  fillColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  gaugeStyle?: GaugeStyle;
  gaugeBorderColor?: string;
  gaugeScaleColor?: string;
  title?: string;
  labelPosition?: 'above' | 'below';
  scaleDisplay?: 'all' | 'endpoints';
  gaugeAngle?: number;
  linkUrl?: string;
  openInNewTab?: boolean;
  onLinkChange?: (value: string) => void;
  onOpenInNewTabChange?: (value: boolean) => void;
  onChange: (patch: {
    minimum?: number;
    maximum?: number;
    showValue?: boolean;
    showTagName?: boolean;
    showUnit?: boolean;
    showTimestamp?: boolean;
    decimals?: number | null;
    color?: string;
    orientation?: BarOrientation;
    scaleMode?: 'custom' | 'database';
    showScale?: boolean;
    tagNameMode?: 'tag' | 'custom';
    customTagName?: string;
    fillColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    gaugeStyle?: GaugeStyle;
    gaugeBorderColor?: string;
    gaugeScaleColor?: string;
    title?: string;
    labelPosition?: 'above' | 'below';
    scaleDisplay?: 'all' | 'endpoints';
    gaugeAngle?: number;
  }) => void;
  multistate?: MultistateConfig;
  onMultistateChange: (config: MultistateConfig) => void;
}

export function ScalePropertiesPanel({
  kind,
  pointName,
  binding,
  loadDigitalStates,
  minimum,
  maximum,
  showValue,
  showTagName,
  showUnit = false,
  showTimestamp = false,
  decimals,
  color,
  orientation,
  scaleMode,
  showScale = true,
  tagNameMode = 'tag',
  customTagName = '',
  fillColor = color,
  backgroundColor = '#2d3b4f',
  borderColor = '#ffffff',
  borderWidth = 1,
  gaugeStyle = 'pointer',
  gaugeBorderColor = '#ffffff',
  gaugeScaleColor = '#ffffff',
  title = '',
  labelPosition = 'above',
  scaleDisplay = 'all',
  gaugeAngle = 270,
  linkUrl,
  openInNewTab = true,
  onLinkChange,
  onOpenInNewTabChange,
  onChange,
  multistate,
  onMultistateChange,
}: ScalePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const [customBarNameDraft, setCustomBarNameDraft] = useState(customTagName ?? '');
  const [gaugeTitleDraft, setGaugeTitleDraft] = useState(title ?? '');
  useEffect(() => setCustomBarNameDraft(customTagName ?? ''), [customTagName]);
  useEffect(() => setGaugeTitleDraft(title ?? ''), [title]);
  return (
    <aside className={styles.panel} data-testid={`${kind.toLowerCase()}-properties-panel`} aria-label={`Configuração do ${kind}`}>
      <div className={styles.header}>
        <span className={styles.title}>{kind}</span>
      </div>
      <div className={styles.fields}>
        <ColorControl label={kind === 'Bar' ? 'Cor da barra' : 'Cor do indicador'} color={kind === 'Bar' ? fillColor : color} fallback={kind === 'Gauge' ? '#00a2e8' : '#ffffff'} onChange={(value) => onChange(kind === 'Bar' ? { fillColor: value, color: value } : { color: value })} testId={`${kind.toLowerCase()}-color`} />
        {kind === 'Gauge' && <label className={styles.field}><span>Estilo</span><select value={gaugeStyle} onChange={(event) => onChange({ gaugeStyle: event.target.value as GaugeStyle })} data-testid="gauge-style"><option value="arc">Arco</option><option value="triangle">Triângulo</option><option value="pointer">Ponteiro</option><option value="line">Linha</option></select></label>}
        {kind === 'Gauge' && <>
          <label className={styles.field}><span>Local do rótulo</span><select value={labelPosition} onChange={(event) => onChange({ labelPosition: event.target.value as 'above' | 'below' })} data-testid="gauge-label-position"><option value="above">Acima</option><option value="below">Abaixo</option></select></label>
          <label className={styles.field}><span>Escala</span><select value={scaleDisplay} onChange={(event) => onChange({ scaleDisplay: event.target.value as 'all' | 'endpoints' })} data-testid="gauge-scale-display"><option value="all">Mostrar tudo</option><option value="endpoints">Mostrar apenas primeiro e último</option></select></label>
          <label className={styles.field}><span>Ângulo ({gaugeAngle}°)</span><input type="range" min="180" max="360" step="1" value={gaugeAngle} onChange={(event) => onChange({ gaugeAngle: Number(event.target.value) })} data-testid="gauge-angle" /></label>
        </>}
        {kind === 'Gauge' && <>
          <ColorControl label="Cor do contorno" color={gaugeBorderColor} onChange={(value) => onChange({ gaugeBorderColor: value })} testId="gauge-border-color" />
          <ColorControl label="Cor da escala e título" color={gaugeScaleColor} onChange={(value) => onChange({ gaugeScaleColor: value })} testId="gauge-scale-color" />
        </>}
        {kind === 'Bar' && <>
          <ColorControl label="Cor de preenchimento" color={backgroundColor} onChange={(value) => onChange({ backgroundColor: value })} testId="bar-background-color" />
          <ColorControl label="Cor do contorno" color={borderColor} onChange={(value) => onChange({ borderColor: value })} testId="bar-border-color" />
          <label className={styles.field}><span>Espessura do contorno ({borderWidth})</span><input type="range" min="0" max="8" step="1" value={borderWidth} onChange={(event) => onChange({ borderWidth: Number(event.target.value) })} data-testid="bar-border-width" /></label>
        </>}
        {(kind !== 'Bar' && kind !== 'Gauge' || scaleMode === 'custom') && <>
          <label className={styles.field}>
            <span>Mínimo</span>
            <input type="number" value={minimum} onChange={(event) => onChange({ minimum: Number(event.target.value) })} data-testid={`${kind.toLowerCase()}-minimum`} />
          </label>
          <label className={styles.field}>
            <span>Máximo</span>
            <input type="number" value={maximum} onChange={(event) => onChange({ maximum: Number(event.target.value) })} data-testid={`${kind.toLowerCase()}-maximum`} />
          </label>
        </>}
        <label className={styles.field}>
          <span>Casas decimais</span>
          <select value={decimals === null ? '' : String(decimals)} onChange={(event) => onChange({ decimals: event.target.value === '' ? null : Number(event.target.value) })} data-testid={`${kind.toLowerCase()}-decimals`}>
            <option value="">Padrão</option>
            {[0, 1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {(kind === 'Bar' || kind === 'Gauge') && (
          <label className={styles.field}>
            <span>Intervalo de escala</span>
            <select value={scaleMode ?? 'custom'} onChange={(event) => onChange({ scaleMode: event.target.value as 'custom' | 'database' })} data-testid="bar-scale-mode">
              <option value="custom">Personalizado</option>
              <option value="database">Limites do banco de dados</option>
            </select>
          </label>
        )}
        {kind === 'Bar' && (
          <label className={styles.field}>
            <span>Orientação</span>
            <select value={orientation ?? 'vertical'} onChange={(event) => onChange({ orientation: event.target.value as BarOrientation })} data-testid="bar-orientation">
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </label>
        )}
        <label className={styles.checkbox}><input type="checkbox" checked={showTagName} onChange={(event) => onChange({ showTagName: event.target.checked })} data-testid={`${kind.toLowerCase()}-show-tag-name`} /><span>Rótulo</span></label>
        {kind === 'Bar' && <label className={styles.field}><span>Nome do rótulo</span><select value={tagNameMode} onChange={(event) => onChange({ tagNameMode: event.target.value as 'tag' | 'custom', ...(event.target.value === 'custom' && !customTagName ? { customTagName: pointName ?? '' } : {}) })} data-testid="bar-tag-name-mode"><option value="tag">Nome da tag</option><option value="custom">Personalizado</option></select></label>}
        {kind === 'Bar' && tagNameMode === 'custom' && <label className={styles.field}><span>Rótulo personalizado</span><input value={customBarNameDraft} onChange={(event) => { setCustomBarNameDraft(event.target.value); onChange({ customTagName: event.target.value }); }} data-testid="bar-custom-tag-name" /></label>}
        {kind === 'Gauge' && <label className={styles.field}><span>Rótulo personalizado</span><input value={gaugeTitleDraft} onChange={(event) => { setGaugeTitleDraft(event.target.value); onChange({ title: event.target.value }); }} placeholder="Nome da tag" data-testid="gauge-title" /></label>}
        <label className={styles.checkbox}><input type="checkbox" checked={showValue} onChange={(event) => onChange({ showValue: event.target.checked })} data-testid={`${kind.toLowerCase()}-show-value`} /><span>Valor</span></label>
        {kind === 'Bar' && <label className={styles.checkbox}><input type="checkbox" checked={showScale} onChange={(event) => onChange({ showScale: event.target.checked })} data-testid="bar-show-scale" /><span>Mostrar escala</span></label>}
        <label className={styles.checkbox}><input type="checkbox" checked={showUnit} onChange={(event) => onChange({ showUnit: event.target.checked })} data-testid={`${kind.toLowerCase()}-show-unit`} /><span>Unidades</span></label>
        {onLinkChange && <LinkField value={linkUrl} openInNewTab={openInNewTab} onChange={onLinkChange} onOpenInNewTabChange={onOpenInNewTabChange} testId={`${kind.toLowerCase()}-link-url`} />}
      </div>
      <MultistatePropertiesPanel config={multistate} binding={binding} loadDigitalStates={loadDigitalStates} onChange={onMultistateChange} />
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

    @media (max-width: 760px) {
      width: 100%;
      flex-basis: auto;
    }
  `,
  header: css`
    padding: 12px 14px;
    border-bottom: 1px solid var(--border-color);
    background: var(--panel-header-bg);
  `,
  title: css`
    font-size: 12px;
    font-weight: ${theme.typography.fontWeightMedium};
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

    input,
    select {
      box-sizing: border-box;
      min-height: 27px;
      padding: 3px 6px;
      border: 1px solid var(--border-color);
      border-radius: 0;
      background: var(--input-bg);
      color: var(--text-primary);
    }

    input[type='color'] {
      height: 27px;
      padding: 2px;
    }
  `,
  checkbox: css`
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 10px;
  `,
});
