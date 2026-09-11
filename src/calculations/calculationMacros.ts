import type { PiHistoricalValue, PiTrendSeries } from '../pi/piDataSource';

export const temporalStateCache = new Map<string, Map<string, any>>();

export function updateTemporalCache(calcId: string, token: string, piPointValue: any) {
  const ts = piPointValue && typeof piPointValue === 'object' && piPointValue.timestamp ? Math.floor(Date.parse(piPointValue.timestamp)/1000) : Math.floor(Date.now()/1000);
  const rawValue = piPointValue && typeof piPointValue === 'object' && 'value' in piPointValue ? piPointValue.value : piPointValue;
  const numValue = Number(rawValue);

  let calcCache = temporalStateCache.get(calcId);
  if (!calcCache) {
    calcCache = new Map();
    temporalStateCache.set(calcId, calcCache);
  }
  let state = calcCache.get(token);
  if (!state) {
    state = { 
      lastValue: numValue, lastTimestamp: ts, 
      prevValue: numValue, prevTimestamp: ts, 
      changeCount: 0,
      integral: 0,
      timeInState: {} as Record<string, number>
    };
    const rawState = typeof rawValue === 'number' ? getDigitalStateName(rawValue) ?? String(rawValue) : String(rawValue);
    state.timeInState[rawState] = 0;
    calcCache.set(token, state);
  } else {
    // Only update if time advanced
    if (ts > state.lastTimestamp) {
      const dt = ts - state.lastTimestamp;
      
      const prevStateName = typeof state.lastValue === 'number' ? getDigitalStateName(state.lastValue) ?? String(state.lastValue) : String(state.lastValue);
      state.timeInState[prevStateName] = (state.timeInState[prevStateName] || 0) + dt;
      
      if (Number.isFinite(state.lastValue) && Number.isFinite(numValue)) {
         state.integral += ((state.lastValue + numValue) / 2) * dt;
      }

      if (numValue !== state.lastValue) {
        state.changeCount++;
        state.prevValue = state.lastValue;
        state.prevTimestamp = state.lastTimestamp;
      }
      state.lastValue = numValue;
      state.lastTimestamp = ts;
    } else if (ts === state.lastTimestamp && numValue !== state.lastValue) {
      state.changeCount++;
      state.prevValue = state.lastValue;
      state.prevTimestamp = state.lastTimestamp;
      state.lastValue = numValue;
    }
  }
  return state;
}

export function getDigitalStateName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const candidate of [record.Name, record.name, record.Text, record.text, record.State, record.state]) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

function getQualityFlag(piPointValue: unknown, flag: string): unknown {
  if (!piPointValue || typeof piPointValue !== 'object') return undefined;
  const record = piPointValue as Record<string, unknown>;
  const quality = record.quality && typeof record.quality === 'object'
    ? record.quality as Record<string, unknown>
    : undefined;
  for (const source of [record, quality]) {
    if (!source) continue;
    const key = Object.keys(source).find((candidate) => candidate.toLocaleLowerCase() === flag.toLocaleLowerCase());
    if (key) return source[key];
  }
  return undefined;
}

function isBadPiPointValue(piPointValue: unknown): boolean {
  const explicitGood = getQualityFlag(piPointValue, 'good');
  if (explicitGood !== undefined) return explicitGood === false;
  if (piPointValue === undefined || piPointValue === null) return true;
  const rawValue = piPointValue && typeof piPointValue === 'object' && 'value' in piPointValue
    ? (piPointValue as { value?: unknown }).value
    : piPointValue;
  if (typeof rawValue === 'string' && /^(shutdown|i\/o timeout|pt created|no data|bad|configuration failed)$/i.test(rawValue.trim())) {
    return true;
  }
  return rawValue === undefined || rawValue === null || (typeof rawValue === 'number' && !Number.isFinite(rawValue));
}

export function applyQualityMacros(expression: string, token: string, piPointValue: any): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = `(?:')?${escaped}(?:')?`;
  
  const isBadRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_BAD\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isBadRegex, () => {
    return isBadPiPointValue(piPointValue) ? '1' : '0';
  });

  const badValRegex = new RegExp(`(?<![A-Za-z0-9_.:])BADVAL\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(badValRegex, () => isBadPiPointValue(piPointValue) ? '1' : '0');

  const tagBadRegex = new RegExp(`(?<![A-Za-z0-9_.:])TAGBAD\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(tagBadRegex, () => {
    throw new Error(`TagBad exige avaliação pelo PI Calculation Controller para determinar o estado anormal de "${token}".`);
  });

  const isSetRegex = new RegExp(`(?<![A-Za-z0-9_.:])ISSET\\s*\\(\\s*${tokenPattern}\\s*,\\s*(["'])(.*?)\\1\\s*\\)`, 'gi');
  expression = expression.replace(isSetRegex, (_match, _quote, selector: string) => {
    const normalizedSelector = selector.trim().toLocaleLowerCase().charAt(0);
    if (!['a', 's', 'q'].includes(normalizedSelector)) {
      throw new Error('IsSet aceita os seletores "a" (Annotated), "s" (Substituted) ou "q" (Questionable).');
    }
    const flag = normalizedSelector === 'a' ? 'annotated' : normalizedSelector === 's' ? 'substituted' : 'questionable';
    const available = getQualityFlag(piPointValue, flag);
    if (available === undefined && piPointValue && typeof piPointValue === 'object') {
      throw new Error(`IsSet: flag ${flag} não disponível para "${token}".`);
    }
    return available === true ? '1' : '0';
  });

  const isGoodRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_GOOD\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isGoodRegex, () => {
    return isBadPiPointValue(piPointValue) ? '0' : '1';
  });

  const isNoDataRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_NO_DATA\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isNoDataRegex, () => {
    const noData = piPointValue === undefined || piPointValue === null || (typeof piPointValue === 'object' && (!('value' in piPointValue) || piPointValue.value === undefined || piPointValue.value === null));
    return noData ? '1' : '0';
  });

  const isSubRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_SUBSTITUTED\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isSubRegex, () => {
    const isSub = getQualityFlag(piPointValue, 'substituted') === true;
    return isSub ? '1' : '0';
  });

  const isQuestRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_QUESTIONABLE\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isQuestRegex, () => {
    const isQuest = getQualityFlag(piPointValue, 'questionable') === true;
    return isQuest ? '1' : '0';
  });
  
  const qualityRegex = new RegExp(`(?<![A-Za-z0-9_.:])QUALITY\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(qualityRegex, () => {
    if (!piPointValue || typeof piPointValue !== 'object') return '"Good"';
    if (getQualityFlag(piPointValue, 'substituted') === true) return '"Substituted"';
    if (getQualityFlag(piPointValue, 'questionable') === true) return '"Questionable"';
    if (isBadPiPointValue(piPointValue)) return '"Bad"';
    return '"Good"';
  });
  
  const statusCodeRegex = new RegExp(`(?<![A-Za-z0-9_.:])STATUS_CODE\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(statusCodeRegex, () => {
    const status = piPointValue && typeof piPointValue === 'object' && piPointValue.quality && piPointValue.quality.status;
    if (typeof status === 'boolean') return status ? '1' : '0';
    if (typeof status === 'string') return `"${status}"`;
    return String(status ?? 0);
  });

  const tsRegex = new RegExp(`(?<![A-Za-z0-9_.:])TIMESTAMP\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(tsRegex, () => {
    if (piPointValue && typeof piPointValue === 'object' && piPointValue.timestamp) {
       return `__PE_TIMESTAMP(${Math.floor(Date.parse(piPointValue.timestamp) / 1000)})`;
    }
    return `__PE_TIMESTAMP(${Math.floor(Date.now() / 1000)})`;
  });

  const isStateRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_STATE\\s*\\(\\s*${tokenPattern}\\s*,\\s*(["'])(.*?)\\1\\s*\\)`, 'gi');
  expression = expression.replace(isStateRegex, (_match, _quote, expected) => {
    const rawValue = piPointValue && typeof piPointValue === 'object' && 'value' in piPointValue ? piPointValue.value : piPointValue;
    const actual = getDigitalStateName(rawValue);
    const equals = actual !== undefined && actual.localeCompare(expected.trim(), undefined, { sensitivity: 'accent' }) === 0;
    return equals ? '1' : '0';
  });
  
  // DIGITAL_STATE, DIGITAL_VALUE, STATUS -> replace with token to be evaluated by variables in engine
  const identityRegex = new RegExp(`(?<![A-Za-z0-9_.:])(?:DIGITAL_STATE|DIGITAL_VALUE|STATUS)\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(identityRegex, `'${token}'`);

  const coalesceRegex = new RegExp(`(?<![A-Za-z0-9_.:])(?:COALESCE|REPLACE_BAD)\\s*\\(\\s*${tokenPattern}\\s*,\\s*(.+?)\\s*\\)`, 'gi');
  expression = expression.replace(coalesceRegex, (_match, defaultVal) => {
    return isBadPiPointValue(piPointValue) ? defaultVal : `'${token}'`;
  });

  const filterBadRegex = new RegExp(`(?<![A-Za-z0-9_.:])FILTER_BAD\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(filterBadRegex, () => {
    return isBadPiPointValue(piPointValue) ? 'NaN' : `'${token}'`;
  });

  const lastValueRegex = new RegExp(`(?<![A-Za-z0-9_.:])LAST_VALUE\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(lastValueRegex, `'${token}'`);

  const lastTsRegex = new RegExp(`(?<![A-Za-z0-9_.:])LAST_TIMESTAMP\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(lastTsRegex, () => {
    if (piPointValue && typeof piPointValue === 'object' && piPointValue.timestamp) {
       return `__PE_TIMESTAMP(${Math.floor(Date.parse(piPointValue.timestamp) / 1000)})`;
    }
    return `__PE_TIMESTAMP(${Math.floor(Date.now() / 1000)})`;
  });

  return expression;
}

export function applyTemporalMacros(expression: string, token: string, state: any): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = `(?:')?${escaped}(?:')?`;

  expression = expression.replace(new RegExp(`(?<![A-Za-z0-9_.:])PREV\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi'), () => String(state.prevValue ?? 0));
  expression = expression.replace(new RegExp(`(?<![A-Za-z0-9_.:])DELTA\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi'), () => String((state.lastValue ?? 0) - (state.prevValue ?? 0)));
  expression = expression.replace(new RegExp(`(?<![A-Za-z0-9_.:])(?:RATE|DERIVATIVE)\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi'), () => {
    const dt = Math.max(1, (state.lastTimestamp ?? 0) - (state.prevTimestamp ?? 0));
    return String(((state.lastValue ?? 0) - (state.prevValue ?? 0)) / dt);
  });
  expression = expression.replace(new RegExp(`(?<![A-Za-z0-9_.:])(?:CHANGE_COUNT|COUNT_CHANGE)\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi'), () => String(state.changeCount));
  expression = expression.replace(new RegExp(`(?<![A-Za-z0-9_.:])TIME_SINCE_CHANGE\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi'), () => {
    const now = Math.floor(Date.now() / 1000);
    const changeTs = state.changeCount > 0 ? state.prevTimestamp : state.lastTimestamp;
    return String(Math.max(0, now - (changeTs ?? now)));
  });
  expression = expression.replace(new RegExp(`(?<![A-Za-z0-9_.:])(?:INTEGRAL|TOTAL)\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi'), () => String(state.integral ?? 0));
  
  const timeInStateRegex = new RegExp(`(?<![A-Za-z0-9_.:])TIME_IN_STATE\\s*\\(\\s*${tokenPattern}\\s*,\\s*(["'])(.*?)\\1\\s*\\)`, 'gi');
  expression = expression.replace(timeInStateRegex, (_match, _quote, expected) => {
    return String(state.timeInState?.[expected.trim()] ?? 0);
  });

  return expression;
}

import type { PiPointBinding } from '../pi/piPointBinding';
import { decodePiAlarmState, getPiDigitalStateSets, getPiPointDigitalStates, getPiPointMetadata, type PiDigitalState, type PiPointMetadata } from '../pi/piDataSource';

export const globalHistoricalResultCache = new Map<string, {value?: number | string, error?: Error, timestamp: number}>();
export const globalHistoricalPromiseLock = new Map<string, Promise<void>>();
export const globalMetadataResultCache = new Map<string, { metadata?: PiPointMetadata; error?: Error }>();
export const globalMetadataPromiseLock = new Map<string, Promise<void>>();
export const globalDigitalStateResultCache = new Map<string, { states?: PiDigitalState[]; error?: Error }>();
export const globalDigitalStatePromiseLock = new Map<string, Promise<void>>();

type HistoricalRequestPlan = {
  normalHistory: boolean;
  rawRecorded: boolean;
  boundary: boolean;
  quality: boolean;
  recordedOrigin: boolean;
  step: boolean;
  interpolatedValue: boolean;
  previousEvent: boolean;
  nextEvent: boolean;
};

const HISTORICAL_REQUEST_PLANS: Record<string, HistoricalRequestPlan> = {
  TAGAVG: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TAGTOT: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TIMEEQ: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TIMENE: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TIMEGT: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TIMEGE: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TIMELT: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TIMELE: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: false, previousEvent: false, nextEvent: false },
  FINDEQ: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: true, previousEvent: false, nextEvent: false },
  FINDNE: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: true, previousEvent: false, nextEvent: false },
  FINDGT: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: true, previousEvent: false, nextEvent: false },
  FINDGE: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: true, previousEvent: false, nextEvent: false },
  FINDLT: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: true, previousEvent: false, nextEvent: false },
  FINDLE: { normalHistory: true, rawRecorded: false, boundary: true, quality: true, recordedOrigin: false, step: true, interpolatedValue: true, previousEvent: false, nextEvent: false },
  EVENTCOUNT: { normalHistory: true, rawRecorded: false, boundary: false, quality: true, recordedOrigin: true, step: false, interpolatedValue: false, previousEvent: false, nextEvent: false },
  TAGVAL: { normalHistory: true, rawRecorded: false, boundary: false, quality: true, recordedOrigin: false, step: false, interpolatedValue: true, previousEvent: false, nextEvent: false },
  VALUEATTIME: { normalHistory: true, rawRecorded: false, boundary: false, quality: true, recordedOrigin: false, step: false, interpolatedValue: true, previousEvent: false, nextEvent: false },
  PREVVAL: { normalHistory: true, rawRecorded: false, boundary: false, quality: true, recordedOrigin: false, step: false, interpolatedValue: false, previousEvent: true, nextEvent: false },
  NEXTVAL: { normalHistory: true, rawRecorded: false, boundary: false, quality: true, recordedOrigin: false, step: false, interpolatedValue: false, previousEvent: false, nextEvent: true },
};

function getHistoricalRequestPlan(functionName: string): HistoricalRequestPlan {
  return HISTORICAL_REQUEST_PLANS[functionName.toUpperCase()] ?? {
    normalHistory: true, rawRecorded: false, boundary: false, quality: true,
    recordedOrigin: false, step: false, interpolatedValue: false,
    previousEvent: false, nextEvent: false,
  };
}

function serializeHistoricalValue(functionName: string, value: number | string | undefined, typedResult: boolean): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  const numeric = String(value);
  if (!typedResult) return numeric;
  const normalized = functionName.toUpperCase();
  if (['FINDEQ', 'FINDNE', 'FINDGT', 'FINDGE', 'FINDLT', 'FINDLE', 'PREVEVENT', 'NEXTEVENT'].includes(normalized)) return `__PE_TIMESTAMP(${numeric})`;
  if (['TIMEEQ', 'TIMENE', 'TIMEGT', 'TIMEGE', 'TIMELT', 'TIMELE'].includes(normalized)) return `__PE_TIMESPAN(${numeric})`;
  return numeric;
}

export function hasPendingHistoricalRequests(): boolean {
  return globalHistoricalPromiseLock.size > 0;
}

export async function waitForPendingHistoricalRequests(): Promise<void> {
  const pending = [...globalHistoricalPromiseLock.values()];
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
}

export function hasPendingMetadataRequests(): boolean {
  return globalMetadataPromiseLock.size > 0;
}

export async function waitForPendingMetadataRequests(): Promise<void> {
  const pending = [...globalMetadataPromiseLock.values()];
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
}

export function hasPendingDigitalStateRequests(): boolean {
  return globalDigitalStatePromiseLock.size > 0;
}

export async function waitForPendingDigitalStateRequests(): Promise<void> {
  const pending = [...globalDigitalStatePromiseLock.values()];
  if (pending.length > 0) await Promise.allSettled(pending);
}

function metadataKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function quoteMetadataValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function metadataProperty(functionName: string, metadata: PiPointMetadata): string | number | undefined {
  switch (functionName.toUpperCase()) {
    case 'TAGDESC': return metadata.description;
    case 'TAGEU': return metadata.engineeringUnit;
    case 'TAGEXDESC': return metadata.extendedDescriptor;
    case 'TAGNAME': return metadata.name;
    case 'TAGSOURCE': return metadata.pointSource;
    case 'TAGSPAN': return metadata.span === undefined ? undefined : String(metadata.span);
    case 'TAGZERO': return metadata.zero === undefined ? undefined : String(metadata.zero);
    case 'TAGTYPE': return metadata.pointType;
    case 'TAGTYPVAL': return metadata.typicalValue;
    case 'TAGNUM': return metadata.pointId;
    default: return undefined;
  }
}

/** Resolves the confirmed PI Point metadata functions without making the engine async. */
export function applyMetadataMacros(
  expression: string,
  token: string,
  binding: PiPointBinding,
): string {
  const funcNames = 'TagDesc|TagEU|TagExDesc|TagName|TagNum|TagSource|TagSpan|TagType|TagTypVal|TagZero';
  const metadataRegex = new RegExp(`(?<![A-Za-z0-9_.:])(${funcNames})\\s*\\((.*?)\\)`, 'gis');
  return expression.replace(metadataRegex, (match, funcName: string, argsStr: string) => {
    const parsedArgs = parseHistoricalArguments(argsStr);
    if (parsedArgs.length !== 1 || parsedArgs[0].type !== 'PiPointReference') return match;
    if (parsedArgs[0].value.toLocaleUpperCase() !== token.toLocaleUpperCase()) return match;

    const key = metadataKey(binding);
    const cached = globalMetadataResultCache.get(key);
    if (cached?.error) throw cached.error;
    if (!cached?.metadata) {
      if (!globalMetadataPromiseLock.has(key)) {
        const request = getPiPointMetadata(binding)
          .then((metadata) => {
            globalMetadataResultCache.set(key, { metadata });
          })
          .catch((error) => {
            globalMetadataResultCache.set(key, { error: error instanceof Error ? error : new Error(String(error)) });
          })
          .finally(() => globalMetadataPromiseLock.delete(key));
        globalMetadataPromiseLock.set(key, request);
      }
      throw new Error('FETCHING_METADATA');
    }

    const value = metadataProperty(funcName, cached.metadata);
    if (value === undefined) {
      throw new Error(funcName.toUpperCase() === 'TAGNUM'
        ? 'TagNum: PointID não disponível para este PI Point/datasource.'
        : `${funcName}: metadado não disponível para o PI Point "${token}".`);
    }
    if (typeof value === 'number' || funcName.toUpperCase() === 'TAGSPAN' || funcName.toUpperCase() === 'TAGZERO' || funcName.toUpperCase() === 'TAGTYPVAL' && cached.metadata.pointType?.toLocaleLowerCase() !== 'digital') return String(value);
    return quoteMetadataValue(value);
  });
}

function digitalStateKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function resolveDigitalState(states: readonly PiDigitalState[], value: unknown): PiDigitalState | undefined {
  const text = String(value).trim();
  return states.find((state) => state.name.trim().toLocaleLowerCase() === text.toLocaleLowerCase()
    || state.value !== undefined && String(state.value) === text);
}

function quoteDigitalState(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function serializeDigitalState(state: PiDigitalState): string {
  const code = Number(state.value);
  if (!Number.isFinite(code)) throw new Error(`Estado digital "${state.name}" não possui código numérico PI.`);
  const setWebId = state.setWebId ? `, ${quoteDigitalState(state.setWebId)}` : '';
  const setName = state.setName ? `, ${quoteDigitalState(state.setName)}` : '';
  return `__PE_DIGITAL_STATE(${quoteDigitalState(state.name)}, ${code}${setWebId}${setName})`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolves Digital State Set functions without turning the Calculation Engine asynchronous. */
export function applyDigitalStateMacros(
  expression: string,
  token: string,
  binding: PiPointBinding,
  piPointValue: unknown,
): string {
  const escapedToken = escapeRegex(token);
  const pointPattern = `(?:'${escapedToken}'|${escapedToken})`;
  const key = digitalStateKey(binding);
  const getStates = (): readonly PiDigitalState[] => {
    const cached = globalDigitalStateResultCache.get(key);
    if (cached?.error) throw cached.error;
    if (cached?.states) return cached.states;
    if (!globalDigitalStatePromiseLock.has(key)) {
      const request = getPiPointDigitalStates(binding)
        .then((result) => {
          if (!result.isDigital) throw new Error(`PI Point "${token}" não é digital.`);
          globalDigitalStateResultCache.set(key, { states: result.states });
        })
        .catch((error) => {
          globalDigitalStateResultCache.set(key, { error: error instanceof Error ? error : new Error(String(error)) });
        })
        .finally(() => globalDigitalStatePromiseLock.delete(key));
      globalDigitalStatePromiseLock.set(key, request);
    }
    throw new Error('FETCHING_DIGITAL_STATES');
  };

  const getGlobalStates = (): readonly PiDigitalState[] => {
    const globalKey = `global\u0000${binding.dataSourceUid}\u0000${binding.serverPath}`;
    const cached = globalDigitalStateResultCache.get(globalKey);
    if (cached?.error) throw cached.error;
    if (cached?.states) return cached.states;
    if (!globalDigitalStatePromiseLock.has(globalKey)) {
      const request = getPiDigitalStateSets(binding)
        .then((sets) => {
          globalDigitalStateResultCache.set(globalKey, { states: sets.flatMap((set) => set.states) });
        })
        .catch((error) => {
          globalDigitalStateResultCache.set(globalKey, { error: error instanceof Error ? error : new Error(String(error)) });
        })
        .finally(() => globalDigitalStatePromiseLock.delete(globalKey));
      globalDigitalStatePromiseLock.set(globalKey, request);
    }
    throw new Error('FETCHING_DIGITAL_STATES');
  };

  const digStateRegex = new RegExp(`(?<![A-Za-z0-9_.:])DigState\\s*\\(\\s*("[^"]*")\\s*,\\s*${pointPattern}\\s*\\)`, 'gi');
  expression = expression.replace(digStateRegex, (_match, literal: string) => {
    const state = resolveDigitalState(getStates(), literal.slice(1, -1));
    if (!state) throw new Error(`DigState: estado "${literal.slice(1, -1)}" não existe no Digital State Set de "${token}".`);
    return serializeDigitalState(state);
  });

  const globalDigStateRegex = new RegExp(`(?<![A-Za-z0-9_.:])DigState\\s*\\(\\s*("[^"]*")\\s*\\)`, 'gi');
  expression = expression.replace(globalDigStateRegex, (_match, literal: string) => {
    const state = resolveDigitalState(getGlobalStates(), literal.slice(1, -1));
    if (!state) throw new Error(`DigState: estado "${literal.slice(1, -1)}" não existe nos Digital State Sets do PI Data Server.`);
    return serializeDigitalState(state);
  });

  const digTextRegex = new RegExp(`(?<![A-Za-z0-9_.:])DigText\\s*\\(\\s*${pointPattern}\\s*\\)`, 'gi');
  expression = expression.replace(digTextRegex, () => {
    const currentValue = (piPointValue as any)?.value ?? piPointValue;
    const state = resolveDigitalState(getStates(), currentValue)
      ?? getGlobalStates().find((candidate) => candidate.isSystem && resolveDigitalState([candidate], currentValue));
    if (!state) throw new Error(`DigText: valor atual não existe no Digital State Set de "${token}".`);
    return quoteDigitalState(state.name);
  });

  const stateNoRegex = /(?<![A-Za-z0-9_.:])StateNo\s*\(\s*((?:"[^"]*")|(?:'[^']*'))\s*\)/gi;
  expression = expression.replace(stateNoRegex, (match, literal: string) => {
    const requested = literal.slice(1, -1);
    if (!literal.startsWith("'") || requested.toLocaleUpperCase() !== token.toLocaleUpperCase()) return match;
    const state = resolveDigitalState(getStates(), (piPointValue as any)?.value ?? piPointValue);
    if (!state) throw new Error(`StateNo: valor atual de "${token}" não existe no Digital State Set.`);
    return `StateNo(${serializeDigitalState(state)})`;
  });

  return expression;
}

/** Resolves PE Alarm State functions from a structurally validated PI set. */
export function applyAlarmMacros(
  expression: string,
  token: string,
  binding: PiPointBinding,
  piPointValue: unknown,
): string {
  const escapedToken = escapeRegex(token);
  const pointPattern = `(?:'${escapedToken}'|${escapedToken})`;
  const alarmRegex = new RegExp(`(?<![A-Za-z0-9_.:])Alm(AckStat|Condition|CondText|Priority)\\s*\\(\\s*${pointPattern}\\s*\\)`, 'gi');
  if (!alarmRegex.test(expression)) return expression;
  const key = digitalStateKey(binding);
  const cached = globalDigitalStateResultCache.get(key);
  if (cached?.error) throw cached.error;
  if (!cached?.states) {
    if (!globalDigitalStatePromiseLock.has(key)) {
      const request = getPiPointDigitalStates(binding)
        .then((result) => {
          if (!result.isDigital) throw new Error(`PI Point "${token}" não é digital.`);
          globalDigitalStateResultCache.set(key, { states: result.states });
        })
        .catch((error) => {
          globalDigitalStateResultCache.set(key, { error: error instanceof Error ? error : new Error(String(error)) });
        })
        .finally(() => globalDigitalStatePromiseLock.delete(key));
      globalDigitalStatePromiseLock.set(key, request);
    }
    throw new Error('FETCHING_DIGITAL_STATES');
  }

  const info = decodePiAlarmState(cached.states, piPointValue);
  return expression.replace(alarmRegex, (_match, operation: string) => {
    switch (operation.toLocaleLowerCase()) {
      case 'ackstat': return String(info.acknowledgementStatus);
      case 'condition': return String(info.conditionCode);
      case 'priority': return String(info.priority);
      case 'condtext': return quoteDigitalState(info.conditionText);
      default: return _match;
    }
  });
}

export const PI_TIME_ABBREVIATIONS = new Set(['*', 't', 'y', 'today', 'yesterday', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

export function isPiTimeString(str: string): boolean {
  const lower = str.trim().toLocaleLowerCase();
  if (PI_TIME_ABBREVIATIONS.has(lower)) return true;
  if (/^(\*|t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)?[+-]\d+[smhdwy]$/.test(lower)) return true;
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(lower)) return true;
  if (/^\d{1,2}[-/][a-z]{3,9}[-/]\d{1,4}(?:\s+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(lower)) return true;
  return false;
}

export type ParsedArgument = 
  | { type: 'PiPointReference', value: string }
  | { type: 'TimeExpression', value: string }
  | { type: 'StringLiteral', value: string }
  | { type: 'NumberLiteral', value: number };

export function parseHistoricalArguments(argsStr: string): ParsedArgument[] {
  const args: ParsedArgument[] = [];
  let currentArg = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    if ((char === '"' || char === "'") && (i === 0 || argsStr[i - 1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
        currentArg += char;
      } else if (quoteChar === char) {
        inQuotes = false;
        currentArg += char;
      } else {
        currentArg += char;
      }
    } else if (char === ',' && !inQuotes) {
      args.push(classifyArgument(currentArg.trim()));
      currentArg = '';
    } else {
      currentArg += char;
    }
  }
  if (currentArg.trim() !== '') {
    args.push(classifyArgument(currentArg.trim()));
  }
  return args;
}

function classifyArgument(arg: string): ParsedArgument {
  const num = Number(arg);
  if (!isNaN(num) && arg !== '') return { type: 'NumberLiteral', value: num };
  if (arg.startsWith('"') && arg.endsWith('"')) return { type: 'StringLiteral', value: arg.slice(1, -1) };
  
  // If it's single quoted, or not quoted, we check if it is a Time Expression or PI Point
  const inner = (arg.startsWith("'") && arg.endsWith("'")) ? arg.slice(1, -1) : arg;
  if (isPiTimeString(inner)) return { type: 'TimeExpression', value: inner };
  
  return { type: 'PiPointReference', value: inner };
}

export function applyHistoricalMacros(
  expression: string, 
  token: string, 
  calcId: string, 
  binding: PiPointBinding, 
  now: number,
  typedResult = false,
): string {
  const funcNames = 'TimeEq|TimeNE|TimeGT|TimeGE|TimeLT|TimeLE|FindEq|FindNE|FindGT|FindGE|FindLT|FindLE|Average|Minimum|Maximum|Total|Count|TagAvg|TagMean|TagMin|TagMax|TagTot|EventCount|PctGood|StDev|Range|TagVal|ValueAtTime|PrevVal|NextVal|PrevEvent|NextEvent|Moving_Average|Moving_Min|Moving_Max|Moving_StdDev';
  const histRegex = new RegExp(`(?<![A-Za-z0-9_.:])(${funcNames})\\s*\\((.*?)\\)`, 'gis');
  
  expression = expression.replace(histRegex, (match, funcName, argsStr) => {
     const parsedArgs = parseHistoricalArguments(argsStr);
     if (parsedArgs.length === 0) return match;
     const firstArg = parsedArgs[0];
     
     // Validar que o primeiro argumento é uma referência a PI Point
     if (firstArg.type !== 'PiPointReference') return match;
     
     // Somente prosseguir se for a tag correspondente ao token atual iterado pelo motor
     if (firstArg.value.toLocaleUpperCase() !== token.toLocaleUpperCase()) return match;
     
     const fnUp = funcName.toUpperCase();
     // Range também é uma função escalar do plugin; só é histórica quando
     // recebe a assinatura PI (Tag, Start, End).
     if (fnUp === 'RANGE' && parsedArgs.length !== 3) return match;
     const isEventFunc = ['TIMEEQ', 'TIMENE', 'TIMEGT', 'TIMEGE', 'TIMELT', 'TIMELE'].includes(fnUp);
     const isFindFunc = ['FINDEQ', 'FINDNE', 'FINDGT', 'FINDGE', 'FINDLT', 'FINDLE'].includes(fnUp);
     
     let startStr = '';
     let endStr = '';
     let remainingArgs: (string | number)[] = [];
     
     if (isEventFunc || isFindFunc) {
       if (parsedArgs.length !== 4) throw new Error(`${funcName} exige 4 parâmetros (Tag, Start, End, Valor).`);
       if (parsedArgs[1].type !== 'TimeExpression' && parsedArgs[1].type !== 'StringLiteral') throw new Error(`Parâmetro Start inválido para ${funcName}.`);
       if (parsedArgs[2].type !== 'TimeExpression' && parsedArgs[2].type !== 'StringLiteral') throw new Error(`Parâmetro End inválido para ${funcName}.`);
       startStr = String(parsedArgs[1].value);
       endStr = String(parsedArgs[2].value);
       remainingArgs = [parsedArgs[3].value];
     } else if (['TAGVAL', 'VALUEATTIME', 'PREVVAL', 'NEXTVAL', 'PREVEVENT', 'NEXTEVENT'].includes(fnUp)) {
       const requiresTime = ['PREVEVENT', 'NEXTEVENT'].includes(fnUp);
       if (requiresTime ? parsedArgs.length !== 2 : parsedArgs.length !== 1 && parsedArgs.length !== 2) {
         throw new Error(requiresTime ? `${funcName} exige Tag e Time.` : `${funcName} exige Tag e, opcionalmente, Time.`);
       }
       const timeArg = parsedArgs.length === 2 ? parsedArgs[1] : { type: 'TimeExpression', value: '*' } as const;
       if (timeArg.type !== 'TimeExpression' && timeArg.type !== 'StringLiteral') throw new Error(`Parâmetro Time inválido para ${funcName}.`);
       startStr = String(timeArg.value);
       endStr = String(timeArg.value);
     } else {
       if (parsedArgs.length !== 3) throw new Error(`${funcName} exige 3 parâmetros (Tag, Start, End).`);
       if (parsedArgs[1].type !== 'TimeExpression' && parsedArgs[1].type !== 'StringLiteral') throw new Error(`Parâmetro Start inválido para ${funcName}.`);
       if (parsedArgs[2].type !== 'TimeExpression' && parsedArgs[2].type !== 'StringLiteral') throw new Error(`Parâmetro End inválido para ${funcName}.`);
       startStr = String(parsedArgs[1].value);
       endStr = String(parsedArgs[2].value);
     }
     
     const cacheKey = `${funcName}:${startStr}:${endStr}:${remainingArgs.join(':')}`;
     const globalKey = `${binding.dataSourceUid}:${binding.serverPath}:${binding.pointName}:${cacheKey}`;
     
     const cachedData = globalHistoricalResultCache.get(globalKey);
     if (cachedData && (now - cachedData.timestamp) < 15) {
       if (cachedData.error) throw cachedData.error;
       return serializeHistoricalValue(funcName, cachedData.value, typedResult);
     }
     
     if (!globalHistoricalPromiseLock.has(globalKey)) {
        const promise = fetchHistoryGlobal(globalKey, binding, startStr, endStr, funcName, remainingArgs.map(String)).finally(() => {
            globalHistoricalPromiseLock.delete(globalKey);
        });
        globalHistoricalPromiseLock.set(globalKey, promise);
     }
     
     if (cachedData && cachedData.value !== undefined) {
       return serializeHistoricalValue(funcName, cachedData.value, typedResult);
     }
     throw new Error("FETCHING_HISTORY");
  });
  
  return expression;
}

async function fetchHistoryGlobal(globalKey: string, binding: PiPointBinding, startStr: string, endStr: string, funcName: string, args: string[]) {
  try {
    const now = Date.now();
    let { from, to } = resolvePiWindow(startStr, endStr, now);
    
    if (['TAGVAL', 'VALUEATTIME', 'PREVVAL', 'NEXTVAL', 'PREVEVENT', 'NEXTEVENT'].includes(funcName.toUpperCase())) {
       from = from - 60000;
       to = to + 60000;
    }
    
    const { getPiTrendsRecordedHistoryForRange } = await import('../pi/piDataSource');
    
    const queryRange = ['FINDEQ', 'FINDNE', 'FINDGT', 'FINDGE', 'FINDLT', 'FINDLE'].includes(funcName.toUpperCase())
      ? { from: Math.min(from, to), to: Math.max(from, to) }
      : { from, to };
    const functionName = funcName.toUpperCase();
    const requestPlan = getHistoricalRequestPlan(functionName);
    let stepped: boolean | undefined;
    if (requestPlan.step) {
      try {
        stepped = (await getPiPointMetadata(binding))?.stepped;
      } catch {
        // Metadata is optional; undefined preserves the current continuous fallback.
      }
    }
    const response = await getPiTrendsRecordedHistoryForRange([binding], queryRange);
    
    // Esta consulta contém somente uma binding; a chave do datasource é composta.
    const result = Object.values(response)[0];
    if (result && result.status === 'success' && result.series && result.series.points) {
       const historicalValues = getHistoricalValues(result.series);
       const usableValues = selectHistoricalValues(historicalValues, 'numeric-value');
       const timelinePts = historicalValues.flatMap((point) => (
         typeof point.value === 'number' && Number.isFinite(point.value)
           ? [{ time: point.timestamp, value: point.value, qualityState: classifyHistoricalQuality(point) }]
           : []
       ));
       const pts = usableValues.flatMap((point) => (
         typeof point.value === 'number' && Number.isFinite(point.value)
           ? [{ time: point.timestamp, value: point.value }]
           : []
       ));
       const vals = pts.map((point) => point.value);
       const statePoints = usableValues.flatMap((point) => (
         typeof point.value === 'string' ? [{ time: point.timestamp, value: point.value }] : []
       ));
       const timelineStatePoints = historicalValues.flatMap((point) => (
         typeof point.value === 'string'
           ? [{ time: point.timestamp, value: point.value, qualityState: classifyHistoricalQuality(point) }]
           : []
       ));
       let res: number | string = 0;
       
       const fn = funcName.toUpperCase();
       
       const isPhaseThreeFunction = ['TAGAVG', 'TAGMEAN', 'TAGMIN', 'TAGMAX', 'TAGTOT', 'EVENTCOUNT', 'RANGE'].includes(fn);
       if (isPhaseThreeFunction && vals.length === 0) {
         throw new Error(`${funcName}: histórico sem valores numéricos válidos`);
       } else if (['PREVEVENT', 'NEXTEVENT'].includes(fn)) {
         const targetTime = parsePiTimeMs(startStr, Date.now());
         const events = historicalValues.filter((point) => point.origin === 'recorded' && classifyHistoricalQuality(point) !== 'known-bad');
         if (!events.some((point) => point.origin === 'recorded')) {
           throw new Error(`${funcName}: origem dos eventos arquivados não foi garantida pela datasource`);
         }
         const event = fn === 'PREVEVENT'
           ? [...events].reverse().find((point) => point.timestamp < targetTime)
           : events.find((point) => point.timestamp > targetTime);
         if (!event) throw new Error(`${funcName}: não há evento arquivado no sentido solicitado`);
         res = Math.floor(event.timestamp / 1000);
       } else if (fn === 'PCTGOOD') {
         if (timelinePts.length < 2) throw new Error(`${funcName}: qualidade histórica insuficiente`);
         if (timelinePts.some((point) => point.qualityState === 'unknown')) {
           throw new Error(`${funcName}: qualidade histórica desconhecida`);
         }
         const coveredMs = calculateQualityDuration(timelinePts, from, to, 'covered');
         const goodMs = calculateQualityDuration(timelinePts, from, to, 'good');
         if (coveredMs < Math.abs(to - from)) throw new Error(`${funcName}: boundary/qualidade insuficiente para cobrir toda a janela`);
         res = goodMs / Math.abs(to - from) * 100;
       } else if (fn === 'STDEV') {
         const deviation = calculateTimeWeightedStandardDeviation(timelinePts, from, to, stepped);
         if (deviation === undefined) throw new Error(`${funcName}: histórico sem intervalo calculável`);
         res = deviation;
       } else if (['TAGVAL', 'VALUEATTIME', 'PREVVAL', 'NEXTVAL'].includes(fn)) {
         const targetTime = parsePiTimeMs(startStr, Date.now());
         if (!isNaN(targetTime) && pts.length > 0) {
           const exact = pts.find((p: any) => p.time === targetTime);
           const numericValue = (point: any) => {
             if (!point || typeof point.value !== 'number' || !Number.isFinite(point.value)) {
               throw new Error(`${funcName}: evento histórico sem valor numérico válido`);
             }
             return point.value;
           };
           if (fn === 'PREVVAL') {
             res = numericValue([...pts].reverse().find((p: any) => p.time < targetTime));
           } else if (fn === 'NEXTVAL') {
             res = numericValue(pts.find((p: any) => p.time > targetTime));
           } else if (exact) {
             res = numericValue(exact);
           } else if (pts.length > 1) {
             const before = [...pts].reverse().find((p: any) => p.time < targetTime);
             const after = pts.find((p: any) => p.time > targetTime);
             if (before && after) {
               const m = (numericValue(after) - numericValue(before)) / (after.time - before.time || 1);
               res = numericValue(before) + m * (targetTime - before.time);
             } else {
               throw new Error(`${funcName}: não há eventos históricos suficientes para o instante solicitado`);
             }
           } else {
             throw new Error(`${funcName}: não há eventos históricos suficientes para o instante solicitado`);
           }
         } else {
           throw new Error(`${funcName}: não há valor histórico no instante solicitado`);
         }
       } else if (fn === 'TAGAVG') {
         const weighted = calculateTimeWeightedAverage(timelinePts, from, to, stepped);
         if (weighted === undefined) throw new Error(`${funcName}: histórico sem intervalo calculável`);
         res = weighted;
       } else if (fn === 'TAGMEAN') {
         res = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
       } else if (fn === 'TAGMIN') {
         res = Math.min(...vals);
       } else if (fn === 'TAGMAX') {
         res = Math.max(...vals);
       } else if (fn === 'TAGTOT') {
         const integral = calculateTimeIntegral(timelinePts, from, to, stepped);
         if (integral === undefined) throw new Error(`${funcName}: histórico sem intervalo calculável`);
         res = integral;
       } else if (fn === 'EVENTCOUNT') {
         const hasOrigin = requestPlan.recordedOrigin && historicalValues.some((point) => point.origin !== undefined);
         res = hasOrigin
           ? selectHistoricalValues(historicalValues, 'archived-event').filter((point) => point.origin === 'recorded').length
           : pts.length;
       } else if (fn === 'RANGE') {
         res = Math.max(...vals) - Math.min(...vals);
       } else if (['AVERAGE', 'MOVING_AVERAGE'].includes(fn) && vals.length > 0) {
         res = vals.reduce((a: number, b: number)=>a+b,0)/vals.length;
       } else if (['MINIMUM', 'MOVING_MIN'].includes(fn) && vals.length > 0) {
         res = Math.min(...vals);
       } else if (['MAXIMUM', 'MOVING_MAX'].includes(fn) && vals.length > 0) {
         res = Math.max(...vals);
       } else if (fn === 'TOTAL') {
         let integral = 0;
         for (let i = 0; i < pts.length - 1; i++) {
            const dtDays = Math.max(0, pts[i+1].time - pts[i].time) / 86400000;
            const v1 = typeof pts[i].value === 'number' ? pts[i].value : 0;
            const v2 = typeof pts[i+1].value === 'number' ? pts[i+1].value : v1;
            integral += ((v1 + v2) / 2) * dtDays;
         }
         res = integral;
       } else if (['MOVING_STDDEV'].includes(fn) && vals.length > 0) {
         const mean = vals.reduce((a: number, b: number)=>a+b,0)/vals.length;
         res = Math.sqrt(vals.reduce((a: number, b: number)=>a+Math.pow(b-mean,2),0)/(vals.length-1 || 1));
       } else if (fn === 'COUNT') {
         res = Math.max(0, pts.length - 1);
       } else if (['FINDEQ', 'FINDNE', 'FINDGT', 'FINDGE', 'FINDLT', 'FINDLE'].includes(fn)) {
         const target = args[0] ?? '';
         const isDigital = statePoints.length > 0;
         if (isDigital) {
           if (!['FINDEQ', 'FINDNE'].includes(fn)) {
             throw new Error(`${funcName}: comparação numérica incompatível com série digital`);
           }
           res = findSteppedConditionMatch(statePoints, from, to, target, fn === 'FINDEQ') / 1000;
         } else {
           if (pts.length === 0) throw new Error(`${funcName}: histórico sem valores numéricos válidos`);
           const comparator = fn === 'FINDEQ' ? 'eq' : fn === 'FINDNE' ? 'ne'
             : fn === 'FINDGT' ? 'gt' : fn === 'FINDGE' ? 'ge' : fn === 'FINDLT' ? 'lt' : 'le';
           res = findContinuousConditionMatch(timelinePts, from, to, Number(target), comparator, stepped) / 1000;
         }
       } else if (['TIMEEQ', 'TIMENE', 'TIMEGT', 'TIMEGE', 'TIMELT', 'TIMELE'].includes(fn)) {
         const targetState = args[0] || '';
        if (statePoints?.length) {
           if (!['TIMEEQ', 'TIMENE'].includes(fn)) {
             throw new Error(`${funcName}: comparação numérica incompatível com série digital`);
           }
           res = calculateSteppedConditionDuration(timelineStatePoints, from, to, targetState, fn === 'TIMEEQ') / 1000;
         } else {
           if (pts.length === 0) throw new Error(`${funcName}: histórico sem valores numéricos válidos`);
           const limit = parseFloat(args[0] || '0');
           if (!Number.isFinite(limit)) throw new Error(`${funcName}: limite numérico inválido`);
           const comparator = fn === 'TIMEEQ' ? 'eq' : fn === 'TIMENE' ? 'ne'
             : fn === 'TIMEGT' ? 'gt' : fn === 'TIMEGE' ? 'ge' : fn === 'TIMELT' ? 'lt' : 'le';
           res = calculateContinuousConditionDuration(timelinePts, from, to, limit, comparator, stepped) / 1000;
         }
       }
       
        globalHistoricalResultCache.set(globalKey, { value: res, timestamp: Math.floor(Date.now()/1000) });
    } else {
        throw result?.status === 'error' ? result.error : new Error('Resposta histórica inválida ou ausente');
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[HISTORICAL QUERY ERROR]', { tag: binding.pointName, message: error.message });
    globalHistoricalResultCache.set(globalKey, { error, timestamp: Math.floor(Date.now()/1000) });
  }
}

function getHistoricalValues(series: PiTrendSeries): PiHistoricalValue[] {
  if (series.historicalValues) return series.historicalValues;
  if (series.states?.length) {
    return series.states.map(({ time, value }) => ({ timestamp: time, value }));
  }
  return series.points.map(({ time, value }) => ({ timestamp: time, value }));
}

type HistoricalQualityState = 'known-good' | 'known-bad' | 'unknown';
type HistoricalQualityPolicy = 'numeric-value' | 'archived-event' | 'condition-interval';

function classifyHistoricalQuality(point: PiHistoricalValue): HistoricalQualityState {
  if (point.quality?.good === false) return 'known-bad';
  if (point.quality?.good === true) return 'known-good';
  return 'unknown';
}

function selectHistoricalValues(
  values: PiHistoricalValue[],
  policy: HistoricalQualityPolicy,
): PiHistoricalValue[] {
  // Policies stay explicit: archived-event consumers decide how to treat a
  // bad event at their operation boundary; numeric interval consumers filter
  // bad endpoints before doing interpolation/integration.
  switch (policy) {
    case 'numeric-value':
    case 'condition-interval':
      return values.filter((point) => classifyHistoricalQuality(point) !== 'known-bad');
    case 'archived-event':
      return values;
  }
}

type HistoricalNumericPoint = { time: number; value: number; qualityState?: HistoricalQualityState };

function calculateTimeWeightedAverage(points: HistoricalNumericPoint[], from: number, to: number, stepped?: boolean): number | undefined {
  const integral = calculateTimeIntegral(points, from, to, stepped);
  const duration = points.reduce((total, point, index) => {
    const next = points[index + 1];
    if (!next) return total;
    if (point.qualityState === 'known-bad' || next.qualityState === 'known-bad') return total;
    return total + Math.max(0, Math.min(to, next.time) - Math.max(from, point.time));
  }, 0);
  return integral === undefined || duration <= 0 ? undefined : integral / (duration / 86400000);
}

function calculateTimeIntegral(points: HistoricalNumericPoint[], from: number, to: number, stepped?: boolean): number | undefined {
  let integral = 0;
  let coveredMs = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left.qualityState === 'known-bad' || right.qualityState === 'known-bad') continue;
    const segmentFrom = Math.max(from, left.time);
    const segmentTo = Math.min(to, right.time);
    if (segmentTo <= segmentFrom) continue;
    if (stepped) {
      integral += left.value * (segmentTo - segmentFrom) / 86400000;
    } else {
      const span = right.time - left.time || 1;
      const startValue = left.value + (right.value - left.value) * ((segmentFrom - left.time) / span);
      const endValue = left.value + (right.value - left.value) * ((segmentTo - left.time) / span);
      integral += ((startValue + endValue) / 2) * (segmentTo - segmentFrom) / 86400000;
    }
    coveredMs += segmentTo - segmentFrom;
  }
  return coveredMs > 0 ? integral : undefined;
}

function calculateQualityDuration(
  points: HistoricalNumericPoint[],
  from: number,
  to: number,
  kind: 'covered' | 'good',
): number {
  let duration = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    const segmentFrom = Math.max(Math.min(from, to), left.time);
    const segmentTo = Math.min(Math.max(from, to), right.time);
    if (segmentTo <= segmentFrom) continue;
    if (kind === 'covered') {
      duration += segmentTo - segmentFrom;
    } else if (left.qualityState === 'known-good') {
      duration += segmentTo - segmentFrom;
    }
  }
  return duration;
}

function calculateTimeWeightedStandardDeviation(
  points: HistoricalNumericPoint[],
  from: number,
  to: number,
  stepped?: boolean,
): number | undefined {
  const duration = calculateQualityDuration(points, from, to, 'covered');
  if (duration <= 0 || points.some((point) => point.qualityState === 'unknown')) return undefined;
  let weightedSum = 0;
  let weightedSquareSum = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left.qualityState === 'known-bad' || right.qualityState === 'known-bad') continue;
    const segmentFrom = Math.max(Math.min(from, to), left.time);
    const segmentTo = Math.min(Math.max(from, to), right.time);
    if (segmentTo <= segmentFrom) continue;
    const span = right.time - left.time || 1;
    const startValue = stepped ? left.value : left.value + (right.value - left.value) * ((segmentFrom - left.time) / span);
    const endValue = stepped ? left.value : left.value + (right.value - left.value) * ((segmentTo - left.time) / span);
    const segmentMs = segmentTo - segmentFrom;
    const segmentDays = segmentMs / 86400000;
    weightedSum += ((startValue + endValue) / 2) * segmentDays;
    weightedSquareSum += ((startValue * startValue + endValue * endValue) / 2) * segmentDays;
  }
  const mean = weightedSum / (duration / 86400000);
  return Math.sqrt(Math.max(0, weightedSquareSum / (duration / 86400000) - mean * mean));
}

type Comparison = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';

function compareValue(value: number, threshold: number, comparison: Comparison): boolean {
  switch (comparison) {
    case 'eq': return value === threshold;
    case 'ne': return value !== threshold;
    case 'gt': return value > threshold;
    case 'ge': return value >= threshold;
    case 'lt': return value < threshold;
    case 'le': return value <= threshold;
  }
}

function calculateContinuousConditionDuration(
  points: HistoricalNumericPoint[],
  from: number,
  to: number,
  threshold: number,
  comparison: Comparison,
  stepped?: boolean,
): number {
  let duration = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left.qualityState === 'known-bad' || right.qualityState === 'known-bad') continue;
    const segmentFrom = Math.max(from, left.time);
    const segmentTo = Math.min(to, right.time);
    if (segmentTo <= segmentFrom) continue;
    if (stepped) {
      if (compareValue(left.value, threshold, comparison)) duration += segmentTo - segmentFrom;
      continue;
    }
    const span = right.time - left.time || 1;
    const startRatio = (segmentFrom - left.time) / span;
    const endRatio = (segmentTo - left.time) / span;
    const startValue = left.value + (right.value - left.value) * startRatio;
    const endValue = left.value + (right.value - left.value) * endRatio;
    if (compareValue(startValue, threshold, comparison) && compareValue(endValue, threshold, comparison)) {
      duration += segmentTo - segmentFrom;
      continue;
    }
    if (startValue === endValue) continue;
    const crossing = (threshold - startValue) / (endValue - startValue);
    if (crossing <= 0 || crossing >= 1) {
      if (compareValue((startValue + endValue) / 2, threshold, comparison)) duration += segmentTo - segmentFrom;
      continue;
    }
    const crossingTime = segmentFrom + (segmentTo - segmentFrom) * crossing;
    const before = compareValue((startValue + threshold) / 2, threshold, comparison);
    duration += before ? crossingTime - segmentFrom : segmentTo - crossingTime;
  }
  return duration;
}

function findContinuousConditionMatch(
  points: HistoricalNumericPoint[],
  start: number,
  end: number,
  threshold: number,
  comparison: Comparison,
  stepped?: boolean,
): number {
  if (!Number.isFinite(threshold)) throw new Error('Find*: limite numérico inválido');
  const direction = end >= start ? 1 : -1;
  const ordered = [...points].sort((left, right) => direction * (left.time - right.time));
  for (let index = 0; index < ordered.length; index += 1) {
    const left = ordered[index];
    if (left.qualityState === 'known-bad') continue;
    if ((direction === 1 && (left.time < start || left.time > end)) || (direction === -1 && (left.time > start || left.time < end))) continue;
    if (compareValue(left.value, threshold, comparison)) return left.time;
    const right = ordered[index + 1];
    if (!right) continue;
    if (right.qualityState === 'known-bad') continue;
    if (stepped && compareValue(right.value, threshold, comparison)) return right.time;
    const segmentFrom = direction === 1 ? Math.max(start, left.time) : Math.min(start, left.time);
    const segmentTo = direction === 1 ? Math.min(end, right.time) : Math.max(end, right.time);
    if ((direction === 1 && segmentTo <= segmentFrom) || (direction === -1 && segmentTo >= segmentFrom)) continue;
    const valueAtFrom = left.value + (right.value - left.value) * ((segmentFrom - left.time) / (right.time - left.time || 1));
    const valueAtTo = left.value + (right.value - left.value) * ((segmentTo - left.time) / (right.time - left.time || 1));
    if (!compareValue(valueAtTo, threshold, comparison)) continue;
    if (comparison === 'ne') return segmentFrom;
    const fraction = (threshold - valueAtFrom) / (valueAtTo - valueAtFrom || 1);
    return segmentFrom + (segmentTo - segmentFrom) * Math.max(0, Math.min(1, fraction));
  }
  throw new Error('Find*: nenhuma correspondência encontrada no período.');
}

function findSteppedConditionMatch(
  points: Array<{ time: number; value: string }>,
  start: number,
  end: number,
  target: string,
  equals: boolean,
): number {
  const direction = end >= start ? 1 : -1;
  const ordered = [...points].sort((left, right) => direction * (left.time - right.time));
  for (const point of ordered) {
    if ((direction === 1 && (point.time < start || point.time > end)) || (direction === -1 && (point.time > start || point.time < end))) continue;
    const matches = point.value.trim().localeCompare(target.trim(), undefined, { sensitivity: 'accent' }) === 0;
    if (matches === equals) return point.time;
  }
  throw new Error('Find*: nenhuma correspondência encontrada no período.');
}

function calculateSteppedConditionDuration(
  points: Array<{ time: number; value: string; qualityState?: HistoricalQualityState }>,
  from: number,
  to: number,
  target: string,
  equals: boolean,
): number {
  let duration = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentFrom = Math.max(from, points[index].time);
    const segmentTo = Math.min(to, points[index + 1].time);
    if (segmentTo <= segmentFrom) continue;
    if (points[index].qualityState === 'known-bad' || points[index + 1].qualityState === 'known-bad') continue;
    const state = points[index].value.trim().localeCompare(target.trim(), undefined, { sensitivity: 'accent' }) === 0;
    if (state === equals) duration += segmentTo - segmentFrom;
  }
  return duration;
}

/**
 * PI relative forms use the browser's local timezone until the configured
 * datasource exposes a PI Server timezone. Invalid input is never converted
 * into an arbitrary query time.
 */
export function parsePiTimeMs(str: string, referenceTime: number): number {
  str = str.trim().toLowerCase();

  if (!str) throw new Error('Expressão de tempo PI vazia.');
  if (str === '*') return referenceTime;
  const startOfToday = (time: number) => {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  if (str === 't' || str === 'today') {
    return startOfToday(referenceTime);
  }
  if (str === 'y' || str === 'yesterday') {
    const date = new Date(referenceTime);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime();
  }

  const WEEKDAY_MAP: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };
  const relativeBase = (value: string): number | undefined => {
    if (value === '*') return referenceTime;
    if (value === 't' || value === 'today') return startOfToday(referenceTime);
    if (value === 'y' || value === 'yesterday') {
      const date = new Date(referenceTime);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime();
    }
    if (value in WEEKDAY_MAP) {
      const targetDay = WEEKDAY_MAP[value];
      const date = new Date(referenceTime);
      const delta = (date.getDay() - targetDay + 7) % 7;
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() - delta).getTime();
    }
    return undefined;
  };
  const applyOffset = (base: number, sign: string, amount: string, unit: string) => {
    const direction = sign === '-' ? -1 : 1;
    const value = Number(amount);
    if (unit === 'mo') {
      const date = new Date(base);
      date.setMonth(date.getMonth() + direction * value);
      return date.getTime();
    }
    const milliseconds: Record<string, number> = {
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
      w: 604800000,
    };
    return base + direction * value * milliseconds[unit];
  };

  const combinedMatch = str.match(/^(\*|t|today|y|yesterday|sun|mon|tue|wed|thu|fri|sat)\s*([+-])(\d+)(s|m|h|d|w|mo)$/);
  if (combinedMatch) {
    const base = relativeBase(combinedMatch[1]);
    if (base !== undefined) return applyOffset(base, combinedMatch[2], combinedMatch[3], combinedMatch[4]);
  }

  const relativeMatch = str.match(/^([+-])(\d+)(s|m|h|d|w|mo)$/);
  if (relativeMatch) {
    return applyOffset(referenceTime, relativeMatch[1], relativeMatch[2], relativeMatch[3]);
  }

  const base = relativeBase(str);
  if (base !== undefined) return base;

  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return parsed;

  throw new Error(`Expressão de tempo PI inválida: ${str}`);
}
export function resolvePiWindow(startStr: string, endStr: string, now: number): {from: number, to: number} {
  const to = endStr ? parsePiTimeMs(endStr, now) : now;
  const from = startStr ? parsePiTimeMs(startStr, to) : (to - 3600000);
  return { from, to };
}
