import React, { FormEvent, useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  formatRelativeDuration,
  moveTimeSelectionToNow,
  resolveTimeSelection,
  shiftTimeSelection,
  type DisplayTimeSelection,
} from '../../time/timeRange';

export interface TimeRangeBarProps {
  selection: DisplayTimeSelection;
  onChange: (selection: DisplayTimeSelection) => void;
  compact?: boolean;
}

const QUICK_RANGES = [
  { label: '1 h', expression: '1h' },
  { label: '8 h', expression: '8h' },
  { label: '1 d', expression: '1d' },
  { label: '1 w', expression: '1w' },
  { label: '1 mo', expression: '1mo' },
] as const;

export function TimeRangeBar({ selection, onChange, compact = false }: TimeRangeBarProps) {
  const styles = useStyles2(getStyles);
  const [startExpression, setStartExpression] = useState(selection.startExpression);
  const [endExpression, setEndExpression] = useState(selection.endExpression);
  const [error, setError] = useState(false);
  const [quickRangesOpen, setQuickRangesOpen] = useState(false);

  useEffect(() => {
    setStartExpression(selection.startExpression);
    setEndExpression(selection.endExpression);
    setError(false);
    setQuickRangesOpen(false);
  }, [selection]);

  const apply = (event?: FormEvent) => {
    event?.preventDefault();
    const next = resolveTimeSelection(startExpression, endExpression);
    if (!next) {
      setError(true);
      return;
    }
    setError(false);
    onChange(next);
  };

  const shift = (direction: -1 | 1) => onChange(shiftTimeSelection(selection, direction));
  const now = () => onChange(moveTimeSelectionToNow(selection));
  const duration = formatRelativeDuration(selection.range.to - selection.range.from);
  const selectQuickRange = (expression: string) => {
    const next = resolveTimeSelection(`*-${expression}`, '*');
    if (next) {
      onChange(next);
      setQuickRangesOpen(false);
    }
  };

  return (
    <form className={`${styles.bar} ${compact ? styles.compactBar : ''}`} data-testid="time-range-bar" aria-label="Período do display" onSubmit={apply}>
      {quickRangesOpen && (
        <div className={`${styles.quickRanges} ${compact ? styles.compactQuickRanges : ''}`} role="group" aria-label="Períodos rápidos" data-testid="time-range-presets">
          {QUICK_RANGES.map((quickRange) => {
            const selected = selection.endExpression === '*' && selection.startExpression === `*-${quickRange.expression}`;
            return (
              <button
                key={quickRange.expression}
                type="button"
                className={selected ? styles.quickRangeActive : styles.quickRange}
                aria-pressed={selected}
                data-testid={`time-range-preset-${quickRange.expression}`}
                onClick={() => selectQuickRange(quickRange.expression)}
              >
                {quickRange.label}
              </button>
            );
          })}
        </div>
      )}
      <input
        className={error ? styles.inputError : styles.input}
        value={startExpression}
        data-testid="time-range-start"
        aria-label="Início do período"
        title="Início: use *-8h, *-30m ou uma data"
        onChange={(event) => setStartExpression(event.target.value)}
      />
      <button type="submit" className={styles.iconButton} data-testid="time-range-apply" aria-label="Aplicar período" title="Aplicar período">
        <RefreshIcon />
      </button>
      <div className={styles.navigation} role="group" aria-label="Navegar no tempo">
        <button type="button" className={styles.arrowButton} data-testid="time-range-back" aria-label="Período anterior" title="Período anterior" onClick={() => shift(-1)}><span className={styles.arrowLeft} /></button>
        <button
          type="button"
          className={styles.duration}
          data-testid="time-range-duration"
          title="Selecionar duração do período"
          aria-label="Selecionar duração do período"
          aria-expanded={quickRangesOpen}
          onClick={() => setQuickRangesOpen((open) => !open)}
        >
          {duration}
        </button>
        <button type="button" className={styles.arrowButton} data-testid="time-range-forward" aria-label="Próximo período" title="Próximo período" onClick={() => shift(1)}><span className={styles.arrowRight} /></button>
      </div>
      {error && <span className={styles.error} role="alert">Período inválido</span>}
      <button type="button" className={styles.nowButton} data-testid="time-range-now" onClick={now}>Agora</button>
      <input
        className={error ? styles.inputError : styles.input}
        value={endExpression}
        data-testid="time-range-end"
        aria-label="Fim do período"
        title="Fim: use *, um tempo relativo ou uma data"
        onChange={(event) => setEndExpression(event.target.value)}
      />
    </form>
  );
}

const getStyles = (_theme: GrafanaTheme2) => ({
  bar: css`
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 0 68px;
    min-height: 68px;
    gap: 10px;
    margin: 8px;
    padding: 8px 12px;
    box-sizing: border-box;
    color: var(--text-secondary);
    background: var(--surface-primary);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    background: linear-gradient(110deg, var(--surface-primary), var(--surface-secondary));
    overflow: visible;
  `,
  compactBar: css`
    flex: 0 0 44px;
    min-height: 44px;
    margin: 0;
    padding: 5px 12px;
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  `,
  quickRanges: css`
    position: absolute;
    z-index: 4;
    left: 50%;
    top: -41px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 7px;
    border: 1px solid var(--accent);
    border-bottom: 0;
    background: var(--surface-elevated);
    box-shadow: var(--shadow);
  `,
  compactQuickRanges: css`
    top: calc(100% + 1px);
    border-top: 0;
    border-bottom: 1px solid var(--accent);
  `,
  quickRange: css`
    min-width: 52px;
    height: 31px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 14px;

    &:hover { background: var(--button-hover); border-color: var(--accent-hover); }
  `,
  quickRangeActive: css`
    min-width: 52px;
    height: 31px;
    padding: 0 12px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-size: 14px;
  `,
  input: css`
    width: 205px;
    height: 44px;
    box-sizing: border-box;
    padding: 4px 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    text-align: center;

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--focus-ring);
    }
  `,
  inputError: css`
    width: 205px;
    height: 44px;
    box-sizing: border-box;
    padding: 4px 12px;
    border: 1px solid var(--danger);
    border-radius: 2px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    text-align: center;
  `,
  iconButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 44px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 12px;
    background: var(--button-bg);
    color: var(--text-secondary);
    cursor: pointer;

    &:hover { color: var(--text-primary); background: var(--button-hover); }
  `,
  navigation: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    margin: 0 auto;
  `,
  arrowButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--button-bg);
    cursor: pointer;
  `,
  arrowLeft: css`
    width: 0;
    height: 0;
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    border-right: 28px solid var(--text-secondary);
  `,
  arrowRight: css`
    width: 0;
    height: 0;
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    border-left: 28px solid var(--text-secondary);
  `,
  duration: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 126px;
    height: 44px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    color: var(--text-secondary);
    background: var(--button-bg);
    font-size: 12px;
    cursor: pointer;

    &:hover { color: var(--text-primary); border-color: var(--accent-hover); }
  `,
  nowButton: css`
    width: 136px;
    height: 44px;
    border: 1px solid var(--accent);
    border-radius: 12px;
    color: var(--text-primary);
    background: var(--selection-bg);
    cursor: pointer;

    &:hover { color: var(--text-primary); border-color: var(--accent-hover); }
  `,
  error: css`
    color: var(--danger);
    font-size: 10px;
    white-space: nowrap;
  `,
});

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 7v5h-5" /><path d="M18 12a7 7 0 1 1-2-5" /></svg>;
}
