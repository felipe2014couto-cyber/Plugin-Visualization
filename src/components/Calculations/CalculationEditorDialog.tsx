import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { PiPointSearchResult } from '../../pi/piDataSource';
import { createPiPointBinding } from '../../pi/piPointBinding';
import { PI_POINT_DRAG_MIME, parsePiPointDragData } from '../../pi/piPointDrag';
import type { CalculationDefinition, CalculationInput } from '../../calculations/calculationEngine';

export interface CalculationDraft {
  name: string;
  description: string;
  expression: string;
  inputs: CalculationInput[];
}

export interface CalculationEditorDialogProps {
  initialCalculation?: CalculationDefinition;
  selectedPiPoint?: PiPointSearchResult | null;
  resolvePiPoint?: (name: string) => Promise<PiPointSearchResult | undefined>;
  isNameTaken?: (name: string) => boolean;
  onCancel: () => void;
  onSave: (draft: CalculationDraft) => void;
}

export function CalculationEditorDialog({ initialCalculation, selectedPiPoint, resolvePiPoint, isNameTaken, onCancel, onSave }: CalculationEditorDialogProps) {
  const styles = useStyles2(getStyles);
  const [name, setName] = useState(initialCalculation?.name ?? '');
  const [description, setDescription] = useState(initialCalculation?.description ?? '');
  const [expression, setExpression] = useState(initialCalculation?.expression ?? '');
  const [inputs, setInputs] = useState<CalculationInput[]>(initialCalculation?.inputs ?? []);
  const [validationError, setValidationError] = useState('');
  const [isDropActive, setIsDropActive] = useState(false);
  const [isResolvingInputs, setIsResolvingInputs] = useState(false);

  useEffect(() => {
    setName(initialCalculation?.name ?? '');
    setDescription(initialCalculation?.description ?? '');
    setExpression(initialCalculation?.expression ?? '');
    setInputs(initialCalculation?.inputs ?? []);
    setValidationError('');
  }, [initialCalculation]);

  const appendToken = (token: string) => {
    setExpression((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${token} `);
    setValidationError('');
  };

  const appendPiPoint = (point: PiPointSearchResult | undefined) => {
    if (!point) {
      return;
    }
    const binding = createPiPointBinding(point);
    if (!binding) {
      setValidationError('Este PI Point não possui dados suficientes para ser usado no cálculo.');
      return;
    }
    appendToken(point.name);
    setInputs((current) => current.some((input) => input.name === point.name)
      ? current
      : [...current, { name: point.name, binding }]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedExpression = expression.trim();
    if (!normalizedName || !normalizedExpression) {
      setValidationError('Informe um nome e uma expressão para o cálculo.');
      return;
    }
    if (isNameTaken?.(normalizedName)) {
      setValidationError('Já existe um cálculo com esse nome. Escolha outro nome.');
      return;
    }
    setIsResolvingInputs(true);
    setValidationError('');
    try {
      const knownNames = new Set(inputs.map((input) => input.name.toLocaleLowerCase()));
      const missingNames = extractTagNames(normalizedExpression)
        .filter((tagName) => !knownNames.has(tagName.toLocaleLowerCase()));
      const resolvedInputs = await Promise.all(missingNames.map(async (tagName) => {
        const point = await resolvePiPoint?.(tagName);
        if (!point) {
          throw new Error(`Não foi possível localizar o PI Point "${tagName}". Verifique o nome ou use o arraste da pesquisa.`);
        }
        const binding = createPiPointBinding(point);
        if (!binding) {
          throw new Error(`O PI Point "${tagName}" não possui dados suficientes.`);
        }
        return { name: tagName, binding };
      }));
      setIsResolvingInputs(false);
      onSave({
        name: normalizedName,
        description: description.trim(),
        expression: normalizedExpression,
        inputs: [...inputs, ...resolvedInputs],
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Não foi possível resolver os PI Points da expressão.');
      setIsResolvingInputs(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    appendPiPoint(parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)));
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    }}>
      <form className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="calculation-editor-title" onSubmit={handleSubmit}>
        <div className={styles.header}>
          <h2 id="calculation-editor-title">Editor de cálculo</h2>
          <button type="button" className={styles.closeButton} aria-label="Fechar editor de cálculo" onClick={onCancel}>×</button>
        </div>

        <div className={styles.body}>
          <label className={styles.label} htmlFor="calculation-editor-name">Nome</label>
          <input
            id="calculation-editor-name"
            className={styles.input}
            data-testid="calculation-editor-name"
            autoFocus
            value={name}
            onChange={(event) => { setName(event.target.value); setValidationError(''); }}
          />

          <label className={styles.label} htmlFor="calculation-editor-description">Descrição</label>
          <textarea
            id="calculation-editor-description"
            className={styles.description}
            data-testid="calculation-editor-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />

          <div
            className={isDropActive ? styles.dropZoneActive : styles.dropZone}
            data-testid="calculation-editor-drop-zone"
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDropActive(true); }}
            onDragLeave={() => setIsDropActive(false)}
            onDrop={handleDrop}
          >
            <span className={styles.dropIcon} aria-hidden="true"><CubeIcon /></span>
            <span>Digite o nome da tag na expressão ou arraste um PI Point</span>
            {selectedPiPoint && (
              <button type="button" className={styles.selectedPointButton} onClick={() => appendPiPoint(selectedPiPoint)}>
                Adicionar {selectedPiPoint.name}
              </button>
            )}
          </div>

          {inputs.length > 0 && (
            <div className={styles.inputs} data-testid="calculation-editor-inputs">
              <span className={styles.inputsLabel}>PI Points usados</span>
              <div className={styles.inputTags}>
                {inputs.map((input) => <span key={input.name} className={styles.inputTag} draggable>{input.name}</span>)}
              </div>
            </div>
          )}

          <label className={styles.label} htmlFor="calculation-editor-expression">Expressão</label>
          <textarea
            id="calculation-editor-expression"
            className={styles.expression}
            data-testid="calculation-editor-expression"
            value={expression}
            onChange={(event) => { setExpression(event.target.value); setValidationError(''); }}
            placeholder="Ex.: Vazão / Produção * 100"
            rows={4}
          />

          <div className={styles.operatorRow} aria-label="Operadores">
            {['+', '-', '*', '/', '(', ')'].map((operator) => (
              <button key={operator} type="button" className={styles.operatorButton} onClick={() => appendToken(operator)}>{operator}</button>
            ))}
          </div>

          <p className={styles.hint}>Não é necessário pesquisar a tag. Digite o nome diretamente na expressão; a pesquisa e o arraste são opções auxiliares.</p>
          {validationError && <span className={styles.error} role="alert">{validationError}</span>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancelar</button>
          <button type="submit" className={styles.saveButton} data-testid="calculation-editor-save" disabled={isResolvingInputs}>{isResolvingInputs ? 'Localizando...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  backdrop: css`
    position: fixed;
    z-index: 40;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(3, 8, 15, 0.76);
  `,
  dialog: css`
    display: flex;
    flex-direction: column;
    width: min(580px, 100%);
    max-height: min(720px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--surface-elevated);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 46px;
    padding: 0 14px;
    color: var(--assets-header-text);
    background: var(--assets-header-bg);
    h2 { margin: 0; font-size: 17px; font-weight: 600; }
  `,
  closeButton: css`
    width: 28px;
    height: 28px;
    border: 0;
    color: rgba(255, 255, 255, 0.8);
    background: transparent;
    cursor: pointer;
    font-size: 25px;
    line-height: 1;
    &:hover { color: var(--text-primary); }
  `,
  body: css`
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 18px;
    overflow: auto;
  `,
  label: css`
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  `,
  input: css`
    width: 100%;
    min-height: 38px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  description: css`
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    font: inherit;
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  dropZone: css`
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 54px;
    margin-top: 5px;
    padding: 8px 12px;
    border: 1px dashed var(--border-color);
    border-radius: 5px;
    color: var(--text-secondary);
    background: var(--surface-secondary);
    transition: border-color 120ms ease, background 120ms ease;
  `,
  dropZoneActive: css`
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 54px;
    margin-top: 5px;
    padding: 8px 12px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--selection-bg);
  `,
  dropIcon: css`
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--accent-hover);
    svg { width: 22px; height: 22px; }
  `,
  selectedPointButton: css`
    margin-left: auto;
    padding: 6px 8px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent-hover);
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    &:hover { color: var(--accent-contrast); background: var(--accent); }
  `,
  inputs: css`
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
    background: var(--surface-secondary);
  `,
  inputsLabel: css`color: var(--text-muted); font-size: 10px;`,
  inputTags: css`display: flex; flex-wrap: wrap; gap: 5px;`,
  inputTag: css`
    padding: 4px 7px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent-hover);
    background: var(--selection-bg);
    cursor: grab;
    font-size: 11px;
  `,
  expression: css`
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 9px 10px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  operatorRow: css`display: flex; gap: 6px;`,
  operatorButton: css`
    flex: 1;
    min-height: 30px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    &:hover { border-color: var(--accent); color: var(--accent-hover); }
  `,
  hint: css`margin: 3px 0 0; color: var(--text-muted); font-size: 11px; line-height: 1.4;`,
  error: css`color: var(--danger); font-size: 11px; line-height: 1.35;`,
  footer: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-secondary);
  `,
  cancelButton: css`
    min-width: 88px;
    min-height: 32px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
  `,
  saveButton: css`
    min-width: 88px;
    min-height: 32px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-weight: 600;
    &:hover { background: var(--accent-hover); }
    &:disabled { cursor: wait; opacity: 0.65; }
  `,
});

function extractTagNames(expression: string): string[] {
  const names = new Set<string>();
  const tokenPattern = /(?:^|[^A-Za-z0-9_.:-])([A-Za-z_][A-Za-z0-9_.:-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(expression)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

function CubeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </svg>;
}
