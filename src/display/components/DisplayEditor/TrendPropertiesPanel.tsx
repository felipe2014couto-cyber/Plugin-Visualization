import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { getTrendSeries, getTrendVisualOptions, trendBindingKey, type TrendElement, type TrendLineStyle, type TrendMarker, type TrendNumberFormat, type TrendScaleMode } from '../../createTrend';
import { ColorControl } from './ColorControl';

export function TrendPropertiesPanel({ element, onVisualChange, onSeriesChange, onSeriesRemove, onClose }: {
  element: TrendElement;
  onVisualChange: (patch: Partial<ReturnType<typeof getTrendVisualOptions>>) => void;
  onSeriesChange: (key: string, patch: { color?: string; legendLabel?: string; lineWidth?: number; lineStyle?: TrendLineStyle; marker?: TrendMarker; primaryScale?: boolean; scaleMin?: number; scaleMax?: number }) => void;
  onSeriesRemove: (key: string) => void;
  onClose: () => void;
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
    <strong className={styles.sectionHeading}>Traços</strong>
    <div className={styles.choiceRow} role="group" aria-label="Estilo de traço">
      <TrendChoiceButton label="Linha" active={visual.traceMode === 'line'} onClick={() => onVisualChange({ traceMode: 'line' })}><svg viewBox="0 0 64 40"><path d="M4 31 20 10l14 16L59 5" /></svg></TrendChoiceButton>
      <TrendChoiceButton label="Linha e marcadores" active={visual.traceMode === 'line-markers'} onClick={() => onVisualChange({ traceMode: 'line-markers' })}><svg viewBox="0 0 64 40"><path d="M4 31 20 10l14 16L59 5" /><circle cx="20" cy="10" r="3" /><circle cx="34" cy="26" r="3" /><circle cx="59" cy="5" r="3" /></svg></TrendChoiceButton>
      <TrendChoiceButton label="Marcadores" active={visual.traceMode === 'markers'} onClick={() => onVisualChange({ traceMode: 'markers' })}><svg viewBox="0 0 64 40"><circle cx="12" cy="27" r="3" /><circle cx="28" cy="9" r="3" /><circle cx="45" cy="29" r="3" /><circle cx="59" cy="16" r="3" /></svg></TrendChoiceButton>
    </div>
    <strong className={styles.sectionHeading}>Grade</strong>
    <div className={styles.choiceRow} role="group" aria-label="Estilo de grade">
      <TrendChoiceButton label="Horizontal" active={visual.gridMode === 'horizontal'} onClick={() => onVisualChange({ gridMode: 'horizontal' })}><svg viewBox="0 0 64 40"><path d="M4 8h56M4 20h56M4 32h56" /></svg></TrendChoiceButton>
      <TrendChoiceButton label="Horizontal e vertical" active={visual.gridMode === 'both'} onClick={() => onVisualChange({ gridMode: 'both' })}><svg viewBox="0 0 64 40"><path d="M4 8h56M4 20h56M4 32h56M12 4v32M28 4v32M44 4v32" /></svg></TrendChoiceButton>
      <TrendChoiceButton label="Sem grade" active={visual.gridMode === 'none'} onClick={() => onVisualChange({ gridMode: 'none' })}><svg viewBox="0 0 64 40"><path d="M4 33h56" /></svg></TrendChoiceButton>
    </div>
    <ColorControl label="Primeiro plano" color={visual.foregroundColor || '#d8dee9'} onChange={(foregroundColor) => onVisualChange({ foregroundColor })} />
    <ColorControl label="Plano de fundo" color={visual.backgroundColor || '#111923'} onChange={(backgroundColor) => onVisualChange({ backgroundColor })} />
    <label>Rótulo da legenda<input value={selected.legendLabel ?? selected.binding.pointName} onChange={(e) => onSeriesChange(selectedKey, { legendLabel: e.currentTarget.value })} /></label>
    <ColorControl label="Cor" color={selected.color} onChange={(color) => onSeriesChange(selectedKey, { color })} />
    <label>Espessura <span className={styles.rangeValue}>{selected.lineWidth ?? 2}</span><input type="range" min="1" max="8" value={selected.lineWidth ?? 2} onChange={(e) => onSeriesChange(selectedKey, { lineWidth: Number(e.currentTarget.value) })} /></label>
    <button type="button" className={styles.removeButton} disabled={series.length <= 1} onClick={() => onSeriesRemove(selectedKey)}>Excluir tag selecionada</button>
    <label>Estilo<select value={selected.lineStyle ?? 'solid'} onChange={(e) => onSeriesChange(selectedKey, { lineStyle: e.currentTarget.value as TrendLineStyle })}><option value="solid">Sólido</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option></select></label>
    <label>Marcador<select value={selected.marker ?? 'none'} onChange={(e) => onSeriesChange(selectedKey, { marker: e.currentTarget.value as TrendMarker })}><option value="none">Nenhum</option><option value="circle">Círculo</option><option value="square">Quadrado</option></select></label>
    {series.length > 1 && <label className={styles.check}><input type="checkbox" checked={selected.primaryScale === true} onChange={(e) => onSeriesChange(selectedKey, { primaryScale: e.currentTarget.checked })} />★ Escala principal</label>}
    <label className={styles.check}><input type="checkbox" checked={visual.showRegression} onChange={(e) => onVisualChange({ showRegression: e.currentTarget.checked })} />Linha de regressão</label>
    <label className={styles.check}><input type="checkbox" checked={visual.hideLegend === true} onChange={(e) => onVisualChange({ hideLegend: e.currentTarget.checked })} data-testid="trend-hide-legend" />Ocultar legenda</label>
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

function TrendChoiceButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  const styles = useStyles2(getStyles);
  return <button type="button" className={active ? styles.choiceActive : styles.choice} aria-label={label} title={label} aria-pressed={active} onClick={onClick}>{children}</button>;
}
const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
  width: 280px; flex: 0 0 280px; min-height:0; max-height:100%; overflow-x:hidden; overflow-y:auto; scrollbar-gutter:stable; display:flex; flex-direction:column; gap:10px; padding:12px; box-sizing:border-box; color:var(--text-primary); background:var(--surface-primary); border-left:1px solid var(--border-color); font-size:11px;
  label { display:flex; flex-direction:column; gap:3px; margin:0; color:var(--text-secondary); } input, select { height:27px; min-height:27px; box-sizing:border-box; color:var(--text-primary); background:var(--input-bg); border:1px solid var(--border-color); } input[type='color'] { padding:2px; } input[type='range'] { accent-color:var(--accent); }`,
  heading: css`display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; strong { font-size:14px; } button { width:24px; height:24px; border:1px solid var(--border-color); border-radius:4px; color:var(--text-secondary); background:var(--button-bg); font-size:20px; line-height:18px; cursor:pointer; } button:hover { color:var(--text-primary); background:var(--button-hover); }`,
  removeButton: css`width:100%; min-height:28px; margin:0; border:1px solid var(--border-color); border-radius:3px; color:var(--text-primary); background:var(--button-bg); cursor:pointer; &:disabled { opacity:0.5; cursor:not-allowed; }`,
  rangeValue: css`float:right; color:var(--text-primary); font-weight:600;`,
  fontHeading: css`display:block; margin:7px 0 3px; font-size:13px;`,
  sectionHeading: css`display:block; margin:5px 0 -4px; font-size:12px; color:var(--text-primary);`,
  choiceRow: css`display:flex; gap:8px;`,
  choice: css`width:62px !important; height:46px !important; padding:4px !important; border:1px solid var(--border-color) !important; border-radius:2px !important; color:var(--text-secondary) !important; background:var(--button-bg) !important; cursor:pointer; svg { width:100%; height:100%; fill:none; stroke:currentColor; stroke-width:2; } circle { fill:currentColor; stroke:none; }`,
  choiceActive: css`width:62px !important; height:46px !important; padding:4px !important; border:2px solid var(--accent) !important; border-radius:2px !important; color:var(--text-primary) !important; background:var(--selection-bg) !important; cursor:pointer; svg { width:100%; height:100%; fill:none; stroke:currentColor; stroke-width:2; } circle { fill:currentColor; stroke:none; }`,
  check: css`flex-direction:row !important; align-items:center; input { width:14px; height:14px; min-height:14px; }`
});
