import React, { useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { OracleQueryResponse } from './oracleApi';
import { SqlResultTable } from './SqlResultTable';

interface SqlDashboardTableProps {
  id: string;
  result: OracleQueryResponse;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

interface TableFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Interaction =
  | { kind: 'drag'; pointerId: number; startX: number; startY: number; frame: TableFrame }
  | { kind: 'resize'; pointerId: number; startX: number; startY: number; frame: TableFrame };

const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;

export function SqlDashboardTable({ id, result, index, selected, onSelect }: SqlDashboardTableProps) {
  const styles = useStyles2(getStyles);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<TableFrame>(() => ({
    x: 24 + (index % 3) * 48,
    y: 88 + Math.floor(index / 3) * 48,
    width: 760,
    height: 480,
  }));
  const [interaction, setInteraction] = useState<Interaction | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteraction({ kind: 'drag', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, frame });
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteraction({ kind: 'resize', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, frame });
  };

  const moveInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const workspace = workspaceRef.current?.parentElement;
    const bounds = workspace?.getBoundingClientRect();
    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    const base = interaction.frame;

    if (interaction.kind === 'drag') {
      const maxX = bounds ? Math.max(8, bounds.width - base.width - 8) : Number.POSITIVE_INFINITY;
      const maxY = bounds ? Math.max(72, bounds.height - base.height - 8) : Number.POSITIVE_INFINITY;
      setFrame({
        ...base,
        x: Math.max(8, Math.min(maxX, base.x + deltaX)),
        y: Math.max(72, Math.min(maxY, base.y + deltaY)),
      });
      return;
    }

    const maxWidth = bounds ? Math.max(MIN_WIDTH, bounds.width - base.x - 8) : Number.POSITIVE_INFINITY;
    const maxHeight = bounds ? Math.max(MIN_HEIGHT, bounds.height - base.y - 8) : Number.POSITIVE_INFINITY;
    setFrame({
      ...base,
      width: Math.max(MIN_WIDTH, Math.min(maxWidth, base.width + deltaX)),
      height: Math.max(MIN_HEIGHT, Math.min(maxHeight, base.height + deltaY)),
    });
  };

  const finishInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setInteraction(null);
  };

  return (
    <div
      ref={workspaceRef}
      className={`${styles.tableObject} ${selected ? styles.tableObjectSelected : ''}`}
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      data-testid={`pims-sql-dashboard-result-${id}`}
      data-selected={selected ? 'true' : 'false'}
      onClick={() => onSelect(id)}
      role="button"
      tabIndex={0}
      aria-label={selected ? 'Tabela SQL selecionada' : 'Selecionar tabela SQL'}
    >
      <div className={styles.objectHeader} onPointerDown={startDrag} onPointerMove={moveInteraction} onPointerUp={finishInteraction} onPointerCancel={finishInteraction}>
        <span>Resultado da consulta SIP</span>
        <span className={styles.objectHint}>{selected ? 'SQL carregado • arraste para mover' : 'Clique para carregar o SQL'}</span>
      </div>
      <div className={styles.objectBody}>
        <SqlResultTable result={result} isLoading={false} />
      </div>
      <div className={styles.resizeHandle} onPointerDown={startResize} onPointerMove={moveInteraction} onPointerUp={finishInteraction} onPointerCancel={finishInteraction} aria-label="Redimensionar tabela" role="separator" />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  tableObject: css`
    position: absolute;
    z-index: 3;
    display: flex;
    flex-direction: column;
    min-width: min(${MIN_WIDTH}px, calc(100% - 16px));
    min-height: min(${MIN_HEIGHT}px, calc(100% - 80px));
    max-width: calc(100% - 16px);
    max-height: calc(100% - 80px);
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: var(--surface-primary);
    box-shadow: var(--shadow);
  `,
  tableObjectSelected: css`
    border-width: 2px;
    box-shadow: 0 0 0 2px var(--focus-ring), var(--shadow);
  `,
  objectHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex: 0 0 38px;
    padding: 0 12px;
    color: var(--text-primary);
    background: var(--surface-secondary);
    border-bottom: 1px solid var(--border-color);
    cursor: move;
    user-select: none;
    font-size: ${theme.typography.size.sm};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  objectHint: css`
    color: var(--text-muted);
    font-size: 11px;
    font-weight: normal;
  `,
  objectBody: css`
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 8px;
    background: var(--surface-primary);
  `,
  resizeHandle: css`
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 14px;
    height: 14px;
    border-right: 3px solid var(--accent);
    border-bottom: 3px solid var(--accent);
    border-radius: 0 0 3px 0;
    cursor: nwse-resize;
    touch-action: none;
  `,
});
