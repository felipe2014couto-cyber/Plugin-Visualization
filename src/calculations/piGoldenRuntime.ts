import type { DataSourceSrv } from '@grafana/runtime';
import {
  evaluatePiExpression,
  PiCalculationExecutionError,
  PiCalculationNoMatchError,
  PiCalculationUnavailableError,
  type PiCalculationRequest,
  type PiCalculationResult,
} from '../pi/piCalculation';
import {
  decodePiAlarmState,
  getPiDigitalStateSets,
  getPiPerformanceEquationPointAttributes,
  getPiRecordedRawHistory,
  resolvePiCalculationDataServerContext,
  searchPiPointsWithStatus,
  PI_DATASOURCE_TYPE,
  type PiAlarmStateInfo,
  type PiDigitalState,
  type PiRecordedRawPoint,
} from '../pi/piDataSource';
import { createPiPointBinding, type PiPointBinding } from '../pi/piPointBinding';
import type { PeCalculationSchedule } from './peSchedulerRuntime';
import type { PiGoldenFunction, PiGoldenObservation, PiGoldenOutcome } from './piGoldenHarness';

/** The only runtime accepted for PI evidence capture. */
export type PiGoldenRuntime = 'grafana-gpa';

export interface PiGoldenRuntimeCaptureRequest extends Omit<PiCalculationRequest, 'binding' | 'dataSourceSrv'> {
  binding?: PiPointBinding;
  dataSourceSrv?: Pick<DataSourceSrv, 'get' | 'getList'>;
  dataSourceUid?: string;
  functionName: PiGoldenFunction;
  runtime: PiGoldenRuntime;
  scanId?: string;
  /** Timestamp supplied by the known PI/PE scan context; never generated here. */
  evaluationTimestamp: string;
  input: unknown;
  runflag?: number;
  stateBefore?: unknown;
  schedule?: PeCalculationSchedule;
  environmentFingerprint?: Record<string, string>;
}

/** Evidence acquired from PI through the configured Grafana/GPA datasource. */
export interface PiGoldenRuntimeCapture {
  source: 'pi-real';
  runtime: PiGoldenRuntime;
  executionSource: 'pi-calculation-controller';
  context: {
    dataSourceUid: string;
    dataSourceType: typeof PI_DATASOURCE_TYPE;
    serverPath: string;
    resolution: 'binding' | 'datasource-single-server';
  };
  functionName: PiGoldenFunction;
  expression: string;
  scanId: string;
  timestamp: string;
  requestedEvaluationTimestamp: string;
  piEvaluationTimestamp?: string;
  input: unknown;
  runflag?: number;
  stateBefore?: unknown;
  schedule?: PeCalculationSchedule;
  environmentFingerprint?: Record<string, string>;
  piExpected: PiGoldenOutcome;
}

export class PiGoldenRuntimeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PiGoldenRuntimeUnavailableError';
  }
}

export class PiGoldenTimestampMismatchError extends Error {
  constructor(requested: string, received?: string) {
    super(`PI_GOLDEN_TIMESTAMP_MISMATCH: solicitado=${requested}; retornado=${received ?? 'ausente'}`);
    this.name = 'PiGoldenTimestampMismatchError';
  }
}

/** A recorded-value observation used only to locate real quality evidence. */
export interface PiGoldenQualityEvidence {
  source: 'pi-real';
  runtime: PiGoldenRuntime;
  executionSource: 'pi-web-api-recorded';
  context: {
    dataSourceUid: string;
    dataSourceType: typeof PI_DATASOURCE_TYPE;
    serverPath: string;
    resolution: 'binding';
  };
  pointName: string;
  range: { from: string; to: string };
  /** Count returned by this bounded GPA recorded request (the endpoint caps it). */
  returnedEventCount: number;
  candidates: readonly PiGoldenQualityEvidencePoint[];
}

export interface PiGoldenQualityEvidencePoint {
  timestamp: string;
  value: unknown;
  quality?: { good?: boolean; questionable?: boolean; substituted?: boolean; annotated?: boolean };
  recorded?: boolean;
  origin?: string;
}

export interface PiGoldenQualityEvidenceRequest {
  runtime: PiGoldenRuntime;
  binding: PiPointBinding;
  from: string;
  to: string;
  dataSourceSrv?: Pick<DataSourceSrv, 'get'>;
}

/** Structural discovery only; a returned set is not an Alm* semantic golden. */
export interface PiGoldenAlarmStateSetDiscovery {
  source: 'pi-real';
  runtime: PiGoldenRuntime;
  executionSource: 'pi-enumeration-set';
  context: {
    dataSourceUid: string;
    dataSourceType: typeof PI_DATASOURCE_TYPE;
    serverPath: string;
    resolution: 'binding';
  };
  structuralAlarmStateSets: readonly {
    name: string;
    webId?: string;
    states: readonly { name: string; code: number; decoded: PiAlarmStateInfo }[];
  }[];
}

export interface PiGoldenAlarmStateSetDiscoveryRequest {
  runtime: PiGoldenRuntime;
  binding: PiPointBinding;
  dataSourceSrv?: Pick<DataSourceSrv, 'getList' | 'get'>;
}

export type PiPerformanceEquationDiscoveryKind = 'LIKELY_PE_CLOCK' | 'LIKELY_PE_EVENT' | 'NOT_PE' | 'UNKNOWN';

export interface PiGoldenPerformanceEquationCandidate {
  outputPoint: string;
  webId: string;
  pointSource?: unknown;
  exDesc?: unknown;
  scheduleType: 'clock' | 'event' | 'unknown';
  triggerTag?: string;
  calculationExpression?: string;
  location1?: unknown;
  location3?: unknown;
  location4?: unknown;
  scan?: unknown;
  shutdown?: unknown;
  pointClass?: unknown;
  pointType?: unknown;
  detectedFunctions: readonly PiGoldenFunction[];
  classification: PiPerformanceEquationDiscoveryKind;
}

export interface PiGoldenPerformanceEquationDiscovery {
  source: 'pi-real';
  runtime: PiGoldenRuntime;
  executionSource: 'pi-point-attributes';
  nameFilter: string;
  startIndex: number;
  limit: number;
  hasMore: boolean;
  candidates: readonly PiGoldenPerformanceEquationCandidate[];
}

export interface PiGoldenPerformanceEquationDiscoveryRequest {
  runtime: PiGoldenRuntime;
  nameFilter: string;
  limit: number;
  startIndex?: number;
  dataSourceSrv?: Pick<DataSourceSrv, 'getList' | 'get'>;
}

const schedulerFunctions = new Set<PiGoldenFunction>(['Delay', 'Arma', 'Impulse', 'MedianFilt', 'NoOutput']);

/**
 * Captures only the PI-side observation. It intentionally does not evaluate a
 * stateful function through the stateless Calculation Controller.
 */
export async function capturePiGoldenRuntime(request: PiGoldenRuntimeCaptureRequest): Promise<PiGoldenRuntimeCapture> {
  if (request.runtime !== 'grafana-gpa') {
    throw new PiGoldenRuntimeUnavailableError('A captura de golden exige o runtime Grafana/GPA autenticado.');
  }
  if (schedulerFunctions.has(request.functionName)) {
    throw new PiGoldenRuntimeUnavailableError(
      `${request.functionName} exige uma Performance Equation real e seu Scheduler; o Controller isolado não é evidência válida.`,
    );
  }
  const requestedEvaluationTimestamp = normalizePiGoldenTimestamp(request.evaluationTimestamp);

  const context = request.binding ? undefined : await resolvePiCalculationDataServerContext(request.dataSourceSrv, request.dataSourceUid)
    .catch((error) => { throw new PiGoldenRuntimeUnavailableError(errorMessage(error)); });
  const resolvedContext = request.binding
    ? { dataSourceUid: request.binding.dataSourceUid, serverPath: request.binding.serverPath, resolution: 'binding' as const }
    : { dataSourceUid: context!.dataSourceUid, serverPath: context!.serverPath, resolution: 'datasource-single-server' as const };
  const evaluationRequest = request.binding
    ? request
    : { ...request, dataSourceUid: context?.dataSourceUid, dataServerWebId: context?.webId };
  let piExpected: PiGoldenOutcome;
  let piEvaluationTimestamp: string | undefined;
  try {
    const result = await evaluatePiExpression({ ...evaluationRequest, mode: 'times', time: requestedEvaluationTimestamp });
    if (!('kind' in result)) {
      piEvaluationTimestamp = result.timestamp;
      if (!timestampsRepresentSameInstant(requestedEvaluationTimestamp, result.timestamp)) {
        throw new PiGoldenTimestampMismatchError(requestedEvaluationTimestamp, result.timestamp);
      }
    }
    piExpected = normalizePiResult(result);
  } catch (error) {
    if (error instanceof PiGoldenTimestampMismatchError) throw error;
    piExpected = { kind: 'error', code: classifyError(error), message: errorMessage(error) };
  }

  return {
    source: 'pi-real',
    runtime: request.runtime,
    executionSource: 'pi-calculation-controller',
    context: { ...resolvedContext, dataSourceType: PI_DATASOURCE_TYPE },
    functionName: request.functionName,
    expression: request.expression,
    scanId: `golden-${requestedEvaluationTimestamp}`,
    timestamp: requestedEvaluationTimestamp,
    requestedEvaluationTimestamp,
    piEvaluationTimestamp,
    input: request.input,
    runflag: request.runflag,
    stateBefore: request.stateBefore,
    schedule: request.schedule,
    environmentFingerprint: request.environmentFingerprint,
    piExpected,
  };
}

/**
 * Reads the configured GPA datasource's recorded endpoint to find actual
 * quality events. It never manufactures flags, and is not a semantic golden
 * until the caller evaluates the relevant PI expression at a candidate time.
 */
export async function inspectPiGoldenQualityEvidence(request: PiGoldenQualityEvidenceRequest): Promise<PiGoldenQualityEvidence> {
  if (request.runtime !== 'grafana-gpa') {
    throw new PiGoldenRuntimeUnavailableError('A varredura de quality exige o runtime Grafana/GPA autenticado.');
  }
  if (!request.binding.webId) {
    throw new PiGoldenRuntimeUnavailableError('A varredura de quality exige o WebId resolvido do PI Point.');
  }
  const from = normalizePiGoldenTimestamp(request.from);
  const to = normalizePiGoldenTimestamp(request.to);
  if (Date.parse(to) < Date.parse(from)) {
    throw new PiGoldenRuntimeUnavailableError('O fim da varredura de quality deve ser igual ou posterior ao início.');
  }
  const points = await getPiRecordedRawHistory(
    request.binding,
    { from: Date.parse(from), to: Date.parse(to) },
    { selectedFields: ['Timestamp', 'Value', 'Good', 'Questionable', 'Substituted', 'Annotated', 'Recorded'] },
    request.dataSourceSrv,
  );
  return {
    source: 'pi-real',
    runtime: request.runtime,
    executionSource: 'pi-web-api-recorded',
    context: {
      dataSourceUid: request.binding.dataSourceUid,
      dataSourceType: PI_DATASOURCE_TYPE,
      serverPath: request.binding.serverPath,
      resolution: 'binding',
    },
    pointName: request.binding.pointName,
    range: { from, to },
    returnedEventCount: points.length,
    candidates: points
      .filter(hasQualityEvidence)
      .map(toQualityEvidencePoint),
  };
}

/**
 * Inspects only the Enumeration Sets exposed by the configured GPA datasource.
 * A set qualifies solely when the existing structural decoder accepts actual
 * PI state codes; names such as "Alarm" or "Fault" are never used as a cue.
 */
export async function discoverPiGoldenAlarmStateSets(
  request: PiGoldenAlarmStateSetDiscoveryRequest,
): Promise<PiGoldenAlarmStateSetDiscovery> {
  if (request.runtime !== 'grafana-gpa') {
    throw new PiGoldenRuntimeUnavailableError('A descoberta de Alarm State Set exige o runtime Grafana/GPA autenticado.');
  }
  const sets = await getPiDigitalStateSets(request.binding, request.dataSourceSrv);
  const structuralAlarmStateSets = sets.flatMap((set) => {
    const states = set.states.flatMap((state) => decodeAlarmState(state, set.states));
    return states.length > 0 ? [{
      name: set.name,
      ...(set.webId ? { webId: set.webId } : {}),
      states,
    }] : [];
  });
  return {
    source: 'pi-real',
    runtime: request.runtime,
    executionSource: 'pi-enumeration-set',
    context: {
      dataSourceUid: request.binding.dataSourceUid,
      dataSourceType: PI_DATASOURCE_TYPE,
      serverPath: request.binding.serverPath,
      resolution: 'binding',
    },
    structuralAlarmStateSets,
  };
}

/**
 * Finds PE candidates through the existing point search plus GET attributes.
 * The raw ExDesc and Location values are preserved; no schedule interval is
 * inferred from a scan class number or archived event cadence.
 */
export async function discoverPiGoldenPerformanceEquations(
  request: PiGoldenPerformanceEquationDiscoveryRequest,
): Promise<PiGoldenPerformanceEquationDiscovery> {
  if (request.runtime !== 'grafana-gpa') {
    throw new PiGoldenRuntimeUnavailableError('A descoberta de Performance Equations exige o runtime Grafana/GPA autenticado.');
  }
  const nameFilter = request.nameFilter.trim() || '*';
  if (!Number.isFinite(request.limit) || request.limit < 1) {
    throw new PiGoldenRuntimeUnavailableError('O limite da página PE deve ser um número positivo.');
  }
  const limit = Math.min(100, Math.max(1, Math.floor(request.limit)));
  const startIndex = Math.max(0, Math.floor(request.startIndex ?? 0));
  const page = await searchPiPointsWithStatus({ term: nameFilter, limit, startIndex }, request.dataSourceSrv);
  const candidates = (await Promise.all(page.results.map(async (point) => {
    const binding = createPiPointBinding(point);
    if (!binding?.webId) return undefined;
    const attributes = await getPiPerformanceEquationPointAttributes(binding, request.dataSourceSrv);
    return classifyPiPerformanceEquation(attributes);
  }))).filter((candidate): candidate is PiGoldenPerformanceEquationCandidate => candidate !== undefined)
    .sort(comparePerformanceEquationCandidates);
  return {
    source: 'pi-real',
    runtime: request.runtime,
    executionSource: 'pi-point-attributes',
    nameFilter,
    startIndex,
    limit,
    hasMore: page.hasMore,
    candidates,
  };
}

export function normalizePiGoldenTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new PiGoldenRuntimeUnavailableError('Evaluation timestamp deve ser um timestamp ISO válido.');
  }
  return new Date(trimmed).toISOString();
}

function timestampsRepresentSameInstant(requested: string, received?: string): boolean {
  return Boolean(received) && Date.parse(received as string) === Date.parse(requested);
}

/** Completes a capture only after the plugin result and post-scan state exist. */
export function createPiGoldenObservation(
  capture: PiGoldenRuntimeCapture,
  pluginActual: PiGoldenOutcome,
  stateAfter: unknown,
): PiGoldenObservation {
  if (!Number.isFinite(Date.parse(capture.timestamp))) {
    throw new PiGoldenRuntimeUnavailableError('A fixture golden exige timestamp de avaliação ISO válido.');
  }
  return {
    source: capture.source,
    functionName: capture.functionName,
    expression: capture.expression,
    schedule: capture.schedule,
    scanId: capture.scanId,
    timestamp: capture.timestamp,
    input: capture.input,
    runflag: capture.runflag,
    stateBefore: capture.stateBefore,
    piExpected: capture.piExpected,
    pluginActual,
    stateAfter,
  };
}

function normalizePiResult(result: PiCalculationResult): PiGoldenOutcome {
  if ('kind' in result) return result;
  const quality = Object.fromEntries(
    [['Good', result.good], ['Questionable', result.questionable], ['Substituted', result.substituted], ['Annotated', result.annotated]]
      .filter(([, value]) => value !== undefined),
  );
  const digitalState = typeof result.value === 'object'
    ? (typeof result.value.value === 'number'
      ? { name: result.value.name, code: result.value.value, ...(result.value.isSystem !== undefined ? { isSystem: result.value.isSystem } : {}) }
      : undefined)
    : undefined;
  return {
    kind: 'value',
    value: typeof result.value === 'object' ? result.value.name : result.value,
    timestamp: result.timestamp,
    ...(Object.keys(quality).length > 0 ? { quality } : {}),
    ...(digitalState ? { digitalState } : {}),
  };
}

function hasQualityEvidence(point: PiRecordedRawPoint): boolean {
  return point.quality?.good === false
    || point.quality?.questionable === true
    || point.quality?.substituted === true
    || point.quality?.annotated === true;
}

function toQualityEvidencePoint(point: PiRecordedRawPoint): PiGoldenQualityEvidencePoint {
  return {
    timestamp: new Date(point.time).toISOString(),
    value: normalizeQualityEvidenceValue(point.value),
    ...(point.quality ? { quality: point.quality } : {}),
    ...(point.recorded !== undefined ? { recorded: point.recorded } : {}),
    ...(point.origin ? { origin: point.origin } : {}),
  };
}

function normalizeQualityEvidenceValue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const name = record.Name ?? record.name;
  const code = record.Value ?? record.value;
  const isSystem = record.IsSystem ?? record.isSystem;
  if (typeof name === 'string' || typeof code === 'number' || typeof isSystem === 'boolean') {
    return {
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof code === 'number' ? { code } : {}),
      ...(typeof isSystem === 'boolean' ? { isSystem } : {}),
    };
  }
  return '[non-scalar PI value]';
}

function decodeAlarmState(
  state: PiDigitalState,
  states: readonly PiDigitalState[],
): Array<{ name: string; code: number; decoded: PiAlarmStateInfo }> {
  if (typeof state.value !== 'number') return [];
  try {
    return [{ name: state.name, code: state.value, decoded: decodePiAlarmState(states, { value: state.value }) }];
  } catch {
    return [];
  }
}

function classifyPiPerformanceEquation(attributes: Awaited<ReturnType<typeof getPiPerformanceEquationPointAttributes>>): PiGoldenPerformanceEquationCandidate {
  const exDesc = attributes.exDesc;
  const event = typeof exDesc === 'string' ? parsePeEventExpression(exDesc) : undefined;
  const calculationExpression = event?.calculationExpression ?? exDesc;
  const detectedFunctions = typeof calculationExpression === 'string'
    ? findPeTargetFunctions(calculationExpression)
    : [];
  const hasStructuralExpression = typeof exDesc === 'string' && detectedFunctions.length > 0;
  const scheduleType = event ? 'event' : hasStructuralExpression ? 'clock' : 'unknown';
  return {
    outputPoint: attributes.name,
    webId: attributes.webId,
    ...(attributes.pointSource !== undefined ? { pointSource: attributes.pointSource } : {}),
    ...(exDesc !== undefined ? { exDesc } : {}),
    scheduleType,
    ...(event ? { triggerTag: event.triggerTag, calculationExpression: event.calculationExpression } : hasStructuralExpression && typeof exDesc === 'string' ? { calculationExpression: exDesc } : {}),
    ...(attributes.location1 !== undefined ? { location1: attributes.location1 } : {}),
    ...(attributes.location3 !== undefined ? { location3: attributes.location3 } : {}),
    ...(attributes.location4 !== undefined ? { location4: attributes.location4 } : {}),
    ...(attributes.scan !== undefined ? { scan: attributes.scan } : {}),
    ...(attributes.shutdown !== undefined ? { shutdown: attributes.shutdown } : {}),
    ...(attributes.pointClass !== undefined ? { pointClass: attributes.pointClass } : {}),
    ...(attributes.pointType !== undefined ? { pointType: attributes.pointType } : {}),
    detectedFunctions,
    classification: hasStructuralExpression ? (event ? 'LIKELY_PE_EVENT' : 'LIKELY_PE_CLOCK') : exDesc === undefined ? 'UNKNOWN' : 'NOT_PE',
  };
}

function findPeTargetFunctions(expression: string): PiGoldenFunction[] {
  const names = ['Delay', 'NoOutput', 'Arma', 'Impulse', 'MedianFilt'] as const;
  const matches: PiGoldenFunction[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (char === '\'' || char === '"') {
      index = skipPiQuotedText(expression, index);
      continue;
    }
    const name = names.find((candidate) => expression.slice(index, index + candidate.length).toLocaleUpperCase() === candidate.toLocaleUpperCase()
      && !/[A-Za-z0-9_]/.test(expression[index - 1] ?? '')
      && !/[A-Za-z0-9_]/.test(expression[index + candidate.length] ?? ''));
    if (!name) { index += 1; continue; }
    let open = index + name.length;
    while (/\s/.test(expression[open] ?? '')) open += 1;
    if (expression[open] === '(') matches.push(name);
    index = open + 1;
  }
  return matches;
}

function parsePeEventExpression(exDesc: string): { triggerTag: string; calculationExpression: string } | undefined {
  const prefix = /^\s*event\s*=\s*/i.exec(exDesc);
  if (!prefix) return undefined;
  const comma = findFirstUnquotedComma(exDesc, prefix[0].length);
  if (comma === undefined) return undefined;
  const triggerTag = exDesc.slice(prefix[0].length, comma).trim();
  const calculationExpression = exDesc.slice(comma + 1).trim();
  return triggerTag && calculationExpression ? { triggerTag, calculationExpression } : undefined;
}

function findFirstUnquotedComma(value: string, from: number): number | undefined {
  let quote: string | undefined;
  for (let index = from; index < value.length; index += 1) {
    if (quote) {
      if (value[index] === '\\') { index += 1; continue; }
      if (value[index] === quote) quote = undefined;
      continue;
    }
    if (value[index] === '\'' || value[index] === '"') quote = value[index];
    else if (value[index] === ',') return index;
  }
  return undefined;
}

function skipPiQuotedText(value: string, start: number): number {
  const quote = value[start];
  let index = start + 1;
  while (index < value.length) {
    if (value[index] === '\\') index += 2;
    else if (value[index] === quote) return index + 1;
    else index += 1;
  }
  return value.length;
}

function comparePerformanceEquationCandidates(left: PiGoldenPerformanceEquationCandidate, right: PiGoldenPerformanceEquationCandidate): number {
  const rank = (candidate: PiGoldenPerformanceEquationCandidate) => {
    const functionName = candidate.detectedFunctions[0];
    return functionName === 'Delay' ? 0 : functionName === 'NoOutput' ? 1 : functionName === 'Arma' ? 2 : functionName === 'Impulse' ? 3 : functionName === 'MedianFilt' ? 4 : 5;
  };
  return rank(left) - rank(right) || left.outputPoint.localeCompare(right.outputPoint);
}

function classifyError(error: unknown): Extract<PiGoldenOutcome, { kind: 'error' }>['code'] {
  if (error instanceof PiCalculationNoMatchError) return 'NO_MATCH';
  const status = statusOf(error);
  if (status === 401 || status === 403) return 'PERMISSION_ERROR';
  if (status !== undefined && status >= 400) return 'HTTP_ERROR';
  if (error instanceof PiCalculationUnavailableError) return 'PI_ERROR';
  const message = errorMessage(error).toLocaleLowerCase();
  if (/invalid|inválid|expression|expressão/.test(message)) return 'INVALID_EXPRESSION';
  if (/no data|sem dados/.test(message)) return 'NO_DATA';
  if (/bad|quality/.test(message)) return 'BAD';
  if (/calc failed|calculation failed/.test(message) || error instanceof PiCalculationExecutionError) return 'CALC_FAILED';
  return 'PI_ERROR';
}

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
  const message = [record.message, record.statusText, record.Errors, record.errors]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return message ?? 'Erro não detalhado retornado pelo PI runtime.';
}
