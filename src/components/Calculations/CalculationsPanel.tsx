import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { PiPointSearchResult } from '../../pi/piDataSource';
import type { DisplayDocument } from '../../display/displayDocument';
import type { CalculationDefinition } from '../../calculations/calculationEngine';
import { CALCULATION_DRAG_MIME, serializeCalculationDragData } from '../../calculations/calculationDrag';
import { CalculationEditorDialog, type CalculationDraft } from './CalculationEditorDialog';

export interface CalculationsPanelProps {
  selectedPiPoint?: PiPointSearchResult | null;
  document?: DisplayDocument;
  onChange?: (document: DisplayDocument) => void;
  resolvePiPoint?: (name: string) => Promise<PiPointSearchResult | undefined>;
  openCalculationId?: string;
  onCalculationOpenHandled?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function CalculationsPanel({ selectedPiPoint, document, onChange, resolvePiPoint, openCalculationId, onCalculationOpenHandled, expanded, onExpandedChange }: CalculationsPanelProps) {
  const styles = useStyles2(getStyles);
  const [sessionCalculations, setSessionCalculations] = useState<CalculationDefinition[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingCalculation, setEditingCalculation] = useState<CalculationDefinition>();
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isExpanded = expanded ?? internalExpanded;
  const calculations = document?.calculations ?? sessionCalculations;

  useEffect(() => {
    if (!openCalculationId) {
      return;
    }
    const calculation = calculations.find((item) => item.id === openCalculationId);
    if (calculation) {
      setEditingCalculation(calculation);
      setIsEditorOpen(true);
    }
    onCalculationOpenHandled?.();
  }, [calculations, onCalculationOpenHandled, openCalculationId]);

  const updateCalculations = (next: CalculationDefinition[]) => {
    if (document && onChange) {
      onChange({ ...document, calculations: next });
    } else {
      setSessionCalculations(next);
    }
  };

  const openNewCalculation = () => {
    setEditingCalculation(undefined);
    setIsEditorOpen(true);
  };

  const openExistingCalculation = (calculation: CalculationDefinition) => {
    setEditingCalculation(calculation);
    setIsEditorOpen(true);
  };

  const saveCalculation = (draft: CalculationDraft) => {
    const calculation: CalculationDefinition = {
      id: editingCalculation?.id ?? String(calculations.reduce((highestId, item) => Math.max(highestId, Number(item.id) || 0), 0) + 1),
      name: draft.name,
      ...(draft.description ? { description: draft.description } : {}),
      expression: draft.expression,
      inputs: draft.inputs,
    };
    updateCalculations(editingCalculation
      ? calculations.map((item) => item.id === editingCalculation.id ? calculation : item)
      : [...calculations, calculation]);
    setIsEditorOpen(false);
    setEditingCalculation(undefined);
  };

  return (
    <section className={styles.container} data-testid="calculations-panel" aria-label="Cálculos">
      <button
        type="button"
        className={styles.collapseHeader}
        aria-expanded={isExpanded}
        aria-controls="calculations-panel-content"
        data-testid="calculations-toggle"
        onClick={() => {
          const nextExpanded = !isExpanded;
          onExpandedChange?.(nextExpanded);
          if (expanded === undefined) {
            setInternalExpanded(nextExpanded);
          }
        }}
      >
        <span className={styles.collapseHeaderTitle}><CalculatorIcon /> <span>Cálculos</span></span>
        <ChevronIcon expanded={isExpanded} />
      </button>

      {isExpanded && <div id="calculations-panel-content" className={styles.content}>
        <div className={styles.intro}>
          <p>Crie expressões com PI Points em um editor dedicado.</p>
          <button type="button" className={styles.newButton} data-testid="calculation-new" onClick={openNewCalculation}>
            <span aria-hidden="true">+</span> Novo cálculo
          </button>
        </div>

        <div className={styles.savedSection}>
          <div className={styles.sectionTitle}>Cálculos salvos</div>
          {calculations.length === 0 ? (
            <div className={styles.empty} data-testid="calculations-empty">
              <CalculatorIcon />
              <span>Nenhum cálculo criado.</span>
              <small>Use “Novo cálculo” para abrir o editor.</small>
            </div>
          ) : (
            <ul className={styles.list}>
              {calculations.map((calculation) => (
                <li key={calculation.id} className={styles.calculation} data-testid={`calculation-${calculation.id}`}>
                  <button
                    type="button"
                    className={styles.calculationOpen}
                    draggable
                    title={`Arraste ${calculation.name} para o display`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData(CALCULATION_DRAG_MIME, serializeCalculationDragData(calculation.id));
                      event.dataTransfer.setData('text/plain', calculation.name);
                      hideNativeDragImage(event.dataTransfer);
                    }}
                    onClick={() => openExistingCalculation(calculation)}
                  >
                    <span className={styles.calculationIcon}><CalculatorIcon /></span>
                    <span className={styles.calculationText}>
                      <strong>{calculation.name}</strong>
                    </span>
                  </button>
                  <div className={styles.actions}>
                    <button type="button" className={styles.removeButton} aria-label={`Remover ${calculation.name}`} onClick={() => updateCalculations(calculations.filter((item) => item.id !== calculation.id))}>Remover</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>}

      {isEditorOpen && (
        <CalculationEditorDialog
          initialCalculation={editingCalculation}
          selectedPiPoint={selectedPiPoint}
          resolvePiPoint={resolvePiPoint}
          isNameTaken={(name) => calculations.some((item) => item.id !== editingCalculation?.id && item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())}
          onCancel={() => { setIsEditorOpen(false); setEditingCalculation(undefined); }}
          onSave={saveCalculation}
        />
      )}
    </section>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: ${theme.spacing(1.5)};
    overflow: auto;
    color: var(--text-primary);
  `,
  collapseHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 32px;
    padding: 0;
    border: 0;
    color: var(--assets-header-text);
    background: transparent;
    cursor: pointer;
    text-align: left;
    &:hover { color: var(--text-primary); }
  `,
  collapseHeaderTitle: css`
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 16px;
    font-weight: 600;
    svg { color: var(--accent-hover); }
  `,
  content: css`
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 12px;
  `,
  intro: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-subtle);
    p { margin: 0; color: var(--text-secondary); font-size: 11px; line-height: 1.4; }
  `,
  newButton: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 36px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    &:hover { background: var(--accent-hover); }
    span { font-size: 18px; line-height: 0; }
  `,
  savedSection: css`display: flex; flex-direction: column; gap: 5px; min-height: 0;`,
  sectionTitle: css`color: var(--text-secondary); font-size: 11px; font-weight: 600;`,
  empty: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 25px 12px;
    border: 1px dashed var(--border-color);
    color: var(--text-muted);
    text-align: center;
    svg { width: 26px; height: 26px; color: var(--accent-hover); }
    span { font-size: 12px; }
    small { font-size: 10px; }
  `,
  list: css`display: flex; flex-direction: column; gap: 3px; margin: 0; padding: 0; list-style: none;`,
  calculation: css`
    display: flex;
    align-items: center;
    min-height: 34px;
    padding: 3px 6px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    background: var(--surface-secondary);
  `,
  calculationOpen: css`
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 8px;
    padding: 0;
    border: 0;
    color: var(--text-primary);
    background: transparent;
    cursor: pointer;
    text-align: left;
    strong { overflow: hidden; color: var(--accent-hover); text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    code { overflow: hidden; color: var(--text-secondary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    &:hover strong { color: var(--accent-hover); }
    cursor: grab;
    &:active { cursor: grabbing; }
  `,
  calculationIcon: css`
    display: grid;
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    place-items: center;
    color: var(--accent-hover);
    svg { width: 15px; height: 15px; }
  `,
  calculationText: css`
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  `,
  actions: css`display: flex; align-items: center; justify-content: flex-end; gap: 7px;`,
  removeButton: css`
    padding: 2px 3px;
    border: 0;
    color: var(--danger);
    background: transparent;
    cursor: pointer;
    font-size: 10px;
    &:hover { text-decoration: underline; }
  `,
});

function hideNativeDragImage(dataTransfer: DataTransfer): void {
  if (typeof dataTransfer.setDragImage !== 'function') {
    return;
  }
  const image = document.createElement('span');
  image.style.cssText = 'position: fixed; top: -1px; left: -1px; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
  document.body.appendChild(image);
  dataTransfer.setDragImage(image, 0, 0);
  globalThis.requestAnimationFrame(() => image.remove());
}

function CalculatorIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2" />
  </svg>;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={expanded ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
  </svg>;
}
