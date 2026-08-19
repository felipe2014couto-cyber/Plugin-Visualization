import type { DisplayDocument } from './displayDocument';

export type MultistateOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'between';

export interface MultistateRule {
  id: string;
  operator: MultistateOperator;
  value: number;
  value2?: number;
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

export function evaluateMultistate(value: unknown, config?: MultistateConfig | null): MultistateMatch | undefined {
  const numericValue = toMultistateNumber(value);
  if (!config?.enabled || numericValue === undefined) {
    return undefined;
  }
  for (const rule of config.rules) {
    if (matchesRule(numericValue, rule)) {
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

export function isValidMultistateRule(rule: MultistateRule): boolean {
  if (!Number.isFinite(rule.value) || (!HEX_COLOR.test(rule.color) && rule.color !== TRANSPARENT_COLOR)) {
    return false;
  }
  return rule.operator !== 'between'
    || (typeof rule.value2 === 'number' && Number.isFinite(rule.value2) && rule.value < rule.value2);
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

function matchesRule(value: number, rule: MultistateRule): boolean {
  if (!isValidMultistateRule(rule)) {
    return false;
  }
  switch (rule.operator) {
    case 'lt': return value < rule.value;
    case 'lte': return value <= rule.value;
    case 'gt': return value > rule.value;
    case 'gte': return value >= rule.value;
    case 'eq': return value === rule.value;
    case 'between': return value >= rule.value && value < (rule.value2 as number);
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
  const value = typeof candidate.value === 'number' ? candidate.value : Number.NaN;
  const value2 = typeof candidate.value2 === 'number' ? candidate.value2 : undefined;
  return {
    id: typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : `multistate-rule-${index + 1}`,
    operator: operator as MultistateOperator,
    value,
    ...(value2 === undefined ? {} : { value2 }),
    color: typeof candidate.color === 'string' && (HEX_COLOR.test(candidate.color) || candidate.color === TRANSPARENT_COLOR) ? candidate.color : DEFAULT_RULE_COLOR,
  };
}

function toMultistateNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }
  return undefined;
}
