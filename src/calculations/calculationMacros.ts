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

export function applyQualityMacros(expression: string, token: string, piPointValue: any): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = `(?:')?${escaped}(?:')?`;
  
  const isBadRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_BAD\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isBadRegex, () => {
    const isBad = piPointValue && typeof piPointValue === 'object' && piPointValue.good === false;
    return isBad ? '1' : '0';
  });

  const isGoodRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_GOOD\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isGoodRegex, () => {
    const isGood = piPointValue && typeof piPointValue === 'object' ? piPointValue.good !== false : true;
    return isGood ? '1' : '0';
  });

  const isNoDataRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_NO_DATA\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isNoDataRegex, () => {
    const noData = !piPointValue || (typeof piPointValue === 'object' && (!('value' in piPointValue) || piPointValue.value === undefined));
    return noData ? '1' : '0';
  });

  const isSubRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_SUBSTITUTED\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isSubRegex, () => {
    const isSub = piPointValue && typeof piPointValue === 'object' && piPointValue.quality && piPointValue.quality.substituted === true;
    return isSub ? '1' : '0';
  });

  const isQuestRegex = new RegExp(`(?<![A-Za-z0-9_.:])IS_QUESTIONABLE\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(isQuestRegex, () => {
    const isQuest = piPointValue && typeof piPointValue === 'object' && piPointValue.quality && piPointValue.quality.questionable === true;
    return isQuest ? '1' : '0';
  });
  
  const qualityRegex = new RegExp(`(?<![A-Za-z0-9_.:])QUALITY\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(qualityRegex, () => {
    if (!piPointValue || typeof piPointValue !== 'object') return '"Good"';
    if (piPointValue.quality?.substituted) return '"Substituted"';
    if (piPointValue.quality?.questionable) return '"Questionable"';
    if (piPointValue.good === false) return '"Bad"';
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
       return String(Math.floor(Date.parse(piPointValue.timestamp) / 1000));
    }
    return String(Math.floor(Date.now() / 1000));
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
    const isBad = piPointValue && typeof piPointValue === 'object' && piPointValue.good === false;
    return isBad ? defaultVal : `'${token}'`;
  });

  const filterBadRegex = new RegExp(`(?<![A-Za-z0-9_.:])FILTER_BAD\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(filterBadRegex, () => {
    const isBad = piPointValue && typeof piPointValue === 'object' && piPointValue.good === false;
    return isBad ? 'NaN' : `'${token}'`;
  });

  const lastValueRegex = new RegExp(`(?<![A-Za-z0-9_.:])LAST_VALUE\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(lastValueRegex, `'${token}'`);

  const lastTsRegex = new RegExp(`(?<![A-Za-z0-9_.:])LAST_TIMESTAMP\\s*\\(\\s*${tokenPattern}\\s*\\)`, 'gi');
  expression = expression.replace(lastTsRegex, () => {
    if (piPointValue && typeof piPointValue === 'object' && piPointValue.timestamp) {
       return String(Math.floor(Date.parse(piPointValue.timestamp) / 1000));
    }
    return String(Math.floor(Date.now() / 1000));
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

export const globalHistoricalResultCache = new Map<string, {value?: number | string, error?: Error, timestamp: number}>();
export const globalHistoricalPromiseLock = new Map<string, Promise<void>>();

export function hasPendingHistoricalRequests(): boolean {
  return globalHistoricalPromiseLock.size > 0;
}

export async function waitForPendingHistoricalRequests(): Promise<void> {
  const pending = [...globalHistoricalPromiseLock.values()];
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
}

export const PI_TIME_ABBREVIATIONS = new Set(['*', 't', 'y', 'today', 'yesterday', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

export function isPiTimeString(str: string): boolean {
  const lower = str.trim().toLocaleLowerCase();
  if (PI_TIME_ABBREVIATIONS.has(lower)) return true;
  if (/^(\*|t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)?[+-]\d+[smhdwy]$/.test(lower)) return true;
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(lower)) return true;
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
  now: number
): string {
  const funcNames = 'TimeEq|TimeGT|TimeLT|Average|Minimum|Maximum|Total|Count|ValueAtTime|PrevVal|Moving_Average|Moving_Min|Moving_Max|Moving_StdDev';
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
     const isEventFunc = ['TIMEEQ', 'TIMEGT', 'TIMELT'].includes(fnUp);
     
     let startStr = '';
     let endStr = '';
     let remainingArgs: (string | number)[] = [];
     
     if (isEventFunc) {
       if (parsedArgs.length !== 4) throw new Error(`${funcName} exige 4 parâmetros (Tag, Start, End, Valor).`);
       if (parsedArgs[1].type !== 'TimeExpression' && parsedArgs[1].type !== 'StringLiteral') throw new Error(`Parâmetro Start inválido para ${funcName}.`);
       if (parsedArgs[2].type !== 'TimeExpression' && parsedArgs[2].type !== 'StringLiteral') throw new Error(`Parâmetro End inválido para ${funcName}.`);
       startStr = String(parsedArgs[1].value);
       endStr = String(parsedArgs[2].value);
       remainingArgs = [parsedArgs[3].value];
     } else if (fnUp === 'VALUEATTIME' || fnUp === 'PREVVAL') {
       if (parsedArgs.length !== 2) throw new Error(`${funcName} exige 2 parâmetros (Tag, Time).`);
       if (parsedArgs[1].type !== 'TimeExpression' && parsedArgs[1].type !== 'StringLiteral') throw new Error(`Parâmetro Time inválido para ${funcName}.`);
       startStr = String(parsedArgs[1].value);
       endStr = String(parsedArgs[1].value);
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
       return typeof cachedData.value === 'string' ? `'${cachedData.value.replace(/'/g, "\\'")}'` : String(cachedData.value);
     }
     
     if (!globalHistoricalPromiseLock.has(globalKey)) {
        const promise = fetchHistoryGlobal(globalKey, binding, startStr, endStr, funcName, remainingArgs.map(String)).finally(() => {
            globalHistoricalPromiseLock.delete(globalKey);
        });
        globalHistoricalPromiseLock.set(globalKey, promise);
     }
     
     if (cachedData && cachedData.value !== undefined) {
       return typeof cachedData.value === 'string' ? `'${cachedData.value.replace(/'/g, "\\'")}'` : String(cachedData.value);
     }
     throw new Error("FETCHING_HISTORY");
  });
  
  return expression;
}

async function fetchHistoryGlobal(globalKey: string, binding: PiPointBinding, startStr: string, endStr: string, funcName: string, args: string[]) {
  try {
    const now = Date.now();
    let { from, to } = resolvePiWindow(startStr, endStr, now);
    
    if (funcName.toUpperCase() === 'VALUEATTIME' || funcName.toUpperCase() === 'PREVVAL') {
       from = from - 60000;
       to = to + 60000;
    }
    
    const { getPiTrendsRecordedHistoryForRange } = await import('../pi/piDataSource');
    
    const response = await getPiTrendsRecordedHistoryForRange([binding], { from, to });
    
    // Esta consulta contém somente uma binding; a chave do datasource é composta.
    const result = Object.values(response)[0];
    if (result && result.status === 'success' && result.series && result.series.points) {
       const pts = result.series.points;
       const vals = pts.map((p: any) => p.value).filter((v: any) => Number.isFinite(v));
       let res: number | string = 0;
       
       const fn = funcName.toUpperCase();
       
       if (fn === 'VALUEATTIME' || fn === 'PREVVAL') {
         const targetTime = parsePiTimeMs(startStr, Date.now());
         if (!isNaN(targetTime) && pts.length > 0) {
           const exact = pts.find((p: any) => p.time === targetTime);
           if (exact) res = typeof exact.value === 'number' ? exact.value : 0;
           else if (pts.length > 1) {
             const p1 = pts[0]; const p2 = pts[pts.length-1];
             const m = ((typeof p2.value === 'number' ? p2.value : 0) - (typeof p1.value === 'number' ? p1.value : 0)) / (p2.time - p1.time || 1);
             res = (typeof p1.value === 'number' ? p1.value : 0) + m * (targetTime - p1.time);
           } else {
             res = typeof pts[0].value === 'number' ? pts[0].value : 0;
           }
         }
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
       } else if (fn === 'TIMEEQ') {
         const targetState = args[0] || '';
         const statePoints = result.series.states?.length ? result.series.states : pts;
         for (let i = 0; i < statePoints.length - 1; i++) {
           const sName = getDigitalStateName(statePoints[i].value) ?? String(statePoints[i].value);
           if (sName.localeCompare(targetState, undefined, { sensitivity: 'accent' }) === 0) {
             const dt = Math.max(0, statePoints[i+1].time - statePoints[i].time) / 1000;
             if (typeof res === 'number') res += dt;
           }
         }
       } else if (fn === 'TIMEGT' || fn === 'TIMELT') {
         const limit = parseFloat(args[0] || '0');
         for (let i = 0; i < pts.length - 1; i++) {
           const v = pts[i].value;
           if (typeof v === 'number') {
             const conditionMet = (fn === 'TIMEGT' && v > limit) || (fn === 'TIMELT' && v < limit);
             if (conditionMet) {
               const dt = Math.max(0, pts[i+1].time - pts[i].time) / 1000;
               if (typeof res === 'number') res += dt;
             }
           }
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

export function parsePiTimeMs(str: string, referenceTime: number): number {
  str = str.trim().toLowerCase();
  
  if (str === '*') return referenceTime;
  if (str === 't' || str === 'today') {
    const d = new Date(referenceTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  if (str === 'y' || str === 'yesterday') {
    const d = new Date(referenceTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
  }
  
  const WEEKDAY_MAP: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };
  if (str in WEEKDAY_MAP) {
    const targetDay = WEEKDAY_MAP[str];
    const d = new Date(referenceTime);
    const currentDay = d.getDay();
    const delta = (currentDay - targetDay + 7) % 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - delta).getTime();
  }

  // Se tiver um formato como *-24h ou -24h (assumindo * como base)
  const relativeMatch = str.match(/^(\*)?([+-])(\d+)(s|m|h|d|w|mo)$/);
  if (relativeMatch) {
    const isNegative = relativeMatch[2] === '-';
    const val = parseInt(relativeMatch[3]);
    let ms = 0;
    switch(relativeMatch[4]) {
      case 's': ms = val * 1000; break;
      case 'm': ms = val * 60000; break;
      case 'h': ms = val * 3600000; break;
      case 'd': ms = val * 86400000; break;
      case 'w': ms = val * 604800000; break;
      case 'mo': ms = val * 2592000000; break;
    }
    return isNegative ? referenceTime - ms : referenceTime + ms;
  }

  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return parsed;

  return referenceTime - 3600000; // Fallback: 1h atrás
}

export function resolvePiWindow(startStr: string, endStr: string, now: number): {from: number, to: number} {
  const to = endStr ? parsePiTimeMs(endStr, now) : now;
  const from = startStr ? parsePiTimeMs(startStr, to) : (to - 3600000);
  return { from, to };
}
