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

export const globalHistoricalResultCache = new Map<string, {value: number | string, timestamp: number}>();
export const globalHistoricalPromiseLock = new Map<string, Promise<void>>();

export function applyHistoricalMacros(
  expression: string, 
  token: string, 
  calcId: string, 
  binding: PiPointBinding, 
  now: number
): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = `(?:')?${escaped}(?:')?`;
  
  const funcNames = 'PI_AVERAGE|PI_MIN|PI_MAX|PI_TOTAL|PI_STDDEV|FIRST_VALUE|LAST_VALUE|STATE_DURATION|EVENT_COUNT|COUNT_VALUES|CYCLES|TIME_IN_RANGE|TIME_OUT_OF_RANGE|TIME_AVERAGE|MOVING_AVERAGE|AVERAGE_TIME|TIME_MIN|MOVING_MIN|MIN_TIME|TIME_MAX|MOVING_MAX|MAX_TIME|TIME_SUM|SUM_TIME|STDDEV_TIME|MOVING_STDDEV|PERCENTILE|INTERPOLATE|VALUE_AT_TIME|RECORDED_VALUES|EXCEPTION_FILTER|COMPRESSION_FILTER|SLOPE|TREND|RATE_OF_CHANGE|IS_STABLE|IS_INCREASING|IS_DECREASING|LINEAR_FORECAST|TIME_TO_LIMIT|TIME_EQ|TIME_NE';
  const histRegex = new RegExp(`(?<![A-Za-z0-9_.:])(${funcNames})\\s*\\(\\s*${tokenPattern}\\s*,\\s*(.*?)\\s*\\)`, 'gi');
  
  expression = expression.replace(histRegex, (_match, funcName, argsStr) => {
     const args = argsStr.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
     const interval = args[args.length - 1]; // Assume interval is always the last argument
     
     const cacheKey = `${funcName}:${args.join(':')}`;
     const globalKey = `${binding.dataSourceUid}:${binding.serverPath}:${binding.pointName}:${cacheKey}`;
     
     const cachedData = globalHistoricalResultCache.get(globalKey);
     if (cachedData && (now - cachedData.timestamp) < 15) {
       return typeof cachedData.value === 'string' ? `'${cachedData.value.replace(/'/g, "\\'")}'` : String(cachedData.value);
     }
     
     if (!globalHistoricalPromiseLock.has(globalKey)) {
        const promise = fetchHistoryGlobal(globalKey, binding, interval, funcName, args).catch(console.error).finally(() => {
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

async function fetchHistoryGlobal(globalKey: string, binding: PiPointBinding, interval: string, funcName: string, args: string[]) {
  try {
    let to = Date.now();
    let from = to - parseIntervalMs(interval);
    
    if (funcName.toUpperCase() === 'INTERPOLATE' || funcName.toUpperCase() === 'VALUE_AT_TIME') {
       const targetTime = Date.parse(interval);
       if (!isNaN(targetTime)) {
          from = targetTime - 60000;
          to = targetTime + 60000;
       }
    }
    
    const { getPiTrendsRecordedHistoryForRange } = await import('../pi/piDataSource');
    const response = await getPiTrendsRecordedHistoryForRange([binding], { from, to });
    
    const result = response[binding.pointName];
    if (result && result.status === 'success' && result.series && result.series.points) {
       const pts = result.series.points;
       const vals = pts.map((p: any) => p.value).filter((v: any) => Number.isFinite(v));
       let res: number | string = 0;
       
       const fn = funcName.toUpperCase();
       
       const getLinearRegression = () => {
         const n = pts.length;
         if (n < 2) return { m: 0, b: typeof pts[0]?.value === 'number' ? pts[0].value : 0 };
         let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
         for (const p of pts) {
           const x = p.time / 1000;
           const y = typeof p.value === 'number' ? p.value : 0;
           sumX += x;
           sumY += y;
           sumXY += x * y;
           sumX2 += x * x;
         }
         const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
         const b = (sumY - m * sumX) / n;
         return { m, b };
       };
       
       if (fn === 'INTERPOLATE' || fn === 'VALUE_AT_TIME') {
         const targetTime = Date.parse(interval);
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
       } else if (fn === 'RECORDED_VALUES') {
         res = JSON.stringify(pts);
       } else if (fn === 'EXCEPTION_FILTER') {
         let removed = 0;
         if (pts.length > 2) {
           let lastArchived = typeof pts[0].value === 'number' ? pts[0].value : 0;
           for (let i = 1; i < pts.length - 1; i++) {
             const v = typeof pts[i].value === 'number' ? pts[i].value : 0;
             if (Math.abs(v - lastArchived) < 0.05) removed++; else lastArchived = v;
           }
         }
         res = String(removed);
       } else if (fn === 'COMPRESSION_FILTER') {
         let removed = 0;
         if (pts.length > 2) {
           let lastArchived = typeof pts[0].value === 'number' ? pts[0].value : 0;
           for (let i = 1; i < pts.length - 1; i++) {
             const v = typeof pts[i].value === 'number' ? pts[i].value : 0;
             if (Math.abs(v - lastArchived) < 0.1) removed++; else lastArchived = v;
           }
         }
         res = JSON.stringify({ removidos: removed, mantidos: pts.length - removed, erro: 0.1 });
       } else if (fn === 'SLOPE') {
         res = getLinearRegression().m;
       } else if (fn === 'RATE_OF_CHANGE') {
         if (pts.length > 1) {
           const first = typeof pts[0].value === 'number' ? pts[0].value : 0;
           const last = typeof pts[pts.length-1].value === 'number' ? pts[pts.length-1].value : 0;
           const dt = (pts[pts.length-1].time - pts[0].time) / 1000 || 1;
           res = (last - first) / dt;
         }
       } else if (fn === 'TREND') {
         const m = getLinearRegression().m;
         if (m > 0.001) res = 'UP';
         else if (m < -0.001) res = 'DOWN';
         else res = 'STABLE';
       } else if (fn === 'IS_STABLE') {
         res = Math.abs(getLinearRegression().m) <= 0.001 ? 1 : 0;
       } else if (fn === 'IS_INCREASING') {
         res = getLinearRegression().m > 0.001 ? 1 : 0;
       } else if (fn === 'IS_DECREASING') {
         res = getLinearRegression().m < -0.001 ? 1 : 0;
       } else if (fn === 'LINEAR_FORECAST') {
         const { m, b } = getLinearRegression();
         const targetTimeStr = args[args.length - 1] || '0s';
         const targetTimeMs = Date.now() + parseIntervalMs(targetTimeStr);
         res = m * (targetTimeMs / 1000) + b;
       } else if (fn === 'TIME_TO_LIMIT') {
         const { m, b } = getLinearRegression();
         const limit = parseFloat(args[args.length - 2] || '0');
         if (Math.abs(m) > 0.000001) {
           const targetX = (limit - b) / m;
           res = Math.max(0, targetX - (Date.now() / 1000));
         } else res = NaN;
       } else if (['AVERAGE_TIME', 'TIME_AVERAGE', 'MOVING_AVERAGE', 'PI_AVERAGE'].includes(fn) && vals.length > 0) {
         res = vals.reduce((a: number, b: number)=>a+b,0)/vals.length;
       } else if (['MIN_TIME', 'TIME_MIN', 'MOVING_MIN', 'PI_MIN'].includes(fn) && vals.length > 0) {
         res = Math.min(...vals);
       } else if (['MAX_TIME', 'TIME_MAX', 'MOVING_MAX', 'PI_MAX'].includes(fn) && vals.length > 0) {
         res = Math.max(...vals);
       } else if (['SUM_TIME', 'TIME_SUM', 'PI_TOTAL'].includes(fn)) {
         res = vals.reduce((a: number, b: number)=>a+b,0);
       } else if (['STDDEV_TIME', 'MOVING_STDDEV', 'PI_STDDEV'].includes(fn) && vals.length > 0) {
         const mean = vals.reduce((a: number, b: number)=>a+b,0)/vals.length;
         res = Math.sqrt(vals.reduce((a: number, b: number)=>a+Math.pow(b-mean,2),0)/(vals.length-1 || 1));
       } else if (fn === 'PERCENTILE' && vals.length > 0) {
         const perc = parseFloat(args[args.length - 2] || '50');
         const sorted = [...vals].sort((a: number, b: number) => a - b);
         const idx = Math.floor((sorted.length - 1) * (Math.max(0, Math.min(100, perc)) / 100));
         res = sorted[idx] ?? 0;
       } else if (fn === 'FIRST_VALUE' && pts.length > 0) {
         res = typeof pts[0].value === 'number' ? pts[0].value : (typeof pts[0].value === 'string' ? pts[0].value : 0);
       } else if (fn === 'LAST_VALUE' && pts.length > 0) {
         res = typeof pts[pts.length-1].value === 'number' ? pts[pts.length-1].value : (typeof pts[pts.length-1].value === 'string' ? pts[pts.length-1].value : 0);
       } else if (fn === 'EVENT_COUNT' || fn === 'COUNT_VALUES') {
         res = Math.max(0, pts.length - 1);
       } else if (fn === 'STATE_DURATION' || fn === 'TIME_EQ' || fn === 'TIME_NE') {
         const targetState = args[args.length - 2] || '';
         for (let i = 0; i < pts.length - 1; i++) {
           const sName = getDigitalStateName(pts[i].value) ?? String(pts[i].value);
           const isEqual = sName.localeCompare(targetState, undefined, { sensitivity: 'accent' }) === 0;
           if ((fn === 'TIME_NE' && !isEqual) || (fn !== 'TIME_NE' && isEqual)) {
             const dt = Math.max(0, pts[i+1].time - pts[i].time) / 1000;
             if (typeof res === 'number') res += dt;
           }
         }
       } else if (fn === 'TIME_IN_RANGE' || fn === 'TIME_OUT_OF_RANGE') {
         const min = parseFloat(args[args.length - 3] || '0');
         const max = parseFloat(args[args.length - 2] || '100');
         for (let i = 0; i < pts.length - 1; i++) {
           const v = pts[i].value;
           if (typeof v === 'number') {
             const inRange = v >= min && v <= max;
             if ((fn === 'TIME_IN_RANGE' && inRange) || (fn === 'TIME_OUT_OF_RANGE' && !inRange)) {
               const dt = Math.max(0, pts[i+1].time - pts[i].time) / 1000;
               if (typeof res === 'number') res += dt;
             }
           }
         }
       } else if (fn === 'CYCLES') {
         if (pts.length > 0) {
           const initialState = getDigitalStateName(pts[0].value) ?? String(pts[0].value);
           let departed = false;
           for (let i = 1; i < pts.length; i++) {
             const sName = getDigitalStateName(pts[i].value) ?? String(pts[i].value);
             if (sName !== initialState) departed = true;
             else if (departed && sName === initialState) {
               if (typeof res === 'number') res++;
               departed = false;
             }
           }
         }
       }
       
       globalHistoricalResultCache.set(globalKey, { value: res, timestamp: Math.floor(Date.now()/1000) });
    }
  } catch (err) {
    const cachedData = globalHistoricalResultCache.get(globalKey);
    globalHistoricalResultCache.set(globalKey, { ...(cachedData||{value: 0}), timestamp: Math.floor(Date.now()/1000) });
  }
}

function parseIntervalMs(str: string): number {
  const match = str.match(/^(\d+)(s|m|h|d|w|mo)$/);
  if (!match) return 3600000;
  const val = parseInt(match[1]);
  switch(match[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60000;
    case 'h': return val * 3600000;
    case 'd': return val * 86400000;
    case 'w': return val * 604800000;
    case 'mo': return val * 2592000000;
    default: return 3600000;
  }
}
