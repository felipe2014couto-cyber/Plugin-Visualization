import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { PiDataLinkFunctionType } from './PiDataLinkToolbar';

export interface PiDataLinkSidebarPanelProps {
  onOpenFunction: (type: PiDataLinkFunctionType) => void;
}

interface FunctionItem {
  type: PiDataLinkFunctionType;
  title: string;
  formula: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

interface FunctionGroup {
  name: string;
  items: FunctionItem[];
}

export function PiDataLinkSidebarPanel({ onOpenFunction }: PiDataLinkSidebarPanelProps) {
  const styles = useStyles2(getStyles);

  const groups: FunctionGroup[] = [
    {
      name: 'VALOR ÚNICO',
      items: [
        {
          type: 'PICurrVal',
          title: 'Valor atual',
          formula: '=PICurrVal',
          description: 'Valor instantâneo mais recente do tag',
          icon: <BoltIcon />,
          iconBg: 'rgba(245, 158, 11, 0.15)',
          iconColor: '#f59e0b',
        },
        {
          type: 'PIArcVal',
          title: 'Valor de Archive',
          formula: '=PIArcVal',
          description: 'Valor gravado/interpolado na data e hora',
          icon: <ClockIcon />,
          iconBg: 'rgba(168, 85, 247, 0.15)',
          iconColor: '#a855f7',
        },
      ],
    },
    {
      name: 'VALOR MÚLTIPLO',
      items: [
        {
          type: 'PICompDat',
          title: 'Dados compactados',
          formula: '=PICompDat',
          description: 'Série de dados gravados no período com Spill',
          icon: <ArchiveIcon />,
          iconBg: 'rgba(217, 119, 6, 0.15)',
          iconColor: '#d97706',
        },
        {
          type: 'PISampDat',
          title: 'Dados de amostragem',
          formula: '=PISampDat',
          description: 'Série amostrada em intervalos (ex: 5m, 1h)',
          icon: <ChartIcon />,
          iconBg: 'rgba(59, 130, 246, 0.15)',
          iconColor: '#3b82f6',
        },
        {
          type: 'PITimeDat',
          title: 'Dados com marcação de tempo',
          formula: '=PITimeDat',
          description: 'Valores para timestamps específicos (ex: A1:A10)',
          icon: <TagIcon />,
          iconBg: 'rgba(16, 185, 129, 0.15)',
          iconColor: '#10b981',
        },
      ],
    },
    {
      name: 'CÁLCULO',
      items: [
        {
          type: 'PIAdvCalcVal',
          title: 'Dados calculados',
          formula: '=PIAdvCalcVal',
          description: 'Média, Mínimo, Máximo, Total, Desvio Padrão',
          icon: <SigmaIcon />,
          iconBg: 'rgba(211, 59, 145, 0.15)',
          iconColor: '#d33b91',
        },
        {
          type: 'PITimeFilter',
          title: 'Tempo Filtrado',
          formula: '=PITimeFilter',
          description: 'Duração ou % em que condição foi atendida',
          icon: <HourglassIcon />,
          iconBg: 'rgba(6, 182, 212, 0.15)',
          iconColor: '#06b6d4',
        },
      ],
    },
  ];

  return (
    <div className={styles.container} data-testid="pi-datalink-sidebar-panel">
      <div className={styles.introBox}>
        <div className={styles.introTitle}>
          <PiIcon />
          <span>Funções PI DataLink</span>
        </div>
        <p className={styles.introDesc}>
          Selecione uma função abaixo para configurar e inserir na célula selecionada da planilha.
        </p>
      </div>

      <div className={styles.groupsWrapper}>
        {groups.map((group) => (
          <div key={group.name} className={styles.groupSection}>
            <div className={styles.groupHeader}>{group.name}</div>
            <div className={styles.itemsList}>
              {group.items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className={styles.itemButton}
                  data-testid={`datalink-sidebar-btn-${item.type}`}
                  onClick={() => onOpenFunction(item.type)}
                >
                  <div
                    className={styles.itemIconContainer}
                    style={{ background: item.iconBg, color: item.iconColor }}
                  >
                    {item.icon}
                  </div>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemTitleRow}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span className={styles.itemFormulaBadge}>{item.formula}</span>
                    </div>
                    <span className={styles.itemDesc}>{item.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow-y: auto;
    padding: 10px 12px 20px;
    box-sizing: border-box;
    gap: 14px;
    background: transparent;
  `,
  introBox: css`
    padding: 10px 12px;
    background: var(--surface-secondary, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  introTitle: css`
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #ffffff);
    svg {
      color: var(--accent, #d33b91);
    }
  `,
  introDesc: css`
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-secondary, #aeb3bf);
  `,
  groupsWrapper: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
  `,
  groupSection: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
  `,
  groupHeader: css`
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--text-muted, #7f8a9a);
    text-transform: uppercase;
    padding-left: 2px;
  `,
  itemsList: css`
    display: flex;
    flex-direction: column;
    gap: 5px;
  `,
  itemButton: css`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--surface-secondary, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--text-primary, #ffffff);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease-in-out;
    box-sizing: border-box;

    &:hover {
      background: var(--button-hover, rgba(255, 255, 255, 0.08));
      border-color: var(--accent, #d33b91);
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    &:active {
      transform: translateY(0);
    }
  `,
  itemIconContainer: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    flex-shrink: 0;
    svg {
      width: 17px;
      height: 17px;
    }
  `,
  itemInfo: css`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    gap: 2px;
  `,
  itemTitleRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  `,
  itemTitle: css`
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #ffffff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemFormulaBadge: css`
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 10px;
    font-weight: 500;
    color: var(--accent, #d33b91);
    background: var(--selection-bg, rgba(211, 59, 145, 0.12));
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
  `,
  itemDesc: css`
    font-size: 10.5px;
    line-height: 1.3;
    color: var(--text-secondary, #aeb3bf);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  `,
});

/* Icons */
function PiIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M9 7v10M15 7v10" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M18 9l-5 5-4-4-6 6" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function SigmaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M18 4H6l7 8-7 8h12" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  );
}
