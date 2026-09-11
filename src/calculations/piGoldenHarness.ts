import type { PeCalculationSchedule } from './peSchedulerRuntime';

export type PiGoldenFunction =
  | 'Sqr' | 'TagVal' | 'Hour'
  | 'Delay' | 'Arma' | 'Impulse' | 'MedianFilt' | 'NoOutput'
  | 'AlmAckStat' | 'AlmCondition' | 'AlmCondText' | 'AlmPriority'
  | 'BadVal' | 'TagBad' | 'IsSet';

export type PiGoldenOutcome =
  | { kind: 'value'; value: number | string; timestamp?: string; quality?: Record<string, unknown>; digitalState?: { name: string; code: number; isSystem?: boolean } }
  | { kind: 'error'; code: 'NO_MATCH' | 'NO_DATA' | 'BAD' | 'CALC_FAILED' | 'PI_ERROR' | 'HTTP_ERROR' | 'PERMISSION_ERROR' | 'INVALID_EXPRESSION' | 'SCHEDULER_CONTEXT_REQUIRED'; message?: string }
  | { kind: 'no-output' };

/** A capture is valid as a golden only when it was observed through Grafana/GPA against PI. */
export interface PiGoldenObservation {
  source: 'pi-real' | 'mock' | 'unknown';
  functionName: PiGoldenFunction;
  expression: string;
  schedule?: PeCalculationSchedule;
  scanId: string;
  timestamp: string;
  input: unknown;
  runflag?: number;
  stateBefore: unknown;
  piExpected: PiGoldenOutcome;
  pluginActual: PiGoldenOutcome;
  stateAfter: unknown;
}

export interface PiGoldenComparison {
  match: boolean;
  mismatches: string[];
}

/**
 * Compares observable PE behavior only. It deliberately does not coerce values,
 * timestamps, quality, Digital State codes, error categories, or NoOutput.
 */
export function comparePiGolden(observation: PiGoldenObservation): PiGoldenComparison {
  validateObservation(observation);
  const mismatches: string[] = [];
  const expected = observation.piExpected;
  const actual = observation.pluginActual;
  if (expected.kind !== actual.kind) {
    mismatches.push(`kind: PI=${expected.kind} plugin=${actual.kind}`);
    return { match: false, mismatches };
  }
  if (expected.kind === 'no-output' && actual.kind === 'no-output') return { match: true, mismatches };
  if (expected.kind === 'error' && actual.kind === 'error') {
    compareField(mismatches, 'error.code', expected.code, actual.code);
    compareField(mismatches, 'error.message', expected.message, actual.message);
    return { match: mismatches.length === 0, mismatches };
  }
  if (expected.kind === 'value' && actual.kind === 'value') {
    compareField(mismatches, 'value', expected.value, actual.value);
    compareField(mismatches, 'timestamp', expected.timestamp, actual.timestamp);
    compareField(mismatches, 'quality', expected.quality, actual.quality);
    compareField(mismatches, 'digitalState', expected.digitalState, actual.digitalState);
  }
  return { match: mismatches.length === 0, mismatches };
}

export function assertPiGoldenMatch(observation: PiGoldenObservation): void {
  const comparison = comparePiGolden(observation);
  if (!comparison.match) {
    throw new Error(`Golden PI divergente para ${observation.functionName} em ${observation.scanId}: ${comparison.mismatches.join('; ')}`);
  }
}

function validateObservation(observation: PiGoldenObservation): void {
  if (observation.source !== 'pi-real') throw new Error('Golden exige captura pi-real via Grafana/GPA.');
  if (!observation.scanId.trim()) throw new Error('Golden exige scanId.');
  if (!Number.isFinite(Date.parse(observation.timestamp))) throw new Error('Golden exige timestamp ISO válido.');
  if (observation.runflag !== undefined && !Number.isFinite(observation.runflag)) throw new Error('Golden possui runflag inválido.');
}

function compareField(mismatches: string[], field: string, expected: unknown, actual: unknown): void {
  if (sameValue(expected, actual)) return;
  mismatches.push(`${field}: PI=${render(expected)} plugin=${render(actual)}`);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]));
}

function render(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value) ?? 'undefined';
}
