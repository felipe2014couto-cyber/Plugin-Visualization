import type { PiPointBinding } from '../pi/piPointBinding';

export type PeCalculationSchedule =
  | { type: 'clock'; intervalSeconds: number; anchor: string }
  | { type: 'event'; trigger: PiPointBinding; anchor?: string };

export type PeScheduleSource = 'explicit-clock' | 'explicit-event';

export interface PeCalculationScan {
  id: string;
  sequence: number;
  timestamp: number;
  source: PeScheduleSource;
  triggerIdentity?: string;
}

export interface PeTriggerEvent {
  identity: string;
  timestamp: number;
}

export interface PeStatefulOccurrence {
  functionName: 'ARMA' | 'IMPULSE' | 'MEDIANFILT' | 'DELAY';
  start: number;
  end: number;
  id: string;
  nested: boolean;
}

export type PeRuntimeResult<T = number | string> =
  | { kind: 'value'; value: T; timestamp: number }
  | { kind: 'calc-failed'; timestamp: number; message: string }
  | { kind: 'no-output'; timestamp: number };

export interface PeNumericScanInput {
  scan: PeCalculationScan;
  input: number;
  runflag: number;
}

export interface PeEvaluationContext {
  calculationId: string;
  expressionRevision: string;
  scheduleIdentity: string;
  scan: PeCalculationScan;
  occurrences: PeStatefulOccurrence[];
  occurrenceCursor: Map<string, number>;
  delayState: Map<string, Map<number, { input: number; result?: number }>>;
}

export function createPeEvaluationContext(
  calculationId: string,
  expression: string,
  schedule: PeCalculationSchedule,
  scan: PeCalculationScan,
): PeEvaluationContext {
  validatePeSchedule(schedule);
  return {
    calculationId,
    expressionRevision: expressionRevision(expression),
    scheduleIdentity: peScheduleIdentity(schedule),
    scan,
    occurrences: findStatefulOccurrences(expression),
    occurrenceCursor: new Map(),
    delayState: new Map(),
  };
}

export function resetPeOccurrenceCursor(context: PeEvaluationContext): void {
  context.occurrenceCursor.clear();
}

export function nextPeOccurrenceId(context: PeEvaluationContext, functionName: string): string {
  const normalized = functionName.toLocaleUpperCase() as PeStatefulOccurrence['functionName'];
  const occurrences = context.occurrences.filter(({ functionName: candidate }) => candidate === normalized);
  const index = context.occurrenceCursor.get(normalized) ?? 0;
  context.occurrenceCursor.set(normalized, index + 1);
  return occurrences[index]?.id ?? `${context.expressionRevision}:${normalized}:${index}`;
}

export function evaluatePeDelay(
  context: PeEvaluationContext,
  occurrenceId: string,
  input: number,
  runflag: number,
  length: number,
): number {
  if (!Number.isFinite(input) || !Number.isFinite(runflag)) throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', 'Delay requer input e runflag numéricos finitos.');
  if (!Number.isInteger(length) || length < 1) throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', 'Delay requer comprimento inteiro maior ou igual a 1.');
  if (runflag === 0) throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', 'Delay com runflag zero permanece sem semântica oficial de reset comprovada.');
  const state = context.delayState.get(occurrenceId) ?? new Map<number, { input: number; result?: number }>();
  const existing = state.get(context.scan.sequence);
  if (existing) {
    if (existing.input !== input) throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', 'Scan duplicado de Delay possui input diferente.');
    if (existing.result === undefined) throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', `Delay requer ${length} scans anteriores.`);
    return existing.result;
  }
  const prior = [...state.entries()].filter(([sequence]) => sequence < context.scan.sequence).sort(([left], [right]) => left - right);
  const greatestSequence = prior.at(-1)?.[0];
  if (greatestSequence !== undefined && context.scan.sequence < greatestSequence) {
    throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', 'Sequência de scans do Delay não é monotônica.');
  }
  const delayed = prior.find(([sequence]) => sequence === context.scan.sequence - length)?.[1].input;
  const record = { input, ...(delayed === undefined ? {} : { result: delayed }) };
  state.set(context.scan.sequence, record);
  context.delayState.set(occurrenceId, state);
  if (delayed === undefined) throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', `Delay requer ${length} scans anteriores.`);
  return delayed;
}

const STATEFUL_FUNCTIONS = new Set<PeStatefulOccurrence['functionName']>(['ARMA', 'IMPULSE', 'MEDIANFILT', 'DELAY']);
const SCHEDULER_REQUIRED_FUNCTIONS = new Set<PeStatefulOccurrence['functionName']>(['ARMA', 'IMPULSE', 'DELAY']);

export type PeSchedulerErrorCode = 'SCHEDULER_CONTEXT_REQUIRED' | 'INVALID_SCHEDULE' | 'STATEFUL_FUNCTION_NOT_READY';

export class PeSchedulerError extends Error {
  constructor(readonly code: PeSchedulerErrorCode, message: string) {
    super(message);
    this.name = 'PeSchedulerError';
  }
}

export function expressionRevision(expression: string): string {
  return stableHash(expression);
}

export function expressionRequiresSchedulerContext(expression: string): boolean {
  return findStatefulOccurrences(expression).length > 0;
}

export function schedulerRequiredFunctionNames(expression: string): string[] {
  return [...new Set(findStatefulOccurrences(expression)
    .filter(({ functionName }) => SCHEDULER_REQUIRED_FUNCTIONS.has(functionName))
    .map(({ functionName }) => functionName[0] + functionName.slice(1).toLocaleLowerCase()))];
}

export function expressionRequiresStatefulScheduler(expression: string): boolean {
  return schedulerRequiredFunctionNames(expression).length > 0;
}

export function requirePeSchedulerContext(expression: string, schedule: PeCalculationSchedule | undefined): void {
  const functions = schedulerRequiredFunctionNames(expression);
  if (functions.length === 0) return;
  if (schedule === undefined) {
    throw new PeSchedulerError('SCHEDULER_CONTEXT_REQUIRED', `A função ${functions.join(', ')} requer configuração do PE Scheduler (Clock ou Event).`);
  }
  try {
    validatePeSchedule(schedule);
  } catch (error) {
    throw new PeSchedulerError('INVALID_SCHEDULE', error instanceof Error ? error.message : 'Configuração do PE Scheduler inválida.');
  }
}

export function findStatefulOccurrences(expression: string): PeStatefulOccurrence[] {
  const revision = expressionRevision(expression);
  const calls: Array<Omit<PeStatefulOccurrence, 'id' | 'nested'>> = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (char === '\'' || char === '"') {
      index = skipQuoted(expression, index);
      continue;
    }
    if (!/[A-Za-z_]/.test(char)) {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) index += 1;
    const functionName = expression.slice(start, index).toLocaleUpperCase();
    let open = index;
    while (open < expression.length && /\s/.test(expression[open])) open += 1;
    if (!STATEFUL_FUNCTIONS.has(functionName as PeStatefulOccurrence['functionName']) || expression[open] !== '(') continue;
    const end = matchingParenthesisEnd(expression, open);
    if (end === undefined) throw new Error(`Parênteses não balanceados na função ${expression.slice(start, index)}.`);
    calls.push({ functionName: functionName as PeStatefulOccurrence['functionName'], start, end });
  }
  return calls.map((call) => ({
    ...call,
    id: `${revision}:${call.functionName}:${call.start}:${call.end}`,
    nested: calls.some((parent) => parent !== call && parent.start < call.start && parent.end > call.end),
  }));
}

export function validatePeSchedule(schedule: PeCalculationSchedule): void {
  if (schedule.type === 'clock') {
    if (!Number.isFinite(schedule.intervalSeconds) || schedule.intervalSeconds <= 0) {
      throw new Error('Schedule Clock requer intervalo positivo em segundos.');
    }
    if (!Number.isFinite(Date.parse(schedule.anchor))) throw new Error('Schedule Clock requer anchor ISO válido.');
    return;
  }
  if (!schedule.trigger.dataSourceUid.trim() || !schedule.trigger.serverPath.trim() || !schedule.trigger.pointName.trim()) {
    throw new Error('Schedule Event requer um PI Point trigger completo.');
  }
  if (schedule.anchor !== undefined && !Number.isFinite(Date.parse(schedule.anchor))) {
    throw new Error('Schedule Event possui anchor inválido.');
  }
}

export function peScheduleIdentity(schedule: PeCalculationSchedule): string {
  validatePeSchedule(schedule);
  return schedule.type === 'clock'
    ? stableHash(`clock\u0000${schedule.anchor}\u0000${schedule.intervalSeconds}`)
    : stableHash(`event\u0000${bindingIdentity(schedule.trigger)}\u0000${schedule.anchor ?? ''}`);
}

export function buildClockEvaluationSequence(
  schedule: Extract<PeCalculationSchedule, { type: 'clock' }>,
  from: number,
  to: number,
  maxScans = 100_000,
): PeCalculationScan[] {
  validatePeSchedule(schedule);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error('Intervalo de replay Clock inválido.');
  const intervalMs = schedule.intervalSeconds * 1000;
  const anchorMs = Date.parse(schedule.anchor);
  const firstSequence = Math.max(0, Math.ceil((from - anchorMs) / intervalMs));
  const lastSequence = Math.floor((to - anchorMs) / intervalMs);
  if (lastSequence < firstSequence) return [];
  const count = lastSequence - firstSequence + 1;
  if (count > maxScans) throw new Error('Replay Clock excede o limite explícito de scans.');
  const scheduleId = peScheduleIdentity(schedule);
  return Array.from({ length: count }, (_, offset) => {
    const sequence = firstSequence + offset;
    return {
      id: `${scheduleId}:clock:${sequence}`,
      sequence,
      timestamp: anchorMs + sequence * intervalMs,
      source: 'explicit-clock',
    };
  });
}

export function buildEventEvaluationSequence(
  schedule: Extract<PeCalculationSchedule, { type: 'event' }>,
  events: readonly PeTriggerEvent[],
): PeCalculationScan[] {
  validatePeSchedule(schedule);
  const anchorMs = schedule.anchor === undefined ? Number.NEGATIVE_INFINITY : Date.parse(schedule.anchor);
  const unique = new Map<string, PeTriggerEvent>();
  for (const event of events) {
    if (!event.identity.trim() || !Number.isFinite(event.timestamp)) throw new Error('Evento trigger inválido.');
    const existing = unique.get(event.identity);
    if (existing && existing.timestamp !== event.timestamp) throw new Error('Identidade de evento trigger reutilizada com timestamp diferente.');
    if (event.timestamp >= anchorMs) unique.set(event.identity, event);
  }
  const ordered = [...unique.values()].sort((left, right) => left.timestamp - right.timestamp || left.identity.localeCompare(right.identity));
  const scheduleId = peScheduleIdentity(schedule);
  return ordered.map((event, sequence) => ({
    id: `${scheduleId}:event:${stableHash(event.identity)}`,
    sequence,
    timestamp: event.timestamp,
    source: 'explicit-event',
    triggerIdentity: event.identity,
  }));
}

export async function replayEvaluationSequence<T>(
  scans: readonly PeCalculationScan[],
  evaluate: (scan: PeCalculationScan) => T | Promise<T>,
): Promise<Array<{ scan: PeCalculationScan; result: T }>> {
  const byId = new Map<string, PeCalculationScan>();
  for (const scan of scans) {
    const existing = byId.get(scan.id);
    if (existing && (existing.sequence !== scan.sequence || existing.timestamp !== scan.timestamp)) {
      throw new Error('Scan ID reutilizado com conteúdo diferente.');
    }
    byId.set(scan.id, scan);
  }
  const ordered = [...byId.values()].sort((left, right) => left.sequence - right.sequence || left.timestamp - right.timestamp || left.id.localeCompare(right.id));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].sequence <= ordered[index - 1].sequence || ordered[index].timestamp < ordered[index - 1].timestamp) {
      throw new Error('A sequência PE precisa ser monotônica.');
    }
  }
  const results: Array<{ scan: PeCalculationScan; result: T }> = [];
  for (const scan of ordered) results.push({ scan, result: await evaluate(scan) });
  return results;
}

/** Official PE recurrence: u[t] = sum(a[k]u[t-k-1]) + sum(b[k]y[t-k]). */
export function replayArma(
  values: readonly PeNumericScanInput[],
  outputCoefficients: readonly number[],
  inputCoefficients: readonly number[],
  initialState?: { previousInputs: readonly number[]; previousOutputs: readonly number[] },
): PeRuntimeResult<number>[] {
  validateCoefficients(outputCoefficients, inputCoefficients);
  const ordered = canonicalNumericInputs(values);
  const results: PeRuntimeResult<number>[] = [];
  let inputHistory = [...(initialState?.previousInputs ?? [])];
  let outputHistory = [...(initialState?.previousOutputs ?? [])];
  for (const { scan, input, runflag } of ordered) {
    if (runflag === 0) {
      inputHistory = [];
      outputHistory = [];
      results.push({ kind: 'calc-failed', timestamp: scan.timestamp, message: 'Arma reinicializado pelo runflag.' });
      continue;
    }
    const requiredHistory = outputCoefficients.length;
    if (inputHistory.length < requiredHistory || outputHistory.length < requiredHistory) {
      inputHistory.unshift(input);
      inputHistory = inputHistory.slice(0, requiredHistory);
      results.push({ kind: 'calc-failed', timestamp: scan.timestamp, message: 'Arma requer estado inicial de outputs anteriores comprovado.' });
      continue;
    }
    const output = outputCoefficients.reduce((sum, coefficient, index) => sum + coefficient * outputHistory[index], 0)
      + inputCoefficients.reduce((sum, coefficient, index) => sum + coefficient * (index === 0 ? input : inputHistory[index - 1]), 0);
    results.push({ kind: 'value', value: output, timestamp: scan.timestamp });
    inputHistory.unshift(input);
    outputHistory.unshift(output);
    inputHistory = inputHistory.slice(0, requiredHistory);
    outputHistory = outputHistory.slice(0, requiredHistory);
  }
  return results;
}

/** Delay is measured in calculation scans, never in wall-clock units. */
export function replayDelay(values: readonly PeNumericScanInput[], length: number): PeRuntimeResult<number>[] {
  if (!Number.isInteger(length) || length < 1) throw new Error('Delay requer comprimento inteiro maior ou igual a 1.');
  const ordered = canonicalNumericInputs(values);
  const history: number[] = [];
  return ordered.map(({ scan, input, runflag }) => {
    if (runflag === 0) {
      throw new Error('Delay com runflag zero permanece sem semântica oficial de reset comprovada.');
    }
    const delayed = history.at(-length);
    history.push(input);
    return delayed === undefined
      ? { kind: 'calc-failed', timestamp: scan.timestamp, message: `Delay requer ${length} scans anteriores.` }
      : { kind: 'value', value: delayed, timestamp: scan.timestamp };
  });
}

export function replayNoOutput<T>(results: readonly PeRuntimeResult<T>[]): Array<{
  result: PeRuntimeResult<T>;
  lastEmitted?: Extract<PeRuntimeResult<T>, { kind: 'value' }>;
}> {
  let lastEmitted: Extract<PeRuntimeResult<T>, { kind: 'value' }> | undefined;
  return results.map((result) => {
    if (result.kind === 'value') lastEmitted = result;
    return { result, ...(lastEmitted === undefined ? {} : { lastEmitted }) };
  });
}

function matchingParenthesisEnd(expression: string, open: number): number | undefined {
  let depth = 0;
  for (let index = open; index < expression.length; index += 1) {
    if (expression[index] === '\'' || expression[index] === '"') {
      index = skipQuoted(expression, index) - 1;
      continue;
    }
    if (expression[index] === '(') depth += 1;
    if (expression[index] === ')' && --depth === 0) return index + 1;
  }
  return undefined;
}

function skipQuoted(expression: string, start: number): number {
  const quote = expression[start];
  let index = start + 1;
  while (index < expression.length) {
    if (expression[index] === '\\') index += 2;
    else if (expression[index] === quote) return index + 1;
    else index += 1;
  }
  return expression.length;
}

function bindingIdentity(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function canonicalNumericInputs(values: readonly PeNumericScanInput[]): PeNumericScanInput[] {
  const byScan = new Map<string, PeNumericScanInput>();
  for (const value of values) {
    if (!Number.isFinite(value.input) || !Number.isFinite(value.runflag)) throw new Error('Função stateful requer input e runflag numéricos finitos.');
    const existing = byScan.get(value.scan.id);
    if (existing && (existing.input !== value.input || existing.runflag !== value.runflag)) {
      throw new Error('Scan duplicado possui valores stateful diferentes.');
    }
    byScan.set(value.scan.id, value);
  }
  const ordered = [...byScan.values()].sort((left, right) => left.scan.sequence - right.scan.sequence || left.scan.timestamp - right.scan.timestamp);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].scan.sequence <= ordered[index - 1].scan.sequence || ordered[index].scan.timestamp < ordered[index - 1].scan.timestamp) {
      throw new Error('Inputs stateful não formam sequência monotônica.');
    }
  }
  return ordered;
}

function validateCoefficients(outputCoefficients: readonly number[], inputCoefficients: readonly number[]): void {
  if (outputCoefficients.length < 1 || inputCoefficients.length !== outputCoefficients.length + 1) {
    throw new Error('Arma requer exatamente um coeficiente b a mais que coeficientes a.');
  }
  if (![...outputCoefficients, ...inputCoefficients].every(Number.isFinite)) throw new Error('Arma requer coeficientes numéricos finitos.');
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
