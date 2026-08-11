import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  createDefaultMultistateRule,
  generateId,
  isValidMultistateRule,
  normalizeMultistateConfig,
  type MultistateConfig,
  type MultistateOperator,
  type MultistateRule,
} from '../../index';

export interface MultistatePropertiesPanelProps {
  config?: MultistateConfig;
  onChange: (config: MultistateConfig) => void;
}

const OPERATORS: Array<{ value: MultistateOperator; label: string }> = [
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'eq', label: '=' },
  { value: 'between', label: 'Entre' },
];

export function MultistatePropertiesPanel({ config, onChange }: MultistatePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const normalized = normalizeMultistateConfig(config) ?? { enabled: false, rules: [] };
  const update = (patch: Partial<MultistateConfig>) => onChange({ ...normalized, ...patch });
  const updateRule = (ruleId: string, patch: Partial<MultistateRule>) => update({
    rules: normalized.rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule),
  });
  const addRule = () => update({ rules: [...normalized.rules, createDefaultMultistateRule(generateId())] });

  return (
    <section className={styles.section} data-testid="multistate-properties">
      <div className={styles.sectionHeader}>
        <span className={styles.title}>Multistate</span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={normalized.enabled}
            data-testid="multistate-enabled"
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          Habilitado
        </label>
      </div>
      <div className={styles.hint}>A primeira regra correspondente vence. Entre usa mínimo inclusivo e máximo exclusivo.</div>
      <button type="button" className={styles.addButton} data-testid="multistate-add-rule" onClick={addRule}>
        Adicionar regra
      </button>
      <div className={styles.rules}>
        {normalized.rules.map((rule) => (
          <div className={styles.rule} key={rule.id} data-testid={`multistate-rule-${rule.id}`}>
            <select
              value={rule.operator}
              data-testid={`multistate-operator-${rule.id}`}
              onChange={(event) => updateRule(rule.id, { operator: event.target.value as MultistateOperator })}
            >
              {OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
            </select>
            <label className={styles.numberField}>
              <span>{rule.operator === 'between' ? 'Mínimo' : 'Valor'}</span>
              <input
                type="number"
                value={Number.isFinite(rule.value) ? rule.value : ''}
                aria-label={rule.operator === 'between' ? 'Mínimo da regra' : 'Valor da regra'}
                data-testid={`multistate-value-${rule.id}`}
                onChange={(event) => updateRule(rule.id, { value: toFiniteNumber(event.target.value, rule.value) })}
              />
            </label>
            {rule.operator === 'between' && (
              <label className={styles.numberField}>
                <span>Máximo</span>
                <input
                  type="number"
                  value={typeof rule.value2 === 'number' && Number.isFinite(rule.value2) ? rule.value2 : ''}
                  aria-label="Máximo da regra"
                  data-testid={`multistate-value2-${rule.id}`}
                  onChange={(event) => updateRule(rule.id, { value2: toFiniteNumber(event.target.value, rule.value2 ?? rule.value) })}
                />
              </label>
            )}
            <label className={styles.colorField}>
              <span>Cor</span>
              <input
                type="color"
                value={isValidColor(rule.color) ? rule.color : '#d32f2f'}
                aria-label="Cor da regra"
                data-testid={`multistate-color-${rule.id}`}
                onChange={(event) => updateRule(rule.id, { color: event.target.value })}
              />
            </label>
            <button type="button" className={styles.removeButton} data-testid={`multistate-remove-${rule.id}`} onClick={() => update({ rules: normalized.rules.filter((item) => item.id !== rule.id) })}>
              Remover
            </button>
            {rule.operator === 'between' && !isValidMultistateRule(rule) && <span className={styles.invalid}>Faixa inválida</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function toFiniteNumber(value: string, fallback: number): number {
  if (value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}

const getStyles = (theme: GrafanaTheme2) => ({
  section: css`
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    border-top: 1px solid var(--border-color);
    padding: 10px 12px;
  `,
  sectionHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.spacing(1)};
  `,
  title: css`font-size: 11px; font-weight: ${theme.typography.fontWeightMedium};`,
  toggle: css`display: flex; align-items: center; gap: 4px; color: var(--text-secondary); font-size: 10px;`,
  hint: css`margin: 7px 0; color: var(--text-secondary); font-size: 9px; line-height: 1.35;`,
  addButton: css`width: 100%; min-height: 27px; padding: 3px 6px; border: 1px solid var(--border-color); border-radius: 0; background: var(--button-bg); color: var(--text-primary); font-size: 10px;`,
  rules: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 7px;
    min-width: 0;
    width: 100%;
  `,
  rule: css`
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 5px;
    padding: 6px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    border: 1px solid var(--border-color);
    background: var(--surface-secondary);
    select, input { color: var(--text-primary); background: var(--input-bg); border-color: var(--border-color); }
    border-radius: 0;
    select, input {
      min-width: 0;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      min-height: 25px;
    }
  `,
  numberField: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    color: var(--text-secondary);
    font-size: 9px;
  `,
  colorField: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    color: var(--text-secondary);
    font-size: 9px;
    input { width: 100%; padding: 2px; }
  `,
  removeButton: css`grid-column: 1 / -1; width: 100%; max-width: 100%; min-height: 24px; padding: 2px 5px; border: 1px solid var(--border-color); border-radius: 0; background: var(--button-bg); color: var(--text-secondary); font-size: 9px;`,
  invalid: css`grid-column: 1 / -1; color: ${theme.colors.warning.text}; font-size: 9px;`,
});
