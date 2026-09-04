import React from 'react';
import { css } from '@emotion/css';
import type { PiPointMetadata } from '../../../pi/piDataSource';
import type { CalculationDefinition } from '../../../calculations/calculationEngine';

export interface PiPointInfoPanelProps {
  pointName: string;
  value: string | number | undefined;
  metadata?: PiPointMetadata;
  loading?: boolean;
  error?: string;
  onClose?: () => void;
  calculation?: CalculationDefinition;
  availablePoints?: { label: string }[];
  onSelectPoint?: (index: number) => void;
}

export function PiPointInfoPanel({ pointName, value, metadata, loading = false, error, onClose, calculation, availablePoints, onSelectPoint }: PiPointInfoPanelProps) {
  const styles = getStyles();
  if (calculation) {
    return <aside className={styles.panel} data-testid="trend-point-info-panel" aria-label="Informações do cálculo">
      <div className={styles.header}><strong>{calculation.name}</strong>{onClose && <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar informações da tag" data-testid="trend-point-info-close">×</button>}</div>
      {availablePoints && availablePoints.length > 1 && (
        <div className={styles.selector}>
          <select value={pointName} onChange={(e) => onSelectPoint?.(e.target.selectedIndex)}>
            {availablePoints.map((p, i) => <option key={i} value={p.label}>{p.label}</option>)}
          </select>
        </div>
      )}
      <dl className={styles.list}>
        <dt>Tipo de item</dt><dd>Cálculo do tag do PI</dd>
        <dt>Nome</dt><dd>{calculation.name}</dd>
        <dt>Descrição</dt><dd>{calculation.description || '—'}</dd>
        <dt>Expressão</dt><dd>{calculation.expression || '—'}</dd>
      </dl>
    </aside>;
  }
  const entries: Array<[string, string | number | undefined]> = [
    ['Nome', metadata?.name ?? pointName], ['Valor', value], ['Descrição', metadata?.description],
    ['Instrumentação', metadata?.instrumentTag], ['Span', metadata?.span], ['Point type', metadata?.pointType],
    ['Zero', metadata?.zero], ['CompDev', metadata?.compDev], ['ExcDev', metadata?.excDev], ['Eng units', metadata?.engineeringUnit],
  ];
  return <aside className={styles.panel} data-testid="trend-point-info-panel" aria-label="Informações da PI Point">
    <div className={styles.header}><strong>Informações da tag</strong>{onClose && <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar informações da tag" data-testid="trend-point-info-close">×</button>}</div>
    {availablePoints && availablePoints.length > 1 && (
      <div className={styles.selector}>
        <select value={pointName} onChange={(e) => onSelectPoint?.(e.target.selectedIndex)}>
          {availablePoints.map((p, i) => <option key={i} value={p.label}>{p.label}</option>)}
        </select>
      </div>
    )}
    {loading && <span className={styles.status}>Carregando informações da PI Point...</span>}
    {error && <span className={styles.error}>{error}</span>}
    <dl className={styles.list}>{entries.map(([label, item]) => <React.Fragment key={label}><dt>{label}</dt><dd>{item === undefined || item === '' ? '—' : String(item)}</dd></React.Fragment>)}</dl>
  </aside>;
}

function getStyles() { return { panel: css`flex:0 0 300px;width:300px;min-width:0;min-height:0;max-height:100%;box-sizing:border-box;overflow:auto;border-left:1px solid var(--border-color);background:var(--panel-bg);color:var(--text-primary);padding-bottom:12px;`, header: css`min-height:42px;box-sizing:border-box;padding:8px 10px 8px 14px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;font-weight:600;`, selector: css`padding:12px 14px;border-bottom:1px solid var(--border-color);select{width:100%;padding:6px;border:1px solid var(--border-color);background:var(--input-bg);color:var(--text-primary);border-radius:4px;}`, closeButton: css`width:28px;height:28px;padding:0;border:1px solid var(--border-color);border-radius:4px;background:var(--button-bg);color:var(--text-primary);font-size:22px;line-height:1;cursor:pointer;&:hover{background:var(--button-hover);border-color:var(--accent);}`, status: css`display:block;padding:12px 14px;color:var(--text-secondary);font-size:12px;`, error: css`display:block;padding:12px 14px;color:var(--error-text, #e24d42);font-size:12px;`, list: css`display:grid;grid-template-columns:minmax(90px, 1fr) minmax(0, 1.4fr);gap:0;margin:12px 14px;border:1px solid var(--border-color);font-size:12px;dt,dd{margin:0;padding:8px;border-bottom:1px solid var(--border-color);word-break:break-word;}dt{color:var(--text-secondary);background:var(--input-bg);font-weight:600;}dd{color:var(--text-primary);}dt:nth-last-of-type(1),dd:last-child{border-bottom:0;}` }; }
