import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { getTrendSeries, getTrendVisualOptions, trendBindingKey, type TrendElement, type TrendLineStyle, type TrendMarker, type TrendNumberFormat, type TrendScaleMode } from '../../createTrend';
import { ColorControl } from './ColorControl';
import { LinkField } from './LinkField';

export function TrendPropertiesPanel({ element, onVisualChange, onSeriesChange, onSeriesRemove, onClose, linkUrl, onLinkChange }: {
  element: TrendElement;
  onVisualChange: (patch: Partial<ReturnType<typeof getTrendVisualOptions>>) => void;
  onSeriesChange: (key: string, patch: { color?: string; legendLabel?: string; lineWidth?: number; lineStyle?: TrendLineStyle; marker?: TrendMarker; primaryScale?: boolean; scaleMin?: number; scaleMax?: number }) => void;
  onSeriesRemove: (key: string) => void;
  onClose: () => void;
  linkUrl?: string;
  onLinkChange?: (value: string) => void;
}) {
  const styles = useStyles2(getStyles);
  const series = getTrendSeries(element);
  const [key, setKey] = useState(() => trendBindingKey(series[0]?.binding));
  const selected = series.find((item) => trendBindingKey(item.binding) === key) ?? series[0];
  const visual = getTrendVisualOptions(element);
  const [fontSizeDraft, setFontSizeDraft] = useState(String(visual.fontSize));
  useEffect(() => {
    setFontSizeDraft(String(visual.fontSize));
  }, [visual.fontSize]);
  const commitFontSize = () => {
    const value = Number(fontSizeDraft);
    if (!Number.isFinite(value)) {
      setFontSizeDraft(String(visual.fontSize));
      return;
    }
    const fontSize = Math.max(10, Math.min(24, value));
    setFontSizeDraft(String(fontSize));
    onVisualChange({ fontSize });
  };
  if (!selected) {
    return null;
  }
  const selectedKey = trendBindingKey(selected.binding);
  return <aside className={styles.panel} data-testid="trend-properties-panel" aria-label="Opções da Trend">
    <div className={styles.heading}><strong>Opções de traço</strong><button type="button" onClick={onClose} aria-label="Fechar opções da Trend" title="Fechar">×</button></div>
    <label>Série<select value={selectedKey} onChange={(e) => setKey(e.currentTarget.value)}>{series.map((item) => <option key={trendBindingKey(item.binding)} value={trendBindingKey(item.binding)}>{item.binding.pointName}</option>)}</select></label>
    <label>Título<input value={visual.title} onChange={(e) => onVisualChange({ title: e.currentTarget.value })} placeholder="Título do gráfico" /></label>
    <label>Rótulo da legenda<input value={selected.legendLabel ?? selected.binding.pointName} onChange={(e) => onSeriesChange(selectedKey, { legendLabel: e.currentTarget.value })} /></label>
    <ColorControl label="Cor" color={selected.color} onChange={(color) => onSeriesChange(selectedKey, { color })} />
    {onLinkChange && <LinkField value={linkUrl} onChange={onLinkChange} testId="trend-link-url" />}
    <label>Espessura <span className={styles.rangeValue}>{selected.lineWidth ?? 2}</span><input type="range" min="1" max="8" value={selected.lineWidth ?? 2} onChange={(e) => onSeriesChange(selectedKey, { lineWidth: Number(e.currentTarget.value) })} /></label>
    <button type="button" className={styles.removeButton} disabled={series.length <= 1} onClick={() => onSeriesRemove(selectedKey)}>Excluir tag selecionada</button>
    <label>Estilo<select value={selected.lineStyle ?? 'solid'} onChange={(e) => onSeriesChange(selectedKey, { lineStyle: e.currentTarget.value as TrendLineStyle })}><option value="solid">Sólido</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option></select></label>
    <label>Marcador<select value={selected.marker ?? 'none'} onChange={(e) => onSeriesChange(selectedKey, { marker: e.currentTarget.value as TrendMarker })}><option value="none">Nenhum</option><option value="circle">Círculo</option><option value="square">Quadrado</option></select></label>
    {series.length > 1 && <label className={styles.check}><input type="checkbox" checked={selected.primaryScale === true} onChange={(e) => onSeriesChange(selectedKey, { primaryScale: e.currentTarget.checked })} />★ Escala principal</label>}
    <label className={styles.check}><input type="checkbox" checked={visual.showRegression} onChange={(e) => onVisualChange({ showRegression: e.currentTarget.checked })} />Linha de regressão</label>
    <label>Formato<select value={visual.numberFormat} onChange={(e) => onVisualChange({ numberFormat: e.currentTarget.value as TrendNumberFormat })}><option value="automatic">Automático</option><option value="integer">Inteiro</option><option value="oneDecimal">1 decimal</option><option value="twoDecimals">2 decimais</option></select></label>
    <label>Escala Y<select value={visual.scaleMode === 'multiple' ? 'individual' : visual.scaleMode} onChange={(e) => onVisualChange({ scaleMode: e.currentTarget.value as TrendScaleMode })}><option value="single">Única</option><option value="individual">Individual por série</option><option value="configurable">Escala configurável</option></select></label>
    {visual.scaleMode === 'configurable' && <>
      <label>Mínimo da escala<input type="number" value={selected.scaleMin ?? ''} onChange={(e) => onSeriesChange(selectedKey, { scaleMin: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value) })} /></label>
      <label>Máximo da escala<input type="number" value={selected.scaleMax ?? ''} onChange={(e) => onSeriesChange(selectedKey, { scaleMax: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value) })} /></label>
    </>}
    <label>Intervalo de escala<select value={visual.scaleIntervals} onChange={(e) => onVisualChange({ scaleIntervals: Number(e.currentTarget.value) as 2 | 5 | 10 })}><option value={2}>2 intervalos</option><option value={5}>5 intervalos</option><option value={10}>10 intervalos (Padrão)</option></select></label>
    <strong className={styles.fontHeading}>Fonte</strong>
    <label>Nome<select value={visual.fontFamily} onChange={(e) => onVisualChange({ fontFamily: e.currentTarget.value })}><option>Arial</option><option>Verdana</option><option>Tahoma</option></select></label>
    <label>Tamanho<input type="number" min="10" max="24" value={fontSizeDraft} onChange={(e) => setFontSizeDraft(e.currentTarget.value)} onBlur={commitFontSize} onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }} /></label>
  </aside>;
}
const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
  width: 230px; flex: 0 0 230px; min-height:0; max-height:100%; overflow-x:hidden; overflow-y:auto; scrollbar-gutter:stable; padding:8px 12px; box-sizing:border-box; color:var(--text-primary); background:var(--surface-primary); border-left:1px solid var(--border-color); font-size:11px;
  label { display:flex; flex-direction:column; gap:2px; margin:4px 0; color:var(--text-secondary); } input, select { height:25px; min-height:25px; box-sizing:border-box; color:var(--text-primary); background:var(--input-bg); border:1px solid var(--border-color); } input[type='color'] { padding:2px; } input[type='range'] { accent-color:var(--accent); }`,
  heading: css`display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; strong { font-size:14px; } button { width:24px; height:24px; border:1px solid var(--border-color); border-radius:4px; color:var(--text-secondary); background:var(--button-bg); font-size:20px; line-height:18px; cursor:pointer; } button:hover { color:var(--text-primary); background:var(--button-hover); }`,
  removeButton: css`width:100%; min-height:26px; margin:3px 0 6px; border:1px solid var(--border-color); border-radius:3px; color:var(--text-primary); background:var(--button-bg); cursor:pointer; &:disabled { opacity:0.5; cursor:not-allowed; }`,
  rangeValue: css`float:right; color:var(--text-primary); font-weight:600;`,
  fontHeading: css`display:block; margin:7px 0 3px; font-size:13px;`,
  check: css`flex-direction:row !important; align-items:center; input { width:14px; height:14px; min-height:14px; }`
});
