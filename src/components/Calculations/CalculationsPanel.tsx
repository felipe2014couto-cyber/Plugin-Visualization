import React, { useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { PiPointSearchResult } from '../../pi/piDataSource';
import { createPiPointBinding } from '../../pi/piPointBinding';
import type { DisplayDocument } from '../../display/displayDocument';
import type { CalculationDefinition, CalculationInput } from '../../calculations/calculationEngine';

export interface CalculationsPanelProps {
  selectedPiPoint?: PiPointSearchResult | null;
  document?: DisplayDocument;
  onChange?: (document: DisplayDocument) => void;
  onAddToDisplay?: (calculation: CalculationDefinition) => void;
}

export function CalculationsPanel({ selectedPiPoint, document, onChange, onAddToDisplay }: CalculationsPanelProps) {
  const styles = useStyles2(getStyles);
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [validationError, setValidationError] = useState('');
  const [sessionCalculations, setSessionCalculations] = useState<CalculationDefinition[]>([]);
  const [inputs, setInputs] = useState<CalculationInput[]>([]);
  const calculations = document?.calculations ?? sessionCalculations;

  const updateCalculations = (next: CalculationDefinition[]) => {
    if (document && onChange) {
      onChange({ ...document, calculations: next });
    } else {
      setSessionCalculations(next);
    }
  };

  const appendToken = (token: string) => {
    setExpression((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${token} `);
    setValidationError('');
  };

  const addCalculation = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedExpression = expression.trim();
    if (!normalizedName || !normalizedExpression) {
      setValidationError('Informe um nome e uma expressão para o cálculo.');
      return;
    }

    updateCalculations([...calculations, {
      id: String(calculations.reduce((highestId, item) => Math.max(highestId, Number(item.id) || 0), 0) + 1),
      name: normalizedName,
      expression: normalizedExpression,
      inputs,
    }]);
    setName('');
    setExpression('');
    setInputs([]);
    setValidationError('');
  };

  return (
    <section className={styles.container} data-testid="calculations-panel" aria-label="Cálculos">
      <div className={styles.intro}>
        <div className={styles.titleRow}>
          <CalculatorIcon />
          <h2>Cálculos</h2>
        </div>
        <p>Crie expressões a partir de PI Points para usar no display.</p>
      </div>

      <form className={styles.form} onSubmit={addCalculation}>
        <label className={styles.label} htmlFor="calculation-name">Nome</label>
        <input
          id="calculation-name"
          className={styles.input}
          data-testid="calculation-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Eficiência"
        />

        <label className={styles.label} htmlFor="calculation-expression">Expressão</label>
        <textarea
          id="calculation-expression"
          className={styles.expression}
          data-testid="calculation-expression"
          value={expression}
          onChange={(event) => {
            setExpression(event.target.value);
            setValidationError('');
          }}
          placeholder="Ex.: Vazão / Produção * 100"
          rows={3}
        />

        <div className={styles.pointContext} data-testid="calculation-point-context">
          <span className={styles.contextLabel}>PI Point selecionado</span>
          <span className={styles.contextValue}>{selectedPiPoint?.name ?? 'Nenhum PI Point selecionado'}</span>
          <button
            type="button"
            className={styles.insertButton}
            disabled={!selectedPiPoint}
            onClick={() => {
              if (!selectedPiPoint) {
                return;
              }
              appendToken(selectedPiPoint.name);
              const binding = createPiPointBinding(selectedPiPoint);
              if (binding) {
                setInputs((current) => current.some((input) => input.name === selectedPiPoint.name)
                  ? current
                  : [...current, { name: selectedPiPoint.name, binding }]);
              }
            }}
          >Inserir</button>
        </div>

        <div className={styles.operatorRow} aria-label="Operadores">
          {['+', '-', '*', '/', '(', ')'].map((operator) => (
            <button
              key={operator}
              type="button"
              className={styles.operatorButton}
              data-testid={`calculation-operator-${operator === '*' ? 'multiply' : operator === '/' ? 'divide' : operator}`}
              onClick={() => appendToken(operator)}
            >{operator}</button>
          ))}
        </div>

        {validationError && <span className={styles.error} role="alert">{validationError}</span>}
        <button type="submit" className={styles.addButton} data-testid="calculation-add">Adicionar cálculo</button>
      </form>

      <div className={styles.savedSection}>
        <div className={styles.sectionTitle}>Cálculos salvos</div>
        {calculations.length === 0 ? (
          <p className={styles.empty} data-testid="calculations-empty">Nenhum cálculo criado nesta sessão.</p>
        ) : (
          <ul className={styles.list}>
            {calculations.map((calculation) => (
              <li key={calculation.id} className={styles.calculation} data-testid={`calculation-${calculation.id}`}>
                <div className={styles.calculationDetails}>
                  <strong>{calculation.name}</strong>
                  <code>{calculation.expression}</code>
                </div>
                <button
                  type="button"
                  className={styles.removeButton}
                  aria-label={`Remover ${calculation.name}`}
                  onClick={() => updateCalculations(calculations.filter((item) => item.id !== calculation.id))}
                >Remover</button>
                {onAddToDisplay && (
                  <button type="button" className={styles.displayButton} onClick={() => onAddToDisplay(calculation)}>
                    Exibir no display
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className={styles.note}>Os cálculos usam os valores atuais dos PI Points inseridos. Adicione o resultado ao display para acompanhá-lo em tempo real.</p>
    </section>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: ${theme.spacing(1.25)};
    padding: ${theme.spacing(1.5)};
    overflow: auto;
    color: var(--text-primary);
  `,
  intro: css`
    p { margin: 5px 0 0; color: var(--text-secondary); font-size: 11px; line-height: 1.4; }
  `,
  titleRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--assets-header-text);
    h2 { margin: 0; font-size: 16px; }
  `,
  form: css`
    display: flex;
    flex-direction: column;
    gap: 7px;
  `,
  label: css`
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
  `,
  input: css`
    width: 100%;
    min-height: 34px;
    box-sizing: border-box;
    padding: 0 9px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  expression: css`
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 8px 9px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  pointContext: css`
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 8px;
    padding: 8px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--surface-secondary);
  `,
  contextLabel: css`grid-column: 1 / -1; color: var(--text-muted); font-size: 10px;`,
  contextValue: css`min-width: 0; overflow: hidden; color: var(--text-primary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap;`,
  insertButton: css`
    min-height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 10px;
    &:hover:not(:disabled) { background: var(--button-hover); }
    &:disabled { cursor: default; opacity: 0.5; }
  `,
  operatorRow: css`display: flex; gap: 5px;`,
  operatorButton: css`
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 13px;
    &:hover { border-color: var(--accent); color: var(--accent-hover); background: var(--selection-bg); }
  `,
  error: css`color: var(--danger); font-size: 11px; line-height: 1.35;`,
  addButton: css`
    min-height: 34px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    &:hover { background: var(--accent-hover); }
  `,
  savedSection: css`display: flex; flex-direction: column; gap: 7px; min-height: 0;`,
  sectionTitle: css`color: var(--text-secondary); font-size: 11px; font-weight: 600;`,
  empty: css`margin: 0; padding: 10px; border: 1px dashed var(--border-color); color: var(--text-muted); font-size: 11px; line-height: 1.4;`,
  list: css`display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none;`,
  calculation: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--surface-secondary);
  `,
  calculationDetails: css`
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
    strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    code { overflow: hidden; color: var(--text-secondary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  `,
  removeButton: css`
    flex: 0 0 auto;
    padding: 4px 6px;
    border: 0;
    color: var(--danger);
    background: transparent;
    cursor: pointer;
    font-size: 10px;
    &:hover { text-decoration: underline; }
  `,
  displayButton: css`
    flex: 0 0 auto;
    min-height: 24px;
    padding: 0 7px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--accent-hover);
    background: transparent;
    cursor: pointer;
    font-size: 10px;
    &:hover { background: var(--selection-bg); }
  `,
  note: css`margin: auto 0 0; padding-top: 8px; border-top: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 10px; line-height: 1.4;`,
});

function CalculatorIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2" />
  </svg>;
}
