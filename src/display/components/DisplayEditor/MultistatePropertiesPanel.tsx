import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import type { PiDigitalState, PiDigitalStatesResult } from '../../../pi/piDataSource';
import type { PiPointBinding } from '../../../pi/piPointBinding';
import { TransparentColorPicker } from './TransparentColorPicker';

export interface MultistatePropertiesPanelProps {
  title?: string;
  testIdPrefix?: string;
  config?: MultistateConfig;
  binding?: PiPointBinding;
  loadDigitalStates?: (binding: PiPointBinding) => Promise<PiDigitalStatesResult>;
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

export function MultistatePropertiesPanel({ title = 'Multistate', testIdPrefix = 'multistate', config, binding, loadDigitalStates, onChange }: MultistatePropertiesPanelProps) {
  const styles = useStyles2(getStyles);
  const normalized = normalizeMultistateConfig(config) ?? { enabled: false, rules: [] };
  const [digitalStates, setDigitalStates] = useState<PiDigitalState[]>([]);
  const [digitalMetadata, setDigitalMetadata] = useState<boolean | undefined>(undefined);
  const [digitalError, setDigitalError] = useState(false);
  const autoPopulatedFor = useRef<string | undefined>();
  const bindingKey = binding ? `${binding.dataSourceUid}:${binding.webId ?? `${binding.serverPath}\\${binding.pointName}`}` : undefined;
  const knownDigital = binding?.pointType?.trim().toLocaleLowerCase() === 'digital';

  useEffect(() => {
    let active = true;
    setDigitalStates([]);
    setDigitalMetadata(undefined);
    setDigitalError(false);
    autoPopulatedFor.current = undefined;
    if (!binding || !loadDigitalStates) return () => { active = false; };
    loadDigitalStates(binding).then((result) => {
      if (!active) return;
      setDigitalMetadata(result.isDigital);
      setDigitalStates(result.states);
    }).catch(() => {
      if (!active) return;
      setDigitalMetadata(knownDigital);
      setDigitalError(true);
    });
    return () => { active = false; };
  }, [binding, bindingKey, knownDigital, loadDigitalStates]);

  const isDigital = Boolean(loadDigitalStates) && (knownDigital || digitalMetadata === true);
  const loadingDigitalStates = isDigital && digitalMetadata === undefined && !digitalError;
  const update = (patch: Partial<MultistateConfig>) => onChange({ ...normalized, ...patch });
  const updateRule = (ruleId: string, patch: Partial<MultistateRule>) => update({
    rules: normalized.rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule),
  });
  const addRule = () => {
    if (!normalized.enabled) return;
    update({ rules: [...normalized.rules, isDigital ? createDigitalRule(generateId(), digitalStates[0]) : createDefaultMultistateRule(generateId())] });
  };

  useEffect(() => {
    if (!isDigital || !normalized.enabled || normalized.rules.length > 0 || digitalStates.length === 0 || autoPopulatedFor.current === bindingKey) return;
    autoPopulatedFor.current = bindingKey;
    onChange({ ...normalized, rules: digitalStates.map((state) => createDigitalRule(generateId(), state)) });
  }, [bindingKey, digitalStates, isDigital, normalized, onChange]);

  const selectedStateKeys = useMemo(() => new Set(normalized.rules.map((rule) => getSelectedDigitalStateKey(rule, digitalStates)).filter(Boolean)), [digitalStates, normalized.rules]);

  return (
    <section className={styles.section} data-testid={`${testIdPrefix}-properties`}>
      <div className={styles.sectionHeader}>
        <span className={styles.title}>{title}</span>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={normalized.enabled}
            data-testid={`${testIdPrefix}-enabled`}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          Habilitado
        </label>
      </div>
      <div className={styles.hint}>{isDigital ? 'Cada estado digital usa igualdade. A primeira regra correspondente vence.' : 'A primeira regra correspondente vence. Entre usa mínimo inclusivo e máximo exclusivo.'}</div>
      <button type="button" className={styles.addButton} data-testid={`${testIdPrefix}-add-rule`} onClick={addRule} disabled={!normalized.enabled}>
        Adicionar regra
      </button>
      <div className={styles.rules}>
        {normalized.rules.map((rule) => (
          <div className={styles.rule} key={rule.id} data-testid={`${testIdPrefix}-rule-${rule.id}`}>
            {!isDigital && <select
              value={rule.operator}
              data-testid={`${testIdPrefix}-operator-${rule.id}`}
              onChange={(event) => updateRule(rule.id, { operator: event.target.value as MultistateOperator })}
            >
              {OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
            </select>}
            <label className={styles.numberField}>
              <span>{!isDigital && rule.operator === 'between' ? 'Mínimo' : 'Valor'}</span>
              {isDigital && !digitalError ? (
                <select
                  value={getSelectedDigitalStateKey(rule, digitalStates)}
                  disabled={loadingDigitalStates}
                  aria-label="Estado digital"
                  data-testid={`${testIdPrefix}-value-${rule.id}`}
                  onChange={(event) => {
                    const state = digitalStates.find((item) => digitalStateKey(item) === event.target.value);
                    if (state) updateRule(rule.id, digitalRulePatch(state));
                  }}
                >
                  <option value="">{loadingDigitalStates ? 'Carregando estados...' : 'Selecione um estado'}</option>
                  {digitalStates.map((state) => {
                    const key = digitalStateKey(state);
                    const selected = getSelectedDigitalStateKey(rule, digitalStates) === key;
                    return <option key={key} value={key} disabled={!selected && selectedStateKeys.has(key)}>{state.name}</option>;
                  })}
                </select>
              ) : (
                <input
                  type={rule.operator === 'between' ? 'number' : 'text'}
                  value={rule.value ?? ''}
                  placeholder={rule.operator === 'eq' ? 'Ex: LIGADO, 1...' : undefined}
                  aria-label={rule.operator === 'between' ? 'Mínimo da regra' : 'Valor da regra'}
                  data-testid={`${testIdPrefix}-value-${rule.id}`}
                  onChange={(event) => updateRule(rule.id, { value: parseRuleValue(event.target.value, rule.value) })}
                />
              )}
            </label>
            {!isDigital && rule.operator === 'between' && (
              <label className={styles.numberField}>
                <span>Máximo</span>
                <input
                  type="number"
                  value={typeof rule.value2 === 'number' && Number.isFinite(rule.value2) ? rule.value2 : (rule.value2 ?? '')}
                  aria-label="Máximo da regra"
                  data-testid={`${testIdPrefix}-value2-${rule.id}`}
                  onChange={(event) => updateRule(rule.id, { value2: parseRuleValue(event.target.value, rule.value2 ?? rule.value) })}
                />
              </label>
            )}
            <label className={styles.colorField}>
              <span>Cor</span>
              <TransparentColorPicker color={rule.color} fallbackColor="#d32f2f" testId={`${testIdPrefix}-color-${rule.id}`} onChange={(color) => updateRule(rule.id, { color })} />
              <span className={styles.blinkOption}><input type="checkbox" checked={rule.blink === true} data-testid={`${testIdPrefix}-blink-${rule.id}`} onChange={(event) => updateRule(rule.id, { blink: event.target.checked })} /> Piscar</span>
            </label>
            <button type="button" className={styles.removeButton} data-testid={`${testIdPrefix}-remove-${rule.id}`} onClick={() => update({ rules: normalized.rules.filter((item) => item.id !== rule.id) })}>
              Remover
            </button>
            {rule.operator === 'between' && !isValidMultistateRule(rule) && <span className={styles.invalid}>Faixa inválida</span>}
          </div>
        ))}
      </div>
      {isDigital && digitalError && <div className={styles.error}>Não foi possível carregar os estados digitais. Você pode informar o valor manualmente.</div>}
    </section>
  );
}

function digitalStateKey(state: PiDigitalState): string {
  return state.value === undefined ? `name:${state.name.toLocaleLowerCase()}` : `value:${String(state.value)}`;
}

function getSelectedDigitalStateKey(rule: MultistateRule, states: PiDigitalState[]): string {
  if (rule.digitalStateValue !== undefined) {
    return digitalStateKey({ name: rule.digitalStateName ?? String(rule.digitalStateValue), value: rule.digitalStateValue });
  }
  const byName = states.find((state) => state.name.toLocaleLowerCase() === String(rule.digitalStateName ?? rule.value).trim().toLocaleLowerCase());
  return byName ? digitalStateKey(byName) : '';
}

function digitalRulePatch(state: PiDigitalState): Partial<MultistateRule> {
  return { operator: 'eq', value: state.value ?? state.name, digitalStateName: state.name, ...(state.value === undefined ? {} : { digitalStateValue: state.value }) };
}

function createDigitalRule(id: string, state?: PiDigitalState): MultistateRule {
  return { id, operator: 'eq', value: state?.value ?? state?.name ?? '', color: '#d32f2f', ...(state ? digitalRulePatch(state) : {}) };
}

function parseRuleValue(value: string, fallback: number | string): number | string {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
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
  addButton: css`width: 100%; min-height: 27px; padding: 3px 6px; border: 1px solid var(--border-color); border-radius: 0; background: var(--button-bg); color: var(--text-primary); font-size: 10px; &:disabled { opacity: 0.5; cursor: not-allowed; }`,
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
  blinkOption: css`display:flex; flex-direction:row; align-items:center; gap:4px; margin-top:3px; color:var(--text-secondary); font-size:10px; input{width:14px; height:14px; min-height:14px;}`,
  removeButton: css`grid-column: 1 / -1; width: 100%; max-width: 100%; min-height: 24px; padding: 2px 5px; border: 1px solid var(--border-color); border-radius: 0; background: var(--button-bg); color: var(--text-secondary); font-size: 9px;`,
  invalid: css`grid-column: 1 / -1; color: var(--warning); font-size: 9px;`,
  error: css`margin-top: 7px; color: var(--warning); font-size: 9px; line-height: 1.35;`,
});
