import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

export type PiDataLinkFunctionType =
  | 'PICurrVal'
  | 'PIArcVal'
  | 'PICompDat'
  | 'PISampDat'
  | 'PITimeDat'
  | 'PIAdvCalcVal'
  | 'PITimeFilter';

interface PiDataLinkToolbarProps {
  onOpenFunction: (type: PiDataLinkFunctionType) => void;
}

export function PiDataLinkToolbar({ onOpenFunction }: PiDataLinkToolbarProps) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="PI DataLink Ribbon">
      <div className={styles.group}>
        <span className={styles.groupLabel}>Valor único</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            title="Obtém o valor atual de uma PI Point."
            aria-label="Valor atual"
            data-testid="datalink-curr-val"
            onClick={() => onOpenFunction('PICurrVal')}
          >
            <span className={styles.buttonIcon}>⚡</span>
            <span className={styles.buttonText}>Valor atual</span>
          </button>
          <button
            type="button"
            className={styles.button}
            title="Obtém o valor em um horário específico."
            aria-label="Valor de Archive"
            data-testid="datalink-arc-val"
            onClick={() => onOpenFunction('PIArcVal')}
          >
            <span className={styles.buttonIcon}>⏱️</span>
            <span className={styles.buttonText}>Valor de Archive</span>
          </button>
        </div>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      <div className={styles.group}>
        <span className={styles.groupLabel}>Valor múltiplo</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            title="Obtém valores registrados no PI Archive."
            aria-label="Dados compactados"
            data-testid="datalink-comp-dat"
            onClick={() => onOpenFunction('PICompDat')}
          >
            <span className={styles.buttonIcon}>📦</span>
            <span className={styles.buttonText}>Dados compactados</span>
          </button>
          <button
            type="button"
            className={styles.button}
            title="Obtém valores interpolados em intervalos regulares."
            aria-label="Dados de amostragem"
            data-testid="datalink-samp-dat"
            onClick={() => onOpenFunction('PISampDat')}
          >
            <span className={styles.buttonIcon}>📈</span>
            <span className={styles.buttonText}>Dados de amostragem</span>
          </button>
          <button
            type="button"
            className={styles.button}
            title="Obtém valores nos timestamps especificados."
            aria-label="Dados com marcação de tempo"
            data-testid="datalink-time-dat"
            onClick={() => onOpenFunction('PITimeDat')}
          >
            <span className={styles.buttonIcon}>🏷️</span>
            <span className={styles.buttonText}>Dados com marcação de tempo</span>
          </button>
        </div>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      <div className={styles.group}>
        <span className={styles.groupLabel}>Cálculo</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.button}
            title="Calcula summaries de uma PI Point em um período."
            aria-label="Dados calculados"
            data-testid="datalink-calc-dat"
            onClick={() => onOpenFunction('PIAdvCalcVal')}
          >
            <span className={styles.buttonIcon}>∑</span>
            <span className={styles.buttonText}>Dados calculados</span>
          </button>
          <button
            type="button"
            className={styles.button}
            title="Calcula por quanto tempo uma condição foi verdadeira."
            aria-label="Tempo Filtrado"
            data-testid="datalink-time-filter"
            onClick={() => onOpenFunction('PITimeFilter')}
          >
            <span className={styles.buttonIcon}>⌛</span>
            <span className={styles.buttonText}>Tempo Filtrado</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  toolbar: css({
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    padding: `${theme.spacing(0.75)} ${theme.spacing(1.5)}`,
    background: theme.colors.background.secondary,
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    minHeight: '44px',
    boxSizing: 'border-box',
    userSelect: 'none',
  }),
  group: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.25),
  }),
  groupLabel: css({
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: theme.colors.text.secondary,
    lineHeight: 1,
    paddingLeft: theme.spacing(0.5),
  }),
  buttonRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  }),
  button: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
    fontSize: '11px',
    fontWeight: 500,
    color: theme.colors.text.primary,
    background: theme.colors.background.primary,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.shape.borderRadius(3),
    cursor: 'pointer',
    transition: 'all 0.15s ease-in-out',
    whiteSpace: 'nowrap',
    '&:hover': {
      background: theme.colors.action.hover,
      borderColor: theme.colors.border.strong,
      color: theme.colors.text.maxContrast,
    },
    '&:active': {
      background: theme.colors.action.selected,
    },
  }),
  buttonIcon: css({
    fontSize: '12px',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  buttonText: css({
    lineHeight: 1.2,
  }),
  separator: css({
    width: '1px',
    height: '28px',
    background: theme.colors.border.weak,
    margin: `0 ${theme.spacing(0.5)}`,
  }),
});
