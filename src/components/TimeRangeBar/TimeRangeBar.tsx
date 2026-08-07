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
}

export function TimeRangeBar({ selection, onChange }: TimeRangeBarProps) {
  const styles = useStyles2(getStyles);
  const [startExpression, setStartExpression] = useState(selection.startExpression);
  const [endExpression, setEndExpression] = useState(selection.endExpression);
  const [error, setError] = useState(false);

  useEffect(() => {
    setStartExpression(selection.startExpression);
    setEndExpression(selection.endExpression);
    setError(false);
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

  return (
    <form className={styles.bar} data-testid="time-range-bar" aria-label="Período do display" onSubmit={apply}>
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
        <span className={styles.duration} data-testid="time-range-duration" title="Duração do período">{duration}</span>
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
    display: flex;
    align-items: center;
    flex: 0 0 46px;
    min-height: 46px;
    gap: 10px;
    padding: 5px 10px;
    box-sizing: border-box;
    color: #aeb9c7;
    background: #071f3a;
    border-top: 3px solid #b87921;
  `,
  input: css`
    width: 205px;
    height: 31px;
    box-sizing: border-box;
    padding: 4px 12px;
    border: 1px solid #274766;
    border-radius: 2px;
    outline: none;
    color: #b8c4d2;
    background: #092844;
    text-align: center;

    &:focus {
      border-color: #6e8bab;
    }
  `,
  inputError: css`
    width: 205px;
    height: 31px;
    box-sizing: border-box;
    padding: 4px 12px;
    border: 1px solid #d14a4a;
    border-radius: 2px;
    outline: none;
    color: #ffffff;
    background: #36202a;
    text-align: center;
  `,
  iconButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 31px;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: #aeb9c7;
    cursor: pointer;

    &:hover { color: #ffffff; background: rgba(255, 255, 255, 0.08); }
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
    width: 40px;
    height: 31px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  `,
  arrowLeft: css`
    width: 0;
    height: 0;
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    border-right: 28px solid #8997a8;
  `,
  arrowRight: css`
    width: 0;
    height: 0;
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    border-left: 28px solid #8997a8;
  `,
  duration: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 108px;
    height: 31px;
    box-sizing: border-box;
    border: 1px solid #31506f;
    border-radius: 4px;
    color: #9eabba;
    background: #0c2948;
    font-size: 12px;
  `,
  nowButton: css`
    width: 108px;
    height: 31px;
    border: 1px solid #456382;
    border-radius: 4px;
    color: #b4c0ce;
    background: #0b2746;
    cursor: pointer;

    &:hover { color: #ffffff; border-color: #6f8aa7; }
  `,
  error: css`
    color: #ff8b8b;
    font-size: 10px;
    white-space: nowrap;
  `,
});

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 7v5h-5" /><path d="M18 12a7 7 0 1 1-2-5" /></svg>;
}
