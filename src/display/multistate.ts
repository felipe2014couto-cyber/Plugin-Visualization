import type { DisplayDocument } from './displayDocument';

export type MultistateOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'between';

export interface MultistateRule {
  id: string;
  operator: MultistateOperator;
  value: number | string;
  value2?: number | string;
  /** Stable PI Digital State code when the datasource makes one available. */
  digitalStateValue?: number | string;
  /** Display name retained for the editor and as compatibility fallback. */
  digitalStateName?: string;
  color: string;
}

export interface MultistateConfig {
  enabled: boolean;
  rules: MultistateRule[];
}

export interface MultistateMatch {
  rule: MultistateRule;
  color: string;
}

const DEFAULT_RULE_COLOR = '#d32f2f';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const TRANSPARENT_COLOR = 'transparent' as const;

export interface NormalizedDigitalValue {
  name?: string;
  value?: number | string;
}

export function normalizeMultistateConfig(config?: Partial<MultistateConfig> | null): MultistateConfig | undefined {
  if (!config) {
    return undefined;
  }
  const rules = Array.isArray(config.rules)
    ? config.rules.map((rule, index) => normalizeRule(rule, index)).filter((rule): rule is MultistateRule => rule !== undefined)
    : [];
  return {
    enabled: config.enabled === true,
    rules,
  };
}

function extractRawCandidates(val: unknown): unknown[] {
  if (val === null || val === undefined) {
    return [];
  }
  if (typeof val === 'object' && !Array.isArray(val)) {
    const rec = val as Record<string, unknown>;
    const candidates: unknown[] = [];
    if ('Name' in rec && rec.Name !== undefined) candidates.push(rec.Name);
    if ('name' in rec && rec.name !== undefined) candidates.push(rec.name);
    if ('text' in rec && rec.text !== undefined) candidates.push(rec.text);
    if ('Text' in rec && rec.Text !== undefined) candidates.push(rec.Text);
    if ('State' in rec && rec.State !== undefined) candidates.push(rec.State);
    if ('state' in rec && rec.state !== undefined) candidates.push(rec.state);
    if ('Value' in rec && rec.Value !== undefined) candidates.push(rec.Value);
    if ('value' in rec && rec.value !== undefined) candidates.push(rec.value);
    if (candidates.length > 0) {
      return candidates;
    }
  }
  return [val];
}

export function evaluateMultistate(value: unknown, config?: MultistateConfig | null): MultistateMatch | undefined {
  if (!config?.enabled || value === undefined || value === null) {
    return undefined;
  }
  const candidates = extractRawCandidates(value);
  for (const rule of config.rules) {
    if (candidates.some((candidate) => matchesRule(candidate, rule))) {
      return { rule, color: rule.color };
    }
  }
  return undefined;
}

export function getMultistateColor(
  value: unknown,
  config: MultistateConfig | undefined,
  fallbackColor: string,
): string {
  return evaluateMultistate(value, config)?.color ?? fallbackColor;
}

/** Normalizes the different digital-value shapes returned by PI datasources. */
export function normalizePiDigitalValue(value: unknown): NormalizedDigitalValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' || typeof value === 'string') {
    return typeof value === 'number' ? { value } : { name: value };
  }
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const state = value as Record<string, unknown>;
  const nameCandidate = state.Name ?? state.name ?? state.Text ?? state.text ?? state.State ?? state.state;
  const valueCandidate = state.Value ?? state.value ?? state.Code ?? state.code;
  const name = typeof nameCandidate === 'string' && nameCandidate.trim() ? nameCandidate.trim() : undefined;
  const digitalValue = typeof valueCandidate === 'number' || typeof valueCandidate === 'string' ? valueCandidate : undefined;
  return name || digitalValue !== undefined ? { ...(name ? { name } : {}), ...(digitalValue !== undefined ? { value: digitalValue } : {}) } : undefined;
}

export function isValidMultistateRule(rule: MultistateRule): boolean {
  const hasValidColor = HEX_COLOR.test(rule.color) || rule.color === TRANSPARENT_COLOR;
  if (!hasValidColor) {
    return false;
  }
  const hasValidValue = typeof rule.value === 'number'
    ? Number.isFinite(rule.value)
    : typeof rule.value === 'string' && rule.value.trim().length > 0;
  if (!hasValidValue) {
    return false;
  }
  if (rule.operator === 'between') {
    const num1 = typeof rule.value === 'number' ? rule.value : Number(rule.value);
    const num2 = typeof rule.value2 === 'number' ? rule.value2 : Number(rule.value2);
    return Number.isFinite(num1) && Number.isFinite(num2) && num1 < num2;
  }
  return true;
}

export function createDefaultMultistateRule(id: string): MultistateRule {
  return { id, operator: 'lt', value: 0, color: DEFAULT_RULE_COLOR };
}

export function updateMultistateConfig(
  document: DisplayDocument,
  elementId: string,
  config: MultistateConfig | undefined,
): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    if (element.id !== elementId || !['value', 'gauge', 'bar', 'rectangle', 'library-symbol'].includes(element.type)) {
      return element;
    }
    changed = true;
    const properties = { ...element.properties } as Record<string, unknown>;
    if (config === undefined) {
      delete properties.multistate;
    } else {
      properties.multistate = normalizeMultistateConfig(config);
    }
    return { ...element, properties };
  });
  return changed ? { ...document, elements } : document;
}

export function updateBackgroundMultistateConfig(
  document: DisplayDocument,
  elementId: string,
  config: MultistateConfig | undefined,
): DisplayDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    if (element.id !== elementId || element.type !== 'value') {
      return element;
    }
    changed = true;
    const properties = { ...element.properties } as Record<string, unknown>;
    if (config === undefined) {
      delete properties.backgroundMultistate;
    } else {
      properties.backgroundMultistate = normalizeMultistateConfig(config);
    }
    return { ...element, properties };
  });
  return changed ? { ...document, elements } : document;
}

function matchesRule(rawVal: unknown, rule: MultistateRule): boolean {
  if (!isValidMultistateRule(rule)) {
    return false;
  }

  // Equality comparison (supports strings, numbers, booleans, digital states)
  if (rule.operator === 'eq') {
    const digital = normalizePiDigitalValue(rawVal);
    if (rule.digitalStateValue !== undefined && digital?.value !== undefined
      && String(digital.value).trim() === String(rule.digitalStateValue).trim()) {
      return true;
    }
    if (rule.digitalStateName && digital?.name
      && digital.name.trim().toLocaleLowerCase() === rule.digitalStateName.trim().toLocaleLowerCase()) {
      return true;
    }
    const strVal = String(rawVal).trim().toLowerCase();
    const strRule = String(rule.value).trim().toLowerCase();
    if (strVal === strRule) {
      return true;
    }
    if (typeof rawVal === 'boolean') {
      const isTrue = rawVal === true;
      if (isTrue && ['1', 'true', 'ligado', 'on', 'aberto', 'running', 'sim', 'yes', 'ativo'].includes(strRule)) return true;
      if (!isTrue && ['0', 'false', 'desligado', 'off', 'fechado', 'stopped', 'nao', 'não', 'no', 'inativo'].includes(strRule)) return true;
    }
    if (typeof rawVal === 'number' || (!Number.isNaN(Number(rawVal)) && strVal !== '')) {
      const numVal = Number(rawVal);
      const numRule = Number(rule.value);
      if (Number.isFinite(numVal) && Number.isFinite(numRule) && numVal === numRule) {
        return true;
      }
    }
    return false;
  }

  // Numeric comparisons for lt, lte, gt, gte, between
  const numVal = typeof rawVal === 'number' ? rawVal : Number(rawVal);
  const numRule = typeof rule.value === 'number' ? rule.value : Number(rule.value);

  if (!Number.isFinite(numVal) || !Number.isFinite(numRule)) {
    return false;
  }

  switch (rule.operator) {
    case 'lt': return numVal < numRule;
    case 'lte': return numVal <= numRule;
    case 'gt': return numVal > numRule;
    case 'gte': return numVal >= numRule;
    case 'between': {
      const numRule2 = typeof rule.value2 === 'number' ? rule.value2 : Number(rule.value2);
      return Number.isFinite(numRule2) && numVal >= numRule && numVal < numRule2;
    }
    default:
      return false;
  }
}

function normalizeRule(rule: unknown, index: number): MultistateRule | undefined {
  if (!rule || typeof rule !== 'object') {
    return undefined;
  }
  const candidate = rule as Partial<MultistateRule>;
  const operator = candidate.operator;
  if (!['lt', 'lte', 'gt', 'gte', 'eq', 'between'].includes(String(operator))) {
    return undefined;
  }
  let value: number | string = Number.NaN;
  if (typeof candidate.value === 'number') {
    value = candidate.value;
  } else if (typeof candidate.value === 'string') {
    const trimmed = candidate.value.trim();
    const num = Number(trimmed);
    value = trimmed !== '' && Number.isFinite(num) ? num : trimmed;
  }
  let value2: number | string | undefined = undefined;
  if (typeof candidate.value2 === 'number') {
    value2 = candidate.value2;
  } else if (typeof candidate.value2 === 'string') {
    const trimmed = candidate.value2.trim();
    const num = Number(trimmed);
    value2 = trimmed !== '' && Number.isFinite(num) ? num : trimmed;
  }
  return {
    id: typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : `multistate-rule-${index + 1}`,
    operator: operator as MultistateOperator,
    value,
    ...(value2 === undefined ? {} : { value2 }),
    ...(typeof candidate.digitalStateValue === 'number' || typeof candidate.digitalStateValue === 'string'
      ? { digitalStateValue: candidate.digitalStateValue }
      : {}),
    ...(typeof candidate.digitalStateName === 'string' && candidate.digitalStateName.trim()
      ? { digitalStateName: candidate.digitalStateName.trim() }
      : {}),
    color: typeof candidate.color === 'string' && (HEX_COLOR.test(candidate.color) || candidate.color === TRANSPARENT_COLOR) ? candidate.color : DEFAULT_RULE_COLOR,
  };
}
