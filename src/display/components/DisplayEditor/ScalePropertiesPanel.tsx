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
  barStartMode?: 'default' | 'custom';
  barStartValue?: number;
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
    barStartMode?: 'default' | 'custom';
    barStartValue?: number;
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
  barStartMode = 'default',
  barStartValue = 0,
  linkUrl,
  openInNewTab = true,
  onLinkChange,
  onOpenInNewTabChange,
  onChange,
  multistate,
  onMultistateChange,
}: ScalePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const [gaugeTitleDraft, setGaugeTitleDraft] = useState(title ?? '');
  useEffect(() => setGaugeTitleDraft(title ?? ''), [title]);

  const [minText, setMinText] = useState(minimum?.toString() ?? '');
  const [maxText, setMaxText] = useState(maximum?.toString() ?? '');
  const [barStartValueText, setBarStartValueText] = useState(barStartValue?.toString() ?? '0');

  useEffect(() => {
    if (minimum !== undefined && minimum.toString() !== minText) {
      setMinText(minimum.toString());
    }
  }, [minimum]);

  useEffect(() => {
    if (maximum !== undefined && maximum.toString() !== maxText) {
      setMaxText(maximum.toString());
    }
  }, [maximum]);

  useEffect(() => {
    if (barStartValue !== undefined && barStartValue.toString() !== barStartValueText) {
      setBarStartValueText(barStartValue.toString());
    }
  }, [barStartValue]);

  return (
    <aside className={styles.panel} data-testid={`${kind.toLowerCase()}-properties-panel`} aria-label={`Configuração do ${kind}`}>
      <div className={styles.header}>
        <span className={styles.title}>{kind}</span>
      </div>
      <div className={styles.fields}>
        {kind === 'Gauge' && (
          <>
            <ColorControl
              label="Cor de preenchimento"
              color={color}
              fallback="#00a2e8"
              onChange={(value) => onChange({ color: value, fillColor: value })}
              testId="gauge-color"
            />
            <ColorControl
              label="Cor do contorno"
              color={gaugeBorderColor}
              fallback="#ffffff"
              onChange={(value) => onChange({ gaugeBorderColor: value, borderColor: value })}
              testId="gauge-border-color"
            />
            <ColorControl
              label="Cor da escala"
              color={gaugeScaleColor}
              fallback="#ffffff"
              onChange={(value) => onChange({ gaugeScaleColor: value })}
              testId="gauge-scale-color"
            />
            <label className={styles.field}>
              <span>Estilo</span>
              <select
                value={gaugeStyle}
                onChange={(event) => onChange({ gaugeStyle: event.target.value as GaugeStyle })}
                data-testid="gauge-style"
              >
                <option value="arc">Arco</option>
                <option value="triangle">Triângulo</option>
                <option value="pointer">Ponteiro</option>
                <option value="line">Linha</option>
              </select>
            </label>
            <div className={styles.radioGroup}>
              <span className={styles.groupLabel}>Local do rótulo</span>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="gauge-label-position"
                  value="above"
                  checked={labelPosition === 'above'}
                  onChange={() => onChange({ labelPosition: 'above' })}
                  data-testid="gauge-label-position-above"
                />
                <span>Acima</span>
              </label>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="gauge-label-position"
                  value="below"
                  checked={labelPosition === 'below'}
                  onChange={() => onChange({ labelPosition: 'below' })}
                  data-testid="gauge-label-position-below"
                />
                <span>Abaixo</span>
              </label>
            </div>
            <div className={styles.radioGroup}>
              <span className={styles.groupLabel}>Escala</span>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="gauge-scale-display"
                  value="all"
                  checked={scaleDisplay === 'all'}
                  onChange={() => onChange({ scaleDisplay: 'all' })}
                  data-testid="gauge-scale-display-all"
                />
                <span>Mostrar tudo</span>
              </label>
              <label className={styles.radioOption}>
                <input
                  type="radio"
                  name="gauge-scale-display"
                  value="endpoints"
                  checked={scaleDisplay === 'endpoints'}
                  onChange={() => onChange({ scaleDisplay: 'endpoints' })}
                  data-testid="gauge-scale-display-endpoints"
                />
                <span>Mostrar apenas primeiro e último</span>
              </label>
            </div>
            <label className={styles.field}>
              <span>Ângulo ({gaugeAngle}°)</span>
              <input
                type="range"
                min="180"
                max="360"
                step="1"
                value={gaugeAngle}
                onChange={(event) => onChange({ gaugeAngle: Number(event.target.value) })}
                data-testid="gauge-angle"
              />
            </label>
          </>
        )}
        {kind === 'Bar' && (
          <>
            <ColorControl
              label="Cor da barra"
              color={fillColor}
              fallback="#ffffff"
              onChange={(value) => onChange({ fillColor: value, color: value })}
              testId="bar-color"
            />
            <ColorControl
              label="Cor de preenchimento"
              color={backgroundColor}
              onChange={(value) => onChange({ backgroundColor: value })}
              testId="bar-background-color"
            />
            <ColorControl
              label="Cor do contorno"
              color={borderColor}
              onChange={(value) => onChange({ borderColor: value })}
              testId="bar-border-color"
            />
            <label className={styles.field}>
              <span>Espessura do contorno ({borderWidth})</span>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={borderWidth}
                onChange={(event) => onChange({ borderWidth: Number(event.target.value) })}
                data-testid="bar-border-width"
              />
            </label>
          </>
        )}
        <label className={styles.field}>
          <span>Casas decimais</span>
          <select value={decimals === null ? '' : String(decimals)} onChange={(event) => onChange({ decimals: event.target.value === '' ? null : Number(event.target.value) })} data-testid={`${kind.toLowerCase()}-decimals`}>
            <option value="">Padrão</option>
            {[0, 1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        
        <div className={styles.radioGroup}>
          <span className={styles.groupLabel}>Intervalo de escala</span>
          <label className={styles.field}>
            <select value={scaleMode ?? 'custom'} onChange={(event) => onChange({ scaleMode: event.target.value as 'custom' | 'database' })} data-testid="bar-scale-mode">
              <option value="custom">Limites personalizados</option>
              <option value="database">Limites do banco de dados</option>
            </select>
          </label>
          {scaleMode !== 'database' && (
            <>
              {kind === 'Bar' && orientation === 'vertical' ? (
                <>
                  <label className={styles.field}>
                    <span>Acima</span>
                    <input type="number" value={maxText} onChange={(event) => { setMaxText(event.currentTarget.value); const val = Number(event.currentTarget.value); if (event.currentTarget.value === '') onChange({ maximum: undefined }); else if (Number.isFinite(val)) onChange({ maximum: val }); }} data-testid={`${kind.toLowerCase()}-maximum`} />
                  </label>
                  <label className={styles.field}>
                    <span>Abaixo</span>
                    <input type="number" value={minText} onChange={(event) => { setMinText(event.currentTarget.value); const val = Number(event.currentTarget.value); if (event.currentTarget.value === '') onChange({ minimum: undefined }); else if (Number.isFinite(val)) onChange({ minimum: val }); }} data-testid={`${kind.toLowerCase()}-minimum`} />
                  </label>
                </>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>{kind === 'Bar' ? 'Esquerda' : 'Mínimo'}</span>
                    <input type="number" value={minText} onChange={(event) => { setMinText(event.currentTarget.value); const val = Number(event.currentTarget.value); if (event.currentTarget.value === '') onChange({ minimum: undefined }); else if (Number.isFinite(val)) onChange({ minimum: val }); }} data-testid={`${kind.toLowerCase()}-minimum`} />
                  </label>
                  <label className={styles.field}>
                    <span>{kind === 'Bar' ? 'Direita' : 'Máximo'}</span>
                    <input type="number" value={maxText} onChange={(event) => { setMaxText(event.currentTarget.value); const val = Number(event.currentTarget.value); if (event.currentTarget.value === '') onChange({ maximum: undefined }); else if (Number.isFinite(val)) onChange({ maximum: val }); }} data-testid={`${kind.toLowerCase()}-maximum`} />
                  </label>
                </>
              )}
            </>
          )}
          
          {kind === 'Bar' && (
            <>
              <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '10px 0' }} />
              <label className={styles.field}>
                <span>Início da Barra</span>
                <select
                  value={barStartMode}
                  onChange={(e) => onChange({ barStartMode: e.currentTarget.value as 'default' | 'custom' })}
                  data-testid="bar-start-mode"
                >
                  <option value="default">Padrão</option>
                  <option value="custom">Personalizado</option>
                </select>
              </label>
              {barStartMode === 'custom' && (
                <label className={styles.field}>
                  <span>Valor</span>
                  <input
                    type="number"
                    value={barStartValueText}
                    onChange={(e) => {
                      setBarStartValueText(e.currentTarget.value);
                      const val = Number(e.currentTarget.value);
                      if (e.currentTarget.value === '') {
                        onChange({ barStartValue: undefined });
                      } else if (Number.isFinite(val)) {
                        onChange({ barStartValue: val });
                      }
                    }}
                    data-testid="bar-start-value"
                  />
                </label>
              )}
            </>
          )}
        </div>
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
        {kind === 'Gauge' && <label className={styles.field}><span>Rótulo personalizado</span><input value={gaugeTitleDraft} onChange={(event) => { setGaugeTitleDraft(event.target.value); onChange({ title: event.target.value }); }} placeholder="Nome da tag" data-testid="gauge-title" /><small className={styles.tagHint}>Tag usada: {pointName || '—'}</small></label>}
        <label className={styles.checkbox}><input type="checkbox" checked={showValue} onChange={(event) => onChange({ showValue: event.target.checked })} data-testid={`${kind.toLowerCase()}-show-value`} /><span>Valor</span></label>
        {(kind === 'Bar' || kind === 'Gauge') && <label className={styles.checkbox}><input type="checkbox" checked={showScale} onChange={(event) => onChange({ showScale: event.target.checked })} data-testid={`${kind.toLowerCase()}-show-scale`} /><span>Mostrar escala</span></label>}
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
  tagHint: css`
    color: var(--text-secondary);
    font-size: 9px;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  checkbox: css`
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 10px;
  `,
  radioGroup: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    padding-bottom: 4px;
    border-top: 1px solid var(--border-color);
  `,
  groupLabel: css`
    font-size: 10px;
    font-weight: 500;
    color: var(--text-primary);
  `,
  radioOption: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--text-secondary);
    cursor: pointer;

    input[type='radio'] {
      margin: 0;
      cursor: pointer;
    }
  `,
});
