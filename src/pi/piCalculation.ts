import type { DataSourceSrv } from '@grafana/runtime';
import { piCompatibilityCatalog } from '../calculations/piCompatibilityCatalog';
import type { PiPointBinding } from './piPointBinding';
import { getPiCalculationDataServerWebId, getPiResource } from './piDataSource';

export type PiCalculationMode = 'times' | 'recorded' | 'intervals' | 'summary';
export type PiCalculationCapabilityStatus = 'not-tested' | 'supported' | 'unsupported' | 'permission-denied' | 'error';

export interface PiCalculationDigitalState {
  name: string;
  value?: number | string;
  isSystem?: boolean;
}

export interface PiCalculationValue {
  timestamp?: string;
  value: number | string | PiCalculationDigitalState;
  valueKind?: 'timestamp';
  good?: boolean;
  questionable?: boolean;
  substituted?: boolean;
  annotated?: boolean;
  unitsAbbreviation?: string;
  errors: string[];
}

export interface PiCalculationNoOutput {
  kind: 'no-output';
}

export type PiCalculationResult = PiCalculationValue | PiCalculationNoOutput;

export interface PiCalculationRequest {
  binding?: PiPointBinding;
  dataSourceUid?: string;
  dataServerWebId?: string;
  expression: string;
  mode?: PiCalculationMode;
  time?: string;
  startTime?: string;
  endTime?: string;
  interval?: string;
  summaryType?: string;
  dataSourceSrv?: Pick<DataSourceSrv, 'get'>;
}

export class PiCalculationUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'PiCalculationUnavailableError';
  }
}

export class PiCalculationExecutionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'PiCalculationExecutionError';
  }
}

export class PiCalculationNoMatchError extends PiCalculationExecutionError {
  constructor(message = 'A função Find não encontrou correspondência no período.') {
    super(message);
    this.name = 'PiCalculationNoMatchError';
  }
}

const controllerModes: readonly PiCalculationMode[] = ['times', 'recorded', 'intervals', 'summary'];
const capabilityCache = new Map<string, Promise<Record<PiCalculationMode, PiCalculationCapabilityStatus>>>();
const evaluationLock = new Map<string, Promise<PiCalculationResult>>();
const evaluationCache = new Map<string, { expiresAt: number; value: PiCalculationResult }>();
const EVALUATION_CACHE_MS = 1_000;

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  const raw = record.status ?? record.statusCode ?? (record.response as Record<string, unknown> | undefined)?.status;
  const status = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(status) ? status : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return String(error);
  const record = error as Record<string, unknown>;
  const direct = [record.message, record.statusText, record.Errors, record.errors]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (direct) return direct;
  const response = record.response;
  if (response && typeof response === 'object') {
    const nested = errorMessage(response);
    if (nested !== '[object Object]') return nested;
  }
  const safeFields = Object.entries(record)
    .filter(([key]) => !/(authorization|cookie|token|password|secret)/i.test(key))
    .flatMap(([key, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? [`${key}: ${String(value)}`]
      : []);
  return safeFields.join('; ') || 'Erro não detalhado retornado pelo PI Calculation Controller.';
}

function capabilityFromError(error: unknown): PiCalculationCapabilityStatus {
  const status = statusOf(error);
  if (status === 401 || status === 403) return 'permission-denied';
  if (status === 404 || status === 405 || status === 501) return 'unsupported';
  return 'error';
}

function queryFor(mode: PiCalculationMode, webId: string, expression: string, request: Pick<PiCalculationRequest, 'time' | 'startTime' | 'endTime' | 'interval' | 'summaryType'>): string {
  const query = new URLSearchParams({ webId, expression });
  if (mode === 'times') query.set('time', request.time ?? '*');
  if (mode === 'recorded') {
    query.set('startTime', request.startTime ?? '*-1m');
    query.set('endTime', request.endTime ?? '*');
  }
  if (mode === 'intervals') {
    query.set('startTime', request.startTime ?? '*-1m');
    query.set('endTime', request.endTime ?? '*');
    query.set('interval', request.interval ?? '1m');
  }
  if (mode === 'summary') {
    query.set('startTime', request.startTime ?? '*-1m');
    query.set('endTime', request.endTime ?? '*');
    query.set('summaryType', request.summaryType ?? 'Total');
  }
  return `/calculation/${mode}?${query.toString()}`;
}

function valuesFromResponse(response: unknown): Record<string, unknown>[] {
  if (!response || typeof response !== 'object') throw new PiCalculationExecutionError('Resposta inválida do PI Calculation Controller.');
  const root = response as Record<string, unknown>;
  const errors = collectErrors(root.Errors);
  if (errors.length > 0) throw new PiCalculationExecutionError(errors.join('; '));
  if (!Array.isArray(root.Items)) throw new PiCalculationExecutionError('Resposta inválida do PI Calculation Controller: Items ausente.');
  if (root.Items.length === 0) throw new PiCalculationExecutionError('PI Calculation Controller não retornou itens.');
  return root.Items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function collectErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return typeof value === 'string' && value.trim() ? [value] : [];
  return value.flatMap((item) => typeof item === 'string' && item.trim() ? [item] : []);
}

function isNoOutputItem(item: Record<string, unknown>): boolean {
  if (item.Good !== false || !item.Value || typeof item.Value !== 'object' || Array.isArray(item.Value)) return false;
  const value = item.Value as Record<string, unknown>;
  return value.IsSystem === true && value.Name === 'No Sample' && value.Value === 211;
}

function normalizeValue(item: Record<string, unknown>, expression?: string): PiCalculationResult {
  // Calculation/summary wraps the regular PI value in an item carrying Type.
  // Do not confuse it with a Digital State object, which has Name/Value but no
  // timestamp or quality fields of its own.
  const nested = item.Value;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedRecord = nested as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(nestedRecord, 'Value')
      && (typeof nestedRecord.Timestamp === 'string' || typeof nestedRecord.Good === 'boolean')) {
      return normalizeValue({ ...item, ...nestedRecord }, expression);
    }
  }
  const errors = collectErrors(item.Errors);
  if (errors.length > 0) {
    if (expression && /\bFind(?:Eq|NE|GT|GE|LT|LE)\s*\(/i.test(expression)
      && /no\s*(?:data|match)|not\s*found|nenhum(?:a)?\s+correspond/i.test(errors.join('; '))) {
      throw new PiCalculationNoMatchError(errors.join('; '));
    }
    throw new PiCalculationExecutionError(errors.join('; '));
  }
  if (isNoOutputItem(item)) return { kind: 'no-output' };
  const good = typeof item.Good === 'boolean' ? item.Good : undefined;
  if (good === false) {
    const rawName = item.Value && typeof item.Value === 'object' && !Array.isArray(item.Value)
      ? (item.Value as Record<string, unknown>).Name
      : undefined;
    const text = typeof rawName === 'string' ? rawName : errors.join('; ');
    if (expression && /\bFind(?:Eq|NE|GT|GE|LT|LE)\s*\(/i.test(expression)
      && /no\s*(?:data|match)|not\s*found|nenhum(?:a)?\s+correspond/i.test(text)) {
      throw new PiCalculationNoMatchError(text);
    }
    throw new PiCalculationExecutionError('PI Calculation Controller retornou Good=false.');
  }
  if (!Object.prototype.hasOwnProperty.call(item, 'Value')) throw new PiCalculationExecutionError('Resposta inválida do PI Calculation Controller: Value ausente.');
  const raw = item.Value;
  const value = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? normalizeDigitalState(raw as Record<string, unknown>)
    : typeof raw === 'number' || typeof raw === 'string'
      ? raw
      : String(raw);
  return {
    timestamp: typeof item.Timestamp === 'string' ? item.Timestamp : undefined,
    value,
    ...(expression && /\bFind(?:Eq|NE|GT|GE|LT|LE)\s*\(/i.test(expression) ? { valueKind: 'timestamp' as const } : {}),
    good,
    questionable: typeof item.Questionable === 'boolean' ? item.Questionable : undefined,
    substituted: typeof item.Substituted === 'boolean' ? item.Substituted : undefined,
    annotated: typeof item.Annotated === 'boolean' ? item.Annotated : undefined,
    unitsAbbreviation: typeof item.UnitsAbbreviation === 'string' ? item.UnitsAbbreviation : undefined,
    errors,
  };
}

function normalizeDigitalState(value: Record<string, unknown>): PiCalculationDigitalState {
  const name = typeof value.Name === 'string' ? value.Name : typeof value.Value === 'string' ? value.Value : JSON.stringify(value);
  const stateValue = typeof value.Value === 'number' || typeof value.Value === 'string' ? value.Value : undefined;
  return { name, ...(stateValue !== undefined ? { value: stateValue } : {}), ...(value.IsSystem === true ? { isSystem: true } : {}) };
}

async function dataServerWebId(request: PiCalculationRequest): Promise<string> {
  if (request.dataServerWebId) return request.dataServerWebId;
  if (!request.binding) throw new PiCalculationUnavailableError('PI Data Server context required.');
  const webId = await getPiCalculationDataServerWebId(request.binding, request.dataSourceSrv);
  if (!webId) throw new PiCalculationUnavailableError(`Não foi possível identificar o PI Data Server para "${request.binding.serverPath}".`);
  return webId;
}

export async function probePiCalculationController(binding: PiPointBinding, dataSourceSrv?: Pick<DataSourceSrv, 'get'>): Promise<Record<PiCalculationMode, PiCalculationCapabilityStatus>> {
  const webId = await getPiCalculationDataServerWebId(binding, dataSourceSrv);
  if (!webId) throw new PiCalculationUnavailableError(`Não foi possível identificar o PI Data Server para "${binding.serverPath}".`);
  const key = `${binding.dataSourceUid}\u0000${webId}`;
  const cached = capabilityCache.get(key);
  if (cached) return cached;
  const probe = Promise.all(controllerModes.map(async (mode) => {
    try {
      const response = await getPiResource<unknown>(binding.dataSourceUid, queryFor(mode, webId, '1+1', {}), dataSourceSrv);
      valuesFromResponse(response);
      return [mode, 'supported'] as const;
    } catch (error) {
      return [mode, capabilityFromError(error)] as const;
    }
  })).then((entries) => {
    const report = Object.fromEntries(entries) as Record<PiCalculationMode, PiCalculationCapabilityStatus>;
    // A transient transport/backend failure must not turn into a durable
    // "unsupported" conclusion for a controller route.
    if (Object.values(report).includes('error')) capabilityCache.delete(key);
    return report;
  });
  capabilityCache.set(key, probe);
  try {
    return await probe;
  } catch (error) {
    capabilityCache.delete(key);
    throw error;
  }
}

export async function evaluatePiExpression(request: PiCalculationRequest): Promise<PiCalculationResult> {
  const mode = request.mode ?? 'times';
  const webId = await dataServerWebId(request);
  const dataSourceUid = request.dataSourceUid ?? request.binding?.dataSourceUid;
  if (!dataSourceUid) throw new PiCalculationUnavailableError('PI Data Source context required.');
  const key = [dataSourceUid, webId, request.expression, mode, request.time ?? '', request.startTime ?? '', request.endTime ?? '', request.interval ?? '', request.summaryType ?? ''].join('\u0000');
  const cached = evaluationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const inflight = evaluationLock.get(key);
  if (inflight) return inflight;
  const evaluation = getPiResource<unknown>(dataSourceUid, queryFor(mode, webId, request.expression, request), request.dataSourceSrv)
    .then((response) => normalizeValue(valuesFromResponse(response)[0], request.expression))
    .catch((error) => {
      if (error instanceof PiCalculationExecutionError) throw error;
      const status = statusOf(error);
      const message = errorMessage(error);
      if (status === 401 || status === 403 || status === 404 || status === 405 || status === 500 || status === 501) {
        throw new PiCalculationUnavailableError(`PI Calculation Controller indisponível (${status}): ${message}`, status);
      }
      throw new PiCalculationExecutionError(message, status);
    })
    .then((value) => {
      evaluationCache.set(key, { value, expiresAt: Date.now() + EVALUATION_CACHE_MS });
      return value;
    })
    .finally(() => evaluationLock.delete(key));
  evaluationLock.set(key, evaluation);
  return evaluation;
}

const localExtensions = new Set([
  'Average', 'Minimum', 'Maximum', 'Count', 'Total', 'Moving_Average', 'Moving_Min', 'Moving_Max', 'Moving_StdDev',
  'UPPER', 'LOWER', 'LENGTH', 'SUBSTRING', 'CONCAT', 'IS_GOOD', 'IS_BAD', 'IS_QUESTIONABLE', 'IS_SUBSTITUTED', 'IS_NO_DATA', 'QUALITY', 'STATUS_CODE',
  'CLAMP', 'POWER', 'POW', 'SQRT', 'ABS', 'SUM', 'VARIANCE', 'STDDEV', 'PI', 'DEGREES', 'RADIANS', 'MAD', 'CV', 'PERCENTILE', 'TIME_DIFF', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'WHILE',
]);
const localCompatible = new Set([...piCompatibilityCatalog.compatible, 'IF', 'SE', 'AND', 'OR', 'NOT'].map((name) => name.toLocaleUpperCase()));
const officialPiFunctions = new Set(Object.values(piCompatibilityCatalog).flat().map((name) => name.toLocaleUpperCase()));

/** Extracts calls while skipping quoted PI point names and string literals. */
export function piExpressionFunctionNames(expression: string): string[] {
  const names: string[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (char === '\'' || char === '"') {
      const quote = char;
      index += 1;
      while (index < expression.length && expression[index] !== quote) index += expression[index] === '\\' ? 2 : 1;
      index += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) index += 1;
      const name = expression.slice(start, index);
      while (index < expression.length && /\s/.test(expression[index])) index += 1;
      if (expression[index] === '(') names.push(name);
      continue;
    }
    index += 1;
  }
  return names;
}

export function classifyPiExpression(expression: string): { target: 'pi' | 'local'; localFallbackSafe: boolean } {
  const names = piExpressionFunctionNames(expression);
  if (names.some((name) => localExtensions.has(name))) return { target: 'local', localFallbackSafe: true };
  if (names.some((name) => !officialPiFunctions.has(name.toLocaleUpperCase()) && !['IF', 'SE', 'AND', 'OR', 'NOT'].includes(name.toLocaleUpperCase()))) {
    return { target: 'local', localFallbackSafe: false };
  }
  return { target: 'pi', localFallbackSafe: names.every((name) => localCompatible.has(name.toLocaleUpperCase())) };
}

export function resetPiCalculationCachesForTests(): void {
  capabilityCache.clear();
  evaluationCache.clear();
  evaluationLock.clear();
}
