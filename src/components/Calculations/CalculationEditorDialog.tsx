import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { PiPointSearchResult, PiPointValue } from '../../pi/piDataSource';
import { createPiPointBinding } from '../../pi/piPointBinding';
import { PI_POINT_DRAG_MIME, parsePiPointDragData } from '../../pi/piPointDrag';
import { evaluateCalculation, type CalculationDefinition, type CalculationInput } from '../../calculations/calculationEngine';

interface CalculationHelpItem {
  name: string;
  template?: string;
  description: string;
  example: string;
  unsupported?: boolean;
}

const CALCULATION_HELP_ITEMS: readonly CalculationHelpItem[] = [
  { name: 'IF / ELSE', template: 'IF(0, 0, 0)', description: 'Retorna um valor quando a condição é verdadeira e outro quando é falsa.', example: 'IF(Temperatura > 80, 1, 0)' },
  { name: 'AND', template: 'AND(0, 0)', description: 'Retorna 1 quando todas as condições forem verdadeiras.', example: 'AND(Pressao > 5, Vazao > 10)' },
  { name: 'OR', template: 'OR(0, 0)', description: 'Retorna 1 quando pelo menos uma condição for verdadeira.', example: 'OR(Alarme_A == 1, Alarme_B == 1)' },
  { name: 'NOT', template: 'NOT(0)', description: 'Inverte uma condição: 0 vira 1 e qualquer valor diferente de zero vira 0.', example: 'NOT(Bomba_Ligada == 1)' },
  { name: 'MIN / MAX', template: 'MAX(0, 0)', description: 'Retorna o menor ou maior valor entre os argumentos.', example: 'MAX(Vazao_A, Vazao_B)' },
  { name: 'ABS', template: 'ABS(0)', description: 'Retorna o valor absoluto, sem sinal negativo.', example: 'ABS(Setpoint - Medida)' },
  { name: 'ROUND', template: 'ROUND(0, 2)', description: 'Arredonda um valor para a quantidade desejada de casas decimais.', example: 'ROUND(Eficiencia, 2)' },
  { name: 'CLAMP', template: 'CLAMP(0, 0, 100)', description: 'Limita um valor entre mínimo e máximo.', example: 'CLAMP(Nivel, 0, 100)' },
  { name: 'WHILE', description: 'Não é permitido em cálculos para evitar expressões sem término. Use IF para decisões condicionais.', example: 'Use IF(Condicao, valor_se_sim, valor_se_nao)', unsupported: true },
];

const CALCULATION_RESERVED_NAMES = new Set(['IF', 'SE', 'AND', 'OR', 'NOT', 'MIN', 'MAX', 'ABS', 'ROUND', 'CLAMP', 'WHILE']);

export interface CalculationDraft {
  name: string;
  description: string;
  expression: string;
  inputs: CalculationInput[];
}

export interface CalculationEditorDialogProps {
  initialCalculation?: CalculationDefinition;
  resolvePiPoint?: (name: string) => Promise<PiPointSearchResult | undefined>;
  loadValue?: (binding: CalculationInput['binding']) => Promise<PiPointValue>;
  isNameTaken?: (name: string) => boolean;
  onCancel: () => void;
  onSave: (draft: CalculationDraft) => void;
}

export function CalculationEditorDialog({ initialCalculation, resolvePiPoint, loadValue, isNameTaken, onCancel, onSave }: CalculationEditorDialogProps) {
  const styles = useStyles2(getStyles);
  const [name, setName] = useState(initialCalculation?.name ?? '');
  const [description, setDescription] = useState(initialCalculation?.description ?? '');
  const [expression, setExpression] = useState(initialCalculation?.expression ?? '');
  const [inputs, setInputs] = useState<CalculationInput[]>(initialCalculation?.inputs ?? []);
  const [validationError, setValidationError] = useState('');
  const [isDropActive, setIsDropActive] = useState(false);
  const [isResolvingInputs, setIsResolvingInputs] = useState(false);
  const [executionState, setExecutionState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [executionResult, setExecutionResult] = useState<{ value: number; timestamp?: string }>();
  const [isFunctionHelpOpen, setIsFunctionHelpOpen] = useState(false);
  const [expandedFunctionName, setExpandedFunctionName] = useState<string>();

  useEffect(() => {
    setName(initialCalculation?.name ?? '');
    setDescription(initialCalculation?.description ?? '');
    setExpression(initialCalculation?.expression ?? '');
    setInputs(initialCalculation?.inputs ?? []);
    setValidationError('');
    setExecutionState('idle');
    setExecutionResult(undefined);
  }, [initialCalculation]);

  const appendToken = (token: string) => {
    setExpression((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${token} `);
    setValidationError('');
    setExecutionState('idle');
    setExecutionResult(undefined);
  };

  const insertFunction = (template: string) => {
    appendToken(template);
    setIsFunctionHelpOpen(false);
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

  const resolveInputs = async (normalizedExpression: string): Promise<CalculationInput[]> => {
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
    return [...inputs, ...resolvedInputs];
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
      const resolvedInputs = await resolveInputs(normalizedExpression);
      setIsResolvingInputs(false);
      onSave({
        name: normalizedName,
        description: description.trim(),
        expression: normalizedExpression,
        inputs: resolvedInputs,
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Não foi possível resolver os PI Points da expressão.');
      setIsResolvingInputs(false);
    }
  };

  const handleExecute = async () => {
    const normalizedExpression = expression.trim();
    if (!normalizedExpression) {
      setValidationError('Informe uma expressão para calcular.');
      return;
    }
    setExecutionState('loading');
    setExecutionResult(undefined);
    setValidationError('');
    try {
      const resolvedInputs = await resolveInputs(normalizedExpression);
      setInputs(resolvedInputs);
      if (resolvedInputs.length > 0 && !loadValue) {
        throw new Error('A consulta de valores PI não está disponível.');
      }
      const values = new Map<string, unknown>();
      const pointValues = await Promise.all(resolvedInputs.map(async (input) => ({
        input,
        value: await loadValue?.(input.binding),
      })));
      pointValues.forEach(({ input, value }) => values.set(input.name, value?.value));
      const evaluation = evaluateCalculation({
        id: '__preview__',
        name: name.trim() || 'Cálculo',
        expression: normalizedExpression,
        inputs: resolvedInputs,
      }, values);
      if (evaluation.status === 'loading') {
        throw new Error('Aguardando os valores dos PI Points.');
      }
      if (evaluation.status === 'error') {
        throw evaluation.error;
      }
      const timestamps = pointValues
        .map(({ value }) => value?.timestamp)
        .filter((timestamp): timestamp is string => Boolean(timestamp))
        .sort();
      setExecutionResult({ value: evaluation.value, timestamp: timestamps.at(-1) });
      setExecutionState('success');
    } catch (error) {
      setExecutionState('error');
      setValidationError(error instanceof Error ? error.message : 'Não foi possível executar o cálculo.');
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
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
            className={isDropActive ? styles.expressionActive : styles.expression}
            data-testid="calculation-editor-expression"
            value={expression}
            onChange={(event) => { setExpression(event.target.value); setValidationError(''); setExecutionState('idle'); setExecutionResult(undefined); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDropActive(true); }}
            onDragLeave={() => setIsDropActive(false)}
            onDrop={handleDrop}
            placeholder="Ex.: Vazão / Produção * 100"
            rows={4}
          />

          <div className={styles.operatorRow} aria-label="Operadores">
            {['+', '-', '*', '/', '(', ')'].map((operator) => (
              <button key={operator} type="button" className={styles.operatorButton} onClick={() => appendToken(operator)}>{operator}</button>
            ))}
          </div>

          <div className={styles.functionHelpContainer}>
            <button type="button" className={styles.functionHelpButton} aria-expanded={isFunctionHelpOpen} aria-controls="calculation-function-help" onClick={() => setIsFunctionHelpOpen((current) => !current)}>
              Funções e lógica <InfoIcon />
            </button>
            {isFunctionHelpOpen && (
              <div id="calculation-function-help" className={styles.functionHelpPopup} data-testid="calculation-function-help" role="dialog" aria-label="Funções disponíveis">
                <div className={styles.functionHelpHeader}>
                  <strong>Funções disponíveis</strong>
                  <button type="button" aria-label="Fechar funções disponíveis" onClick={() => setIsFunctionHelpOpen(false)}>×</button>
                </div>
                {CALCULATION_HELP_ITEMS.map((item) => (
                  <div key={item.name} className={styles.functionHelpItem}>
                    <button type="button" className={styles.functionInsertButton} aria-label={`Inserir ${item.name}`} disabled={item.unsupported} onClick={() => item.template && insertFunction(item.template)}>{item.name}</button>
                    <button type="button" className={styles.functionInfoButton} aria-label={`Explicação de ${item.name}`} aria-expanded={expandedFunctionName === item.name} onClick={() => setExpandedFunctionName((current) => current === item.name ? undefined : item.name)}><InfoIcon /></button>
                    {expandedFunctionName === item.name && (
                      <div className={styles.functionExplanation}>
                        <span>{item.description}</span>
                        <span className={styles.functionExample}>Ex.: {item.example}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {executionState === 'success' && executionResult && (
            <div className={styles.executionResult} data-testid="calculation-editor-result">
              <strong>Último valor: {formatExecutionValue(executionResult.value)}</strong>
              {executionResult.timestamp && <span>Atualizado em {formatExecutionTimestamp(executionResult.timestamp)}</span>}
            </div>
          )}
          {validationError && <span className={styles.error} role="alert">{validationError}</span>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.executeButton} data-testid="calculation-editor-execute" onClick={() => void handleExecute()} disabled={isResolvingInputs || executionState === 'loading'}>{executionState === 'loading' ? 'Calculando...' : 'Calcular'}</button>
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
    background: var(--overlay-bg);
  `,
  dialog: css`
    display: flex;
    flex-direction: column;
    width: min(580px, 100%);
    max-height: min(720px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid var(--border-color);
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
    color: var(--assets-header-muted);
    background: transparent;
    cursor: pointer;
    font-size: 25px;
    line-height: 1;
    &:hover { color: var(--assets-header-text); background: var(--assets-header-hover); }
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
    &::placeholder { color: var(--text-secondary); opacity: 1; }
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  expressionActive: css`
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 9px 10px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--selection-bg);
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    &::placeholder { color: var(--text-secondary); opacity: 1; }
    box-shadow: 0 0 0 2px var(--focus-ring);
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
  functionHelpContainer: css`position: relative; align-self: flex-start;`,
  functionHelpButton: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-secondary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 11px;
    svg { width: 14px; height: 14px; }
    &:hover { border-color: var(--accent); color: var(--accent-hover); }
  `,
  functionHelpPopup: css`
    position: absolute;
    z-index: 2;
    bottom: calc(100% + 6px);
    left: 0;
    width: min(390px, calc(100vw - 72px));
    max-height: 280px;
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--surface-elevated);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  `,
  functionHelpHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
    font-size: 12px;
    button { border: 0; color: var(--text-secondary); background: transparent; cursor: pointer; font-size: 18px; line-height: 1; }
  `,
  functionHelpItem: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 26px;
    gap: 5px;
    padding: 4px 0;
    border-top: 1px solid var(--border-subtle);
  `,
  functionInsertButton: css`
    min-width: 0;
    padding: 5px 7px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 11px;
    text-align: left;
    &:hover { border-color: var(--accent); color: var(--accent-hover); }
    &:disabled { cursor: not-allowed; opacity: 0.55; }
  `,
  functionInfoButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    color: var(--accent-hover);
    background: transparent;
    cursor: pointer;
    svg { width: 15px; height: 15px; }
  `,
  functionExample: css`
    display: block;
    padding: 5px 7px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    color: var(--text-primary);
    background: var(--input-bg);
    font-family: monospace;
    font-size: 10px;
    line-height: 1.35;
  `,
  functionExplanation: css`
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 7px;
    color: var(--text-secondary);
    background: var(--surface-secondary);
    font-size: 10px;
    line-height: 1.35;
  `,
  executionResult: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 3px;
    padding: 9px 10px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--surface-secondary);
    font-size: 12px;
    span { color: var(--text-secondary); font-size: 10px; }
  `,
  error: css`color: var(--danger); font-size: 11px; line-height: 1.35;`,
  footer: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-secondary);
  `,
  executeButton: css`
    min-width: 88px;
    min-height: 32px;
    margin-right: auto;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--accent-hover);
    background: transparent;
    cursor: pointer;
    font-weight: 600;
    &:hover { color: var(--accent-contrast); background: var(--accent); }
    &:disabled { cursor: wait; opacity: 0.65; }
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
    if (!CALCULATION_RESERVED_NAMES.has(match[1].toLocaleUpperCase())) {
      names.add(match[1]);
    }
  }
  return [...names];
}

function formatExecutionValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatExecutionTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6M12 7h.01" />
  </svg>;
}
