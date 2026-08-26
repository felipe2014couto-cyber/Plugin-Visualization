import React from 'react';
import { css } from '@emotion/css';
import { useStyles2 } from '@grafana/ui';

export type PiDataLinkFunctionType = 'PICurrVal' | 'PIArcVal' | 'PICompDat' | 'PISampDat' | 'PITimeDat' | 'PIAdvCalcVal' | 'PITimeFilter' | 'SIPQuery';

interface PiDataLinkToolbarProps {
  activeFunction: PiDataLinkFunctionType | null;
  onOpenFunction: (type: PiDataLinkFunctionType) => void;
}

interface RibbonItem {
  type: PiDataLinkFunctionType;
  label: string;
  shortLabel: string;
  testId: string;
  color: string;
  icon: React.ReactNode;
}

const RIBBON_ITEMS: readonly RibbonItem[] = [
  { type: 'PICurrVal', label: 'Último valor', shortLabel: 'Último valor', testId: 'datalink-curr-val', color: '#f5a000', icon: <BoltIcon /> },
  { type: 'PIArcVal', label: 'Valor de Archive', shortLabel: 'Valor de Archive', testId: 'datalink-arc-val', color: '#b66cff', icon: <ClockIcon /> },
  { type: 'PICompDat', label: 'Dados compactados', shortLabel: 'Compactados', testId: 'datalink-comp-dat', color: '#f5a000', icon: <ArchiveIcon /> },
  { type: 'PITimeFilter', label: 'Tempo filtrado', shortLabel: 'Tempo filtrado', testId: 'datalink-time-filter', color: '#11cfe3', icon: <HourglassIcon /> },
  { type: 'PISampDat', label: 'Dados de amostragem', shortLabel: 'Amostragem', testId: 'datalink-samp-dat', color: '#4285f4', icon: <ChartIcon /> },
  { type: 'PITimeDat', label: 'Dados com marcação de tempo', shortLabel: 'Marcação de tempo', testId: 'datalink-time-dat', color: '#1acb9b', icon: <TagIcon /> },
  { type: 'PIAdvCalcVal', label: 'Dados calculados', shortLabel: 'Calculados', testId: 'datalink-calc-dat', color: '#e83ca7', icon: <SigmaIcon /> },
  { type: 'SIPQuery', label: 'Consulta SIP (SQL)', shortLabel: 'SIP', testId: 'datalink-sip-query', color: '#5794f2', icon: <DatabaseIcon /> },
];

export function PiDataLinkToolbar({ activeFunction, onOpenFunction }: PiDataLinkToolbarProps) {
  const styles = useStyles2(getStyles);
  return <div className={styles.ribbon} role="toolbar" aria-label="Funções PI DataLink" data-testid="pi-datalink-ribbon">
    {RIBBON_ITEMS.map((item) => <button key={item.type} type="button" className={activeFunction === item.type ? styles.buttonActive : styles.button} aria-label={item.label} aria-pressed={activeFunction === item.type} title={item.label} data-testid={item.testId} onClick={() => onOpenFunction(item.type)}>
      <span className={styles.icon} style={{ color: item.color }} aria-hidden="true">{item.icon}</span><span className={styles.label}>{item.shortLabel}</span>
    </button>)}
  </div>;
}

const getStyles = () => ({
  ribbon: css`display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 64px; flex: 0 0 auto; width: 100%; min-width: 0; overflow: hidden; border-bottom: 1px solid var(--border-color); color: var(--assets-header-text); background: var(--assets-header-bg); user-select: none;`,
  button: css`display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; min-width: 0; min-height: 0; gap: 3px; padding: 6px 4px; border: 0; border-right: 1px solid var(--assets-header-divider); border-bottom: 1px solid var(--assets-header-divider); color: var(--assets-header-text); background: transparent; cursor: pointer; font-size: 11px; font-weight: 500; line-height: 1.05; text-align: center; overflow: hidden; &:hover { color: var(--assets-header-text); background: var(--assets-header-hover); } &:focus-visible { outline: 0; box-shadow: inset 0 0 0 2px var(--assets-header-focus); }`,
  buttonActive: css`display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; min-width: 0; min-height: 0; gap: 3px; padding: 6px 4px; border: 0; border-right: 1px solid var(--assets-header-divider); border-bottom: 1px solid var(--assets-header-divider); color: var(--assets-header-text); background: var(--assets-header-active); box-shadow: inset 0 -3px 0 var(--assets-header-focus); cursor: pointer; font-size: 11px; font-weight: 600; line-height: 1.05; text-align: center; overflow: hidden; &:hover { background: var(--assets-header-hover); } &:focus-visible { outline: 0; box-shadow: inset 0 0 0 2px var(--assets-header-focus), inset 0 -3px 0 var(--assets-header-focus); }`,
  icon: css`display: inline-flex; flex: 0 0 auto; svg { width: 20px; height: 20px; }`,
  label: css`display: block; min-width: 0; max-width: 100%; white-space: normal; overflow-wrap: normal;`,
});

function BoltIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m13 2-10 12h9l-1 8 10-12h-9z" /></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>; }
function ArchiveIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M10 13h4" /></svg>; }
function HourglassIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" /></svg>; }
function ChartIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19V5M4 19h16M7 15l4-5 3 3 5-7" /></svg>; }
function TagIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12V5h7l9 9-7 7z" /><circle cx="8" cy="8" r="1" /></svg>; }
function SigmaIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 4H7l6 8-6 8h11" /></svg>; }
function DatabaseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>;
}
