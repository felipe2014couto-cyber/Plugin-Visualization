import type { PiPointBinding } from '../pi/piPointBinding';
import { evaluatePeDelay, nextPeOccurrenceId, resetPeOccurrenceCursor, type PeEvaluationContext, type PeCalculationSchedule } from './peSchedulerRuntime';
import { applyAlarmMacros, applyQualityMacros, applyTemporalMacros, applyHistoricalMacros, applyMetadataMacros, applyDigitalStateMacros, updateTemporalCache, parsePiTimeMs } from './calculationMacros';

export interface CalculationInput {
  name: string;
  binding: PiPointBinding;
}

export interface CalculationDefinition {
  id: string;
  name: string;
  description?: string;
  expression: string;
  inputs: CalculationInput[];
  schedule?: PeCalculationSchedule;
}

export type CalculationEvaluation =
  | { status: 'success'; value: number | string }
  | { status: 'loading' }
  | { status: 'error'; error: Error };

/**
 * Internal PE value categories. They are never exposed by evaluateCalculation:
 * the public result is always unwrapped to a number or string.
 */
export type PiExpressionValue =
  | { kind: 'timestamp'; value: number }
  | { kind: 'timespan'; value: number }
  | { kind: 'digital-state'; name: string; code: number; setWebId?: string; setName?: string };

type ParsedExpressionValue = number | string | PiExpressionValue;

export function piTimestamp(value: number): PiExpressionValue {
  return { kind: 'timestamp', value };
}

export function piTimespan(value: number): PiExpressionValue {
  return { kind: 'timespan', value };
}

export function piDigitalState(name: string, code: number, setWebId?: string, setName?: string): PiExpressionValue {
  return { kind: 'digital-state', name, code, ...(setWebId ? { setWebId } : {}), ...(setName ? { setName } : {}) };
}

export function isPiExpressionValue(value: unknown): value is PiExpressionValue {
  return Boolean(value) && typeof value === 'object'
    && (((value as PiExpressionValue).kind === 'timestamp' || (value as PiExpressionValue).kind === 'timespan')
      && typeof (value as Extract<PiExpressionValue, { value: number }>).value === 'number'
      || (value as PiExpressionValue).kind === 'digital-state'
      && typeof (value as Extract<PiExpressionValue, { code: number }>).name === 'string'
      && typeof (value as Extract<PiExpressionValue, { code: number }>).code === 'number');
}

function isPiTemporalExpressionValue(value: unknown): value is Extract<PiExpressionValue, { value: number }> {
  return isPiExpressionValue(value) && value.kind !== 'digital-state';
}

function unwrapPiExpressionValue(value: ParsedExpressionValue): number | string {
  if (!isPiExpressionValue(value)) return value;
  return value.kind === 'digital-state' ? value.name : value.value;
}

function numericExpressionValue(value: ParsedExpressionValue, context = 'A expressão'): number {
  const unwrapped = unwrapPiExpressionValue(value);
  if (typeof unwrapped !== 'number' || !Number.isFinite(unwrapped)) {
    throw new Error(`${context} requer um valor numérico válido.`);
  }
  return unwrapped;
}

function typedNumericResult(kind: Extract<PiExpressionValue, { value: number }>['kind'] | undefined, value: number): ParsedExpressionValue {
  return kind ? { kind, value } : value;
}

export function evaluateCalculation(
  calculation: CalculationDefinition,
  values: ReadonlyMap<string, unknown>,
  peContext?: PeEvaluationContext,
): CalculationEvaluation {
  const expression = calculation.expression.trim();
  if (!expression) {
    return { status: 'error', error: new Error('A expressão está vazia.') };
  }

  let resolvedExpression = expression;
  const variables = new Map<string, ParsedExpressionValue>();
  const inputs = [...(calculation.inputs ?? [])].sort((left, right) => right.name.length - left.name.length);

  if (peContext) resetPeOccurrenceCursor(peContext);
  const now = peContext ? Math.floor(peContext.scan.timestamp / 1000) : Math.floor(Date.now() / 1000);

  for (const [index, input] of inputs.entries()) {
    const key = `__pi_${index}`;
    const value = values.get(input.name);
    if (value === undefined) {
      return { status: 'loading' };
    }

    const piPointValue = value as any;
    const rawValue = piPointValue && typeof piPointValue === 'object' && 'value' in piPointValue ? piPointValue.value : piPointValue;
    
    const state = updateTemporalCache(calculation.id, input.name, piPointValue);
    
    let resolvedExpressionTemp = resolvedExpression;
    resolvedExpressionTemp = applyQualityMacros(resolvedExpressionTemp, input.name, piPointValue);
    resolvedExpressionTemp = applyTemporalMacros(resolvedExpressionTemp, input.name, state);
    
    try {
      resolvedExpressionTemp = applyHistoricalMacros(resolvedExpressionTemp, input.name, calculation.id, input.binding, now, true);
      resolvedExpressionTemp = applyMetadataMacros(resolvedExpressionTemp, input.name, input.binding);
      resolvedExpressionTemp = applyDigitalStateMacros(resolvedExpressionTemp, input.name, input.binding, piPointValue);
      resolvedExpressionTemp = applyAlarmMacros(resolvedExpressionTemp, input.name, input.binding, piPointValue);
    } catch (e: any) {
      if (e.message === 'FETCHING_HISTORY' || e.message === 'FETCHING_METADATA' || e.message === 'FETCHING_DIGITAL_STATES') return { status: 'loading' };
      throw e;
    }

    let rawState: string | undefined;
    if (typeof rawValue !== 'number') {
      rawState = getDigitalStateName(rawValue) ?? String(rawValue);
      variables.set(key, rawState);
    } else {
      if (!Number.isFinite(rawValue)) {
        return { status: 'error', error: new Error(`O PI Point "${input.name}" não possui um valor numérico.`) };
      }
      variables.set(key, rawValue);
    }
    
    resolvedExpression = replaceToken(resolvedExpressionTemp, input.name, key);
  }

  try {
    const value = parseArithmeticExpression(resolvedExpression, variables, peContext);
    return { status: 'success', value: unwrapPiExpressionValue(value) };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error : new Error(String(error)) };
  }
}





function getDigitalStateName(value: unknown): string | undefined {
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

function replaceToken(expression: string, token: string, replacement: string): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Se o usuário digitou 'TAG', token='TAG', replacement='__pi_X' => se quisermos preservar as aspas do template, o regex substitui TAG por __pi_X.
  // Entao 'TAG' se tornará '__pi_X', e se ele digitou TAG, vai virar __pi_X. Ambos sao corretos se tratarmos isso no parsePrimary.
  const tokenRegex = new RegExp(`(?<![A-Za-z0-9_.:])${escaped}(?![A-Za-z0-9_.:])`, 'gi');
  let result = '';
  let cursor = 0;
  const stringRegex = /"(?:\\.|[^"\\])*"/g;
  for (const stringMatch of expression.matchAll(stringRegex)) {
    const start = stringMatch.index ?? 0;
    result += expression.slice(cursor, start).replace(tokenRegex, replacement);
    result += stringMatch[0];
    cursor = start + stringMatch[0].length;
  }
  return result + expression.slice(cursor).replace(tokenRegex, replacement);
}

function parseArithmeticExpression(expression: string, variables: ReadonlyMap<string, ParsedExpressionValue>, peContext?: PeEvaluationContext): ParsedExpressionValue {
  let cursor = 0;

  const skipWhitespace = () => {
    while (/\s/.test(expression[cursor] ?? '')) {
      cursor += 1;
    }
  };
  const matchWord = (word: string): boolean => {
    skipWhitespace();
    const candidate = expression.slice(cursor, cursor + word.length);
    if (candidate.toLocaleUpperCase() !== word) {
      return false;
    }
    const previous = expression[cursor - 1];
    const next = expression[cursor + word.length];
    if ((previous && /[A-Za-z0-9_]/.test(previous)) || (next && /[A-Za-z0-9_]/.test(next))) {
      return false;
    }
    cursor += word.length;
    return true;
  };
  const parsePrimary = (): ParsedExpressionValue => {
    skipWhitespace();
    if (/^IF\b\s*(?!\()/i.test(expression.slice(cursor))) {
      return parseConditional();
    }
    if (expression[cursor] === '(') {
      cursor += 1;
      const value = parseConditional();
      skipWhitespace();
      if (expression[cursor] !== ')') {
        throw new Error('Parênteses não balanceados.');
      }
      cursor += 1;
      return value;
    }
    
    const variableMatch = expression.slice(cursor).match(/^(?:')?(__pi_\d+)(?:')?/);
    if (variableMatch && variableMatch[1]) {
      const variable = variableMatch[1];
      cursor += variableMatch[0].length;
      const value = variables.get(variable);
      if (value === undefined) {
        throw new Error(`Variável desconhecida: ${variable}.`);
      }
      return value;
    }
    // Parser de strings literais duplas
    const doubleStringMatch = expression.slice(cursor).match(/^"(.*?)"/);
    if (doubleStringMatch) {
      cursor += doubleStringMatch[0].length;
      return doubleStringMatch[1];
    }
    
    // Antigo fallback: strings com aspas simples caso não seja variável (__pi_N) e for resolvido no PiTime
    const singleStringMatch = expression.slice(cursor).match(/^'(.*?)'/);
    if (singleStringMatch) {
      cursor += singleStringMatch[0].length;
      return parsePiTime(singleStringMatch[1]);
    }
    
    // Parser de abreviações temporais unquoted (*, t, y)
    const piTimeMatch = expression.slice(cursor).match(/^(t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)(?=[^A-Za-z_0-9]|$)/i);
    if (piTimeMatch) {
      cursor += piTimeMatch[0].length;
      return parsePiTime(piTimeMatch[1]);
    }

    if (expression[cursor] === '*') {
      cursor += 1;
      return parsePiTime('*');
    }
    
    const functionName = expression.slice(cursor).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (functionName) {
      cursor += functionName.length;
      skipWhitespace();
    if (expression[cursor] !== '(') {
        throw new Error(`Função inválida: ${functionName}.`);
      }
      cursor += 1;
      if (functionName.toLocaleUpperCase() === 'CURVE') {
        const x = parseConditional();
        const curvePoints: Array<[number, number]> = [];
        skipWhitespace();
        if (expression[cursor] !== ',') throw new Error('Curve requer x e uma lista de pontos.');
        cursor += 1;
        skipWhitespace();
        while (expression[cursor] === '(') {
          cursor += 1;
          const xPoint = numericExpressionValue(parseConditional(), 'Curve');
          skipWhitespace();
          if (expression[cursor] !== ',') throw new Error('Curve requer pares (x,y).');
          cursor += 1;
          const yPoint = numericExpressionValue(parseConditional(), 'Curve');
          skipWhitespace();
          if (expression[cursor] !== ')') throw new Error('Curve requer pares (x,y).');
          cursor += 1;
          curvePoints.push([xPoint, yPoint]);
          skipWhitespace();
        }
        if (curvePoints.length < 2) throw new Error('Curve requer pelo menos dois pontos.');
        skipWhitespace();
        if (expression[cursor] !== ')') throw new Error('Parênteses não balanceados na função Curve.');
        cursor += 1;
        return evaluateCurve(x, curvePoints);
      }
      const argumentsList: any[] = [];
      skipWhitespace();
      if (expression[cursor] !== ')') {
        while (true) {
          argumentsList.push(parseConditional());
          skipWhitespace();
          if (expression[cursor] !== ',') {
            break;
          }
          cursor += 1;
        }
      }
      skipWhitespace();
      if (expression[cursor] !== ')') {
        throw new Error(`Parênteses não balanceados na função ${functionName}.`);
      }
      cursor += 1;
      return evaluateFunction(functionName, argumentsList, peContext);
    }
    const number = expression.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0];
    if (number) {
      cursor += number.length;
      return Number(number);
    }
    throw new Error(`Expressão inválida próxima de "${expression.slice(cursor, cursor + 12)}".`);
  };
  const parsePower = (): ParsedExpressionValue => {
    let value = parsePrimary();
    skipWhitespace();
    if (expression[cursor] === '^' || expression.slice(cursor, cursor + 2) === '**') {
      const isDouble = expression.slice(cursor, cursor + 2) === '**';
      cursor += isDouble ? 2 : 1;
      const right = parseUnary();
      value = Math.pow(numericExpressionValue(value), numericExpressionValue(right));
    }
    return value;
  };
  const parseUnary = (): ParsedExpressionValue => {
    skipWhitespace();
    if (matchWord('NOT')) {
      return Number(numericExpressionValue(parseUnary()) === 0);
    }
    if (expression[cursor] === '+') { cursor += 1; return numericExpressionValue(parseUnary()); }
    if (expression[cursor] === '-') { cursor += 1; return -numericExpressionValue(parseUnary()); }
    return parsePower();
  };
  const parseMultiplicative = (): ParsedExpressionValue => {
    let value = parseUnary();
    while (true) {
      skipWhitespace();
      const operator = expression[cursor];
      if (operator !== '*' && operator !== '/' && operator !== '%') {
        break;
      }
      cursor += 1;
      const right = parseUnary();
      const valNum = numericExpressionValue(value);
      const rightNum = numericExpressionValue(right);
      if ((operator === '/' || operator === '%') && rightNum === 0) {
        throw new Error('Divisão por zero.');
      }
      value = operator === '*' ? valNum * rightNum : operator === '/' ? valNum / rightNum : valNum % rightNum;
    }
    return value;
  };
  function parseAdditive(): ParsedExpressionValue {
    let value = parseMultiplicative();
    while (true) {
      skipWhitespace();
      const operator = expression[cursor];
      if (operator !== '+' && operator !== '-') {
        break;
      }
      cursor += 1;
      const right = parseMultiplicative();
      value = operator === '+'
        ? numericExpressionValue(value) + numericExpressionValue(right)
        : numericExpressionValue(value) - numericExpressionValue(right);
    }
    return value;
  }

  function parseComparison(): ParsedExpressionValue {
    let value = parseAdditive();
    while (true) {
      skipWhitespace();
      const operator = expression.slice(cursor, cursor + 2);
      if (operator === '<>') {
        break;
      }
      const comparison = operator === '>=' || operator === '<=' ? operator : expression[cursor];
      if (!['>', '<', '>=', '<='].includes(comparison)) {
        break;
      }
      cursor += comparison.length;
      const right = parseAdditive();
      const rawValue = unwrapPiExpressionValue(value);
      const rawRight = unwrapPiExpressionValue(right);
      if (typeof rawValue === 'string' || typeof rawRight === 'string') {
        if (typeof rawValue !== 'string' || typeof rawRight !== 'string') throw new Error('Comparação entre tipos PI incompatíveis.');
        const sValue = rawValue;
        const sRight = rawRight;
        value = comparison === '>' ? Number(sValue.localeCompare(sRight) > 0)
          : comparison === '<' ? Number(sValue.localeCompare(sRight) < 0)
            : comparison === '>=' ? Number(sValue.localeCompare(sRight) >= 0)
              : Number(sValue.localeCompare(sRight) <= 0);
      } else {
        value = comparison === '>' ? Number(numericExpressionValue(value) > numericExpressionValue(right))
          : comparison === '<' ? Number(numericExpressionValue(value) < numericExpressionValue(right))
            : comparison === '>=' ? Number(numericExpressionValue(value) >= numericExpressionValue(right))
              : Number(numericExpressionValue(value) <= numericExpressionValue(right));
      }
    }
    return value;
  }

  function parseEquality(): ParsedExpressionValue {
    let value = parseComparison();
    while (true) {
      skipWhitespace();
      const operator2 = expression.slice(cursor, cursor + 2);
      if (operator2 === '==' || operator2 === '!=' || operator2 === '<>') {
        cursor += 2;
        const right = parseComparison();
        const rawValue = unwrapPiExpressionValue(value);
        const rawRight = unwrapPiExpressionValue(right);
        if (typeof rawValue === 'string' || typeof rawRight === 'string') {
          if (typeof rawValue !== 'string' || typeof rawRight !== 'string') throw new Error('Comparação entre tipos PI incompatíveis.');
          const sValue = rawValue;
          const sRight = rawRight;
          const eq = sValue.localeCompare(sRight, undefined, { sensitivity: 'accent' }) === 0;
          value = Number(operator2 === '==' ? eq : !eq);
        } else {
          const equals = numericExpressionValue(value) === numericExpressionValue(right);
          value = Number(operator2 === '==' ? equals : !equals);
        }
        continue;
      }
      const operator1 = expression[cursor];
      if (operator1 === '=') {
        cursor += 1;
        const right = parseComparison();
        const rawValue = unwrapPiExpressionValue(value);
        const rawRight = unwrapPiExpressionValue(right);
        if (typeof rawValue === 'string' || typeof rawRight === 'string') {
          if (typeof rawValue !== 'string' || typeof rawRight !== 'string') throw new Error('Comparação entre tipos PI incompatíveis.');
          const sValue = rawValue;
          const sRight = rawRight;
          const eq = sValue.localeCompare(sRight, undefined, { sensitivity: 'accent' }) === 0;
          value = Number(eq);
        } else {
          value = Number(numericExpressionValue(value) === numericExpressionValue(right));
        }
        continue;
      }
      break;
    }
    return value;
  }

  function parseLogicalAnd(): ParsedExpressionValue {
    let value = parseEquality();
    while (true) {
      skipWhitespace();
      if (expression.slice(cursor, cursor + 2) === '&&') {
        cursor += 2;
      } else if (!matchWord('AND')) {
        break;
      }
      const right = parseEquality();
      value = Number(Boolean(numericExpressionValue(value)) && Boolean(numericExpressionValue(right)));
    }
    return value;
  }

  function parseLogicalOr(): ParsedExpressionValue {
    let value = parseLogicalAnd();
    while (true) {
      skipWhitespace();
      if (expression.slice(cursor, cursor + 2) === '||') {
        cursor += 2;
      } else if (!matchWord('OR')) {
        break;
      }
      const right = parseLogicalAnd();
      value = Number(Boolean(numericExpressionValue(value)) || Boolean(numericExpressionValue(right)));
    }
    return value;
  }

  function parseConditional(): ParsedExpressionValue {
    skipWhitespace();
    if (!/^IF\b\s*(?!\()/i.test(expression.slice(cursor))) {
      return parseLogicalOr();
    }
    cursor += 2;
    const condition = parseLogicalOr();
    if (!matchWord('THEN')) {
      throw new Error('A expressão IF requer THEN.');
    }
    const whenTrue = parseConditional();
    if (!matchWord('ELSE')) {
      throw new Error('A expressão IF requer ELSE.');
    }
    const whenFalse = parseConditional();
    return numericExpressionValue(condition) !== 0 ? whenTrue : whenFalse;
  }

  const result = parseConditional();
  skipWhitespace();
  if (cursor !== expression.length) {
    throw new Error('A expressão contém tokens inválidos.');
  }
  if (typeof unwrapPiExpressionValue(result) === 'number' && !Number.isFinite(unwrapPiExpressionValue(result) as number)) {
    throw new Error('O resultado não é um número finito.');
  }
  return result;
}

function evaluateCurve(value: ParsedExpressionValue, points: Array<[number, number]>): number {
  const x = numericExpressionValue(value, 'Curve');
  for (let index = 1; index < points.length; index += 1) {
    if (points[index][0] <= points[index - 1][0]) throw new Error('Curve requer pontos x em ordem crescente.');
  }
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
  const index = points.findIndex(([pointX]) => pointX >= x);
  const [x1, y1] = points[index - 1];
  const [x2, y2] = points[index];
  return y1 + (y2 - y1) * ((x - x1) / (x2 - x1));
}


function parsePiTime(str: string): PiExpressionValue {
  return piTimestamp(Math.floor(parsePiTimeMs(str, Date.now()) / 1000));
}

function evaluateFunction(name: string, args: ParsedExpressionValue[], peContext?: PeEvaluationContext): ParsedExpressionValue {
  const normalizedName = name.toLocaleUpperCase();
  
  // Helpers para forçar conversoes numericas localmente apenas para funcoes que precisam
  const getNumValues = () => args.map((argument) => {
    const value = unwrapPiExpressionValue(argument);
    return typeof value === 'string' ? Number(value) : value;
  });
  
  // Retrocompatibilidade: por padrão a maior parte das funções abaixo espera numbers
  const values = getNumValues();

  if (normalizedName === 'DELAY') {
    if (!peContext) throw new Error('Delay requer contexto do PE Scheduler.');
    requireArgumentCount(name, values, 3);
    return evaluatePeDelay(peContext, nextPeOccurrenceId(peContext, name), values[0], values[1], values[2]);
  }

  if (normalizedName === '__PE_TIMESTAMP' || normalizedName === '__PE_TIMESPAN') {
    requireArgumentCount(name, values, 1);
    if (!Number.isFinite(values[0])) throw new Error(`${name} requer um número finito.`);
    return normalizedName === '__PE_TIMESTAMP' ? piTimestamp(values[0]) : piTimespan(values[0]);
  }
  if (normalizedName === '__PE_DIGITAL_STATE') {
    if (args.length < 2 || args.length > 4 || typeof args[0] !== 'string' || typeof args[1] !== 'number' || !Number.isFinite(args[1])) {
      throw new Error('__PE_DIGITAL_STATE requer nome e código numérico finito.');
    }
    if (args[2] !== undefined && typeof args[2] !== 'string') throw new Error('__PE_DIGITAL_STATE requer identidade textual do set.');
    if (args[3] !== undefined && typeof args[3] !== 'string') throw new Error('__PE_DIGITAL_STATE requer nome textual do set.');
    return piDigitalState(args[0], args[1], args[2], args[3]);
  }
  if (normalizedName === 'STATENO') {
    requireArgumentCount(name, args, 1);
    if (!isPiExpressionValue(args[0]) || args[0].kind !== 'digital-state') {
      throw new Error('StateNo requer um valor de estado digital com contexto de PI Point.');
    }
    return args[0].code;
  }
  
  // Funcoes de tempo do PI
  if (['DAY', 'MONTH', 'YEAR', 'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'YEARDAY', 'DAYSEC'].includes(normalizedName)) {
    requireArgumentCount(name, values, 1);
    const date = new Date(values[0] * 1000);
    switch (normalizedName) {
      case 'DAY': return date.getDate();
      case 'MONTH': return date.getMonth() + 1;
      case 'YEAR': return date.getFullYear();
      case 'HOUR': return date.getHours();
      case 'MINUTE': return date.getMinutes();
      case 'SECOND': return date.getSeconds();
      case 'WEEKDAY': return date.getDay() + 1;
      case 'YEARDAY': {
        const start = new Date(date.getFullYear(), 0, 1);
        return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(start.getFullYear(), 0, 1)) / 86400000) + 1;
      }
      case 'DAYSEC': return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
    }
  }

  if (['BOD', 'BOM', 'BONM', 'NOON'].includes(normalizedName)) {
    requireArgumentCount(name, values, 1);
    const date = new Date(values[0] * 1000);
    if (normalizedName === 'BOD') date.setHours(0, 0, 0, 0);
    if (normalizedName === 'BOM') date.setDate(1), date.setHours(0, 0, 0, 0);
    if (normalizedName === 'BONM') date.setMonth(date.getMonth() + 1, 1), date.setHours(0, 0, 0, 0);
    if (normalizedName === 'NOON') date.setHours(12, 0, 0, 0);
    return piTimestamp(Math.floor(date.getTime() / 1000));
  }
  if (normalizedName === 'PARSETIME') {
    requireArgumentCount(name, args, 1);
    if (typeof args[0] !== 'string') throw new Error('ParseTime requer uma string de tempo.');
    return piTimestamp(parsePiTimeMs(args[0], Date.now()) / 1000);
  }

  if (normalizedName === 'IF' || normalizedName === 'SE') {
    requireArgumentCount(name, values, 3);
    return values[0] !== 0 ? values[1] : values[2];
  }
  if (normalizedName === 'MIN' || normalizedName === 'MAX' || normalizedName === 'AVG' || normalizedName === 'MEDIAN') {
    const candidates = args.filter((value) => typeof value === 'number' || isPiTemporalExpressionValue(value));
    const minimum = normalizedName === 'MEDIAN' ? 3 : 1;
    if (candidates.length < minimum) throw new Error(`${name} requer ao menos ${minimum} argumento${minimum > 1 ? 's' : ''} numérico, temporal ou de período.`);
    const kind = isPiTemporalExpressionValue(candidates[0]) ? candidates[0].kind : undefined;
    if (candidates.some((value) => (isPiTemporalExpressionValue(value) ? value.kind : undefined) !== kind)) {
      throw new Error(`${name} requer argumentos PI da mesma categoria.`);
    }
    const numericCandidates = candidates.map((value) => numericExpressionValue(value, name));
    if (normalizedName === 'MIN') return typedNumericResult(kind, Math.min(...numericCandidates));
    if (normalizedName === 'MAX') return typedNumericResult(kind, Math.max(...numericCandidates));
    if (normalizedName === 'AVG') return typedNumericResult(kind, numericCandidates.reduce((sum, value) => sum + value, 0) / numericCandidates.length);
    const sorted = [...numericCandidates].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return typedNumericResult(kind, sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]);
  }
  if (normalizedName === 'SUM' || normalizedName === 'TOTAL') {
    requireMinimumArgumentCount(name, values, 1);
    return values.reduce((a, b) => a + b, 0);
  }
  if (normalizedName === 'AVERAGE') {
    requireMinimumArgumentCount(name, values, 1);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  if (normalizedName === 'COUNT') {
    return values.length;
  }
  if (normalizedName === 'VARIANCE') {
    requireMinimumArgumentCount(name, values, 1);
    if (values.length === 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length - 1);
  }
  if (normalizedName === 'PSTDEV' || normalizedName === 'SSTDEV') {
    const candidates = args.filter((value) => typeof value === 'number' || isPiTemporalExpressionValue(value));
    if (candidates.length < 1) throw new Error(`${name} requer ao menos um argumento numérico ou temporal.`);
    const kind = isPiTemporalExpressionValue(candidates[0]) ? candidates[0].kind : undefined;
    if (candidates.some((value) => (isPiTemporalExpressionValue(value) ? value.kind : undefined) !== kind)) {
      throw new Error(`${name} requer argumentos PI da mesma categoria.`);
    }
    const numericCandidates = candidates.map((value) => numericExpressionValue(value, name));
    if (numericCandidates.length === 1) return typedNumericResult(kind, 0);
    const mean = numericCandidates.reduce((sum, value) => sum + value, 0) / numericCandidates.length;
    const divisor = normalizedName === 'PSTDEV' ? numericCandidates.length : numericCandidates.length - 1;
    return typedNumericResult(kind, Math.sqrt(numericCandidates.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / divisor));
  }
  if (normalizedName === 'STDDEV') {
    requireMinimumArgumentCount(name, values, 1);
    if (values.length === 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length - 1));
  }
  if (normalizedName === 'ABS') {
    requireArgumentCount(name, values, 1);
    return Math.abs(values[0]);
  }
  if (normalizedName === 'ROUND' && name === 'ROUND') {
    if (values.length < 1 || values.length > 2) {
      throw new Error('A função ROUND aceita um ou dois argumentos.');
    }
    const decimals = values[1] ?? 0;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 15) {
      throw new Error('O número de casas decimais em ROUND deve estar entre 0 e 15.');
    }
    const factor = 10 ** decimals;
    return Math.round(values[0] * factor) / factor;
  }
  if (normalizedName === 'ROUND') {
    if (args.length < 1 || args.length > 2) throw new Error('Round aceita valor e unidade opcional.');
    const value = args[0];
    const unit = args[1] ?? (isPiTemporalExpressionValue(value) ? { kind: value.kind, value: 1 } : 1);
    const kind = isPiTemporalExpressionValue(value) ? value.kind : undefined;
    if ((isPiTemporalExpressionValue(unit) ? unit.kind : undefined) !== kind) throw new Error('Round requer unidade da mesma categoria PI do valor.');
    const numericUnit = numericExpressionValue(unit, 'Round');
    if (numericUnit <= 0) throw new Error('Round requer unidade positiva.');
    return typedNumericResult(kind, Math.floor(numericExpressionValue(value, 'Round') / numericUnit + 0.5) * numericUnit);
  }
  if (normalizedName === 'CLAMP') {
    requireArgumentCount(name, values, 3);
    return Math.min(Math.max(values[0], values[1]), values[2]);
  }
  if (normalizedName === 'AND') {
    requireMinimumArgumentCount(name, values, 1);
    return Number(values.every((value) => value !== 0));
  }
  if (normalizedName === 'OR') {
    requireMinimumArgumentCount(name, values, 1);
    return Number(values.some((value) => value !== 0));
  }
  if (normalizedName === 'NOT') {
    requireArgumentCount(name, values, 1);
    return Number(values[0] === 0);
  }
  if (normalizedName === 'POW' || normalizedName === 'POWER') {
    requireArgumentCount(name, values, 2);
    return Math.pow(values[0], values[1]);
  }
  if (normalizedName === 'SQRT') {
    requireArgumentCount(name, values, 1);
    if (values[0] < 0) {
      throw new Error('Raiz quadrada de número negativo.');
    }
    return Math.sqrt(values[0]);
  }
  if (normalizedName === 'SQR') {
    requireArgumentCount(name, values, 1);
    if (values[0] < 0) {
      throw new Error('Raiz quadrada de número negativo.');
    }
    return Math.sqrt(values[0]);
  }
  if (normalizedName === 'EXP') {
    requireArgumentCount(name, values, 1);
    return Math.exp(values[0]);
  }
  if (normalizedName === 'LOG' || normalizedName === 'LN') {
    requireArgumentCount(name, values, 1);
    if (values[0] <= 0) {
      throw new Error('Logaritmo de número não positivo.');
    }
    return Math.log(values[0]);
  }
  if (normalizedName === 'LOG10') {
    requireArgumentCount(name, values, 1);
    if (values[0] <= 0) {
      throw new Error('Logaritmo de número não positivo.');
    }
    return Math.log10(values[0]);
  }
  if (normalizedName === 'MOD') {
    requireArgumentCount(name, values, 2);
    if (values[1] === 0) {
      throw new Error('Divisão por zero em MOD.');
    }
    return values[0] % values[1];
  }
  if (normalizedName === 'SIN') {
    requireArgumentCount(name, values, 1);
    return Math.sin(values[0]);
  }
  if (normalizedName === 'COS') {
    requireArgumentCount(name, values, 1);
    return Math.cos(values[0]);
  }
  if (normalizedName === 'TAN') {
    requireArgumentCount(name, values, 1);
    return Math.tan(values[0]);
  }
  if (normalizedName === 'ASIN') {
    requireArgumentCount(name, values, 1);
    if (values[0] < -1 || values[0] > 1) throw new Error('ASIN requer valor entre -1 e 1.');
    return Math.asin(values[0]);
  }
  if (normalizedName === 'ACOS') {
    requireArgumentCount(name, values, 1);
    if (values[0] < -1 || values[0] > 1) throw new Error('ACOS requer valor entre -1 e 1.');
    return Math.acos(values[0]);
  }
  if (normalizedName === 'ATAN' || normalizedName === 'ATN') {
    requireArgumentCount(name, values, 1);
    return Math.atan(values[0]);
  }
  if (normalizedName === 'FLOOR') {
    requireArgumentCount(name, values, 1);
    return Math.floor(values[0]);
  }
  if (normalizedName === 'CEIL') {
    requireArgumentCount(name, values, 1);
    return Math.ceil(values[0]);
  }
  if (normalizedName === 'SIGN' || normalizedName === 'SGN') {
    requireArgumentCount(name, values, 1);
    return Math.sign(values[0]);
  }
  if (normalizedName === 'TRUNC') {
    if (args.length < 1 || args.length > 2) throw new Error('Trunc aceita valor e unidade opcional.');
    const value = args[0];
    const unit = args[1] ?? (isPiTemporalExpressionValue(value) ? { kind: value.kind, value: 1 } : 1);
    const kind = isPiTemporalExpressionValue(value) ? value.kind : undefined;
    if ((isPiTemporalExpressionValue(unit) ? unit.kind : undefined) !== kind) throw new Error('Trunc requer unidade da mesma categoria PI do valor.');
    const numericUnit = numericExpressionValue(unit, 'Trunc');
    if (numericUnit <= 0) throw new Error('Trunc requer unidade positiva.');
    return typedNumericResult(kind, Math.floor(numericExpressionValue(value, 'Trunc') / numericUnit) * numericUnit);
  }
  if (normalizedName === 'ATAN2' || normalizedName === 'ATN2') {
    requireArgumentCount(name, values, 2);
    return Math.atan2(values[0], values[1]);
  }
  if (normalizedName === 'SINH') {
    requireArgumentCount(name, values, 1);
    return Math.sinh(values[0]);
  }
  if (normalizedName === 'COSH') {
    requireArgumentCount(name, values, 1);
    return Math.cosh(values[0]);
  }
  if (normalizedName === 'TANH') {
    requireArgumentCount(name, values, 1);
    return Math.tanh(values[0]);
  }
  if (normalizedName === 'INT') {
    requireArgumentCount(name, values, 1);
    if (!Number.isFinite(values[0])) throw new Error('INT requer um número válido.');
    return Math.trunc(values[0]);
  }
  if (normalizedName === 'FRAC') {
    requireArgumentCount(name, values, 1);
    if (!Number.isFinite(values[0])) throw new Error('FRAC requer um número válido.');
    return values[0] - Math.trunc(values[0]);
  }
  if (normalizedName === 'FLOAT') {
    requireArgumentCount(name, args, 1);
    if (typeof args[0] !== 'number' && typeof args[0] !== 'string') {
      throw new Error('FLOAT requer um número ou uma string numérica.');
    }
    const value = typeof args[0] === 'string' ? args[0].trim() : args[0];
    if (value === '') throw new Error('FLOAT requer uma string numérica não vazia.');
    const result = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(result)) throw new Error('FLOAT requer uma string numérica.');
    return result;
  }
  if (normalizedName === 'PI') {
    return Math.PI;
  }
  if (normalizedName === 'DEGREES') {
    requireArgumentCount(name, values, 1);
    return values[0] * (180 / Math.PI);
  }
  if (normalizedName === 'RADIANS') {
    requireArgumentCount(name, values, 1);
    return values[0] * (Math.PI / 180);
  }
  if (normalizedName === 'PERCENTILE') {
    // Percentile(val1, val2, val3, percentual)
    if (values.length < 2) throw new Error('PERCENTILE precisa de valores e do percentual no último argumento.');
    const percent = values.pop()!;
    if (percent < 0 || percent > 100) throw new Error('PERCENTILE precisa de percentual entre 0 e 100.');
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percent / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
  if (normalizedName === 'MAD') {
    requireMinimumArgumentCount(name, values, 1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + Math.abs(b - mean), 0) / values.length;
  }
  if (normalizedName === 'CV') {
    requireMinimumArgumentCount(name, values, 1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;
    const stddev = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length - 1 || 1));
    return (stddev / mean) * 100; // Porcentagem
  }
  if (normalizedName === 'RANGE') {
    requireMinimumArgumentCount(name, values, 1);
    return Math.max(...values) - Math.min(...values);
  }
  if (normalizedName === 'TIME_DIFF') {
    requireArgumentCount(name, values, 2);
    // Presume unix timestamps (s) ou ms
    return Math.abs(values[0] - values[1]);
  }

  if (normalizedName === 'STRING') {
    requireArgumentCount(name, args, 1);
    return piStringValue(args[0]);
  }
  if (normalizedName === 'TEXT') {
    requireMinimumArgumentCount(name, args, 1);
    return args.map(piStringValue).join('');
  }
  if (normalizedName === 'FORMAT') {
    if (args.length < 2 || args.length > 3) throw new Error('FORMAT requer número, formato e tipo opcional (R ou I).');
    if (typeof args[1] !== 'string') throw new Error('FORMAT requer uma string de formato.');
    return formatPiNumber(args[0], args[1], args[2]);
  }
  if (normalizedName === 'POLY') {
    requireMinimumArgumentCount(name, values, 2);
    if (values.some((value) => !Number.isFinite(value))) throw new Error('POLY requer x e coeficientes numéricos válidos.');
    const x = values[0];
    return values.slice(1).reduce((result, coefficient, power) => result + coefficient * x ** power, 0);
  }
  if (normalizedName === 'DIGTEXT') {
    throw new Error('DigText requer o Digital State Set do PI Point, que não é exposto pelo datasource atual.');
  }

  // Funções de Strings
  if (normalizedName === 'CONCAT') {
    if (name !== 'CONCAT') {
      requireMinimumArgumentCount(name, args, 2);
      if (args.some((value) => typeof value !== 'string')) throw new Error('Concat requer duas ou mais strings.');
      return (args as string[]).join('');
    }
    return args.map((value) => piStringValue(value)).join('');
  }
  if (normalizedName === 'UCASE') {
    requireArgumentCount(name, args, 1);
    return String(args[0]).toUpperCase();
  }
  if (normalizedName === 'LCASE') {
    requireArgumentCount(name, args, 1);
    return String(args[0]).toLowerCase();
  }
  if (normalizedName === 'LEN') {
    requireArgumentCount(name, args, 1);
    return String(args[0]).length;
  }
  if (normalizedName === 'LEFT' || normalizedName === 'RIGHT') {
    requireArgumentCount(name, args, 2);
    const count = Number(args[1]);
    if (!Number.isInteger(count) || count < 0 || count > 999) throw new Error(`${name} requer uma quantidade inteira entre 0 e 999.`);
    const text = String(args[0]);
    return normalizedName === 'LEFT' ? text.slice(0, count) : count === 0 ? '' : text.slice(-count);
  }
  if (normalizedName === 'MID') {
    if (args.length < 2 || args.length > 3) throw new Error('MID requer string, posição e comprimento opcional.');
    const start = Number(args[1]);
    const length = args.length === 3 ? Number(args[2]) : 999;
    if (!Number.isInteger(start) || start < 1 || !Number.isInteger(length) || length < 0 || length > 999) {
      throw new Error('MID requer posição a partir de 1 e comprimento entre 0 e 999.');
    }
    return String(args[0]).slice(start - 1, start - 1 + length);
  }
  if (normalizedName === 'LTRIM' || normalizedName === 'RTRIM') {
    requireArgumentCount(name, args, 1);
    return normalizedName === 'LTRIM' ? String(args[0]).replace(/^\s+/, '') : String(args[0]).replace(/\s+$/, '');
  }
  if (normalizedName === 'INSTR') {
    if (args.length < 2 || args.length > 4) throw new Error('INSTR aceita [start,] string1, string2 [,casesen].');
    const hasStart = typeof args[0] === 'number' && args.length >= 3;
    const start = hasStart ? Number(args[0]) : 1;
    const first = hasStart ? args[1] : args[0];
    const second = hasStart ? args[2] : args[1];
    const caseSensitivity = args.length === (hasStart ? 4 : 3) ? args[hasStart ? 3 : 2] : 0;
    if (!Number.isInteger(start) || start < 0) throw new Error('INSTR requer posição inicial não negativa.');
    if (typeof first !== 'string' || typeof second !== 'string') throw new Error('INSTR requer duas strings.');
    if (typeof caseSensitivity !== 'number' || (caseSensitivity !== 0 && caseSensitivity !== 1)) {
      throw new Error('INSTR requer casesen igual a 0 ou 1.');
    }
    const caseSensitive = caseSensitivity === 1;
    const haystack = caseSensitive ? first : first.toLocaleLowerCase();
    const needle = caseSensitive ? second : second.toLocaleLowerCase();
    const index = haystack.indexOf(needle, Math.max(0, start - 1));
    return index < 0 ? 0 : index + 1;
  }
  if (normalizedName === 'ASCII') {
    requireArgumentCount(name, args, 1);
    if (typeof args[0] !== 'string') throw new Error('ASCII requer uma string.');
    const text = args[0];
    if (text.length === 0) throw new Error('ASCII requer uma string não vazia.');
    return text.charCodeAt(0);
  }
  if (normalizedName === 'CHAR') {
    requireMinimumArgumentCount(name, args, 1);
    return args.map((value) => {
      if (typeof value !== 'number') throw new Error('CHAR requer códigos numéricos ASCII.');
      if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('CHAR requer códigos ASCII entre 0 e 255.');
      return String.fromCharCode(value);
    }).join('');
  }
  if (normalizedName === 'COMPARE') {
    if (args.length < 2 || args.length > 3) throw new Error('COMPARE requer duas strings e casesen opcional.');
    const [first, pattern] = args;
    const caseSensitivity = args.length === 3 ? args[2] : 0;
    if (typeof first !== 'string' || typeof pattern !== 'string') throw new Error('COMPARE requer duas strings.');
    if (typeof caseSensitivity !== 'number' || (caseSensitivity !== 0 && caseSensitivity !== 1)) {
      throw new Error('COMPARE requer casesen igual a 0 ou 1.');
    }
    const caseSensitive = caseSensitivity === 1;
    const escape = (value: string) => value.replace(/[.+^${}()|[\]\\*?]/g, '\\$&');
    const regex = new RegExp(`^${escape(pattern).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`, caseSensitive ? '' : 'i');
    return regex.test(first) ? 1 : 0;
  }
  if (normalizedName === 'CONTAINS') {
    requireArgumentCount(name, args, 2);
    return String(args[0]).includes(String(args[1])) ? 1 : 0;
  }
  if (normalizedName === 'STARTS_WITH') {
    requireArgumentCount(name, args, 2);
    return String(args[0]).startsWith(String(args[1])) ? 1 : 0;
  }
  if (normalizedName === 'ENDS_WITH') {
    requireArgumentCount(name, args, 2);
    return String(args[0]).endsWith(String(args[1])) ? 1 : 0;
  }
  if (normalizedName === 'UPPER') {
    requireArgumentCount(name, args, 1);
    return String(args[0]).toUpperCase();
  }
  if (normalizedName === 'LOWER') {
    requireArgumentCount(name, args, 1);
    return String(args[0]).toLowerCase();
  }
  if (normalizedName === 'TRIM') {
    requireArgumentCount(name, args, 1);
    return String(args[0]).trim();
  }
  if (normalizedName === 'LENGTH') {
    requireArgumentCount(name, args, 1);
    return String(args[0]).length;
  }
  if (normalizedName === 'SUBSTRING') {
    requireArgumentCount(name, args, 3);
    const text = String(args[0]);
    const start = Math.max(0, Number(args[1]) - 1); // PI Vision is 1-indexed for substring
    const length = Number(args[2]);
    return text.substring(start, start + length);
  }

  if (normalizedName === 'WHILE') {
    throw new Error('WHILE não é suportado em cálculos, pois a expressão precisa sempre terminar. Use IF para condições.');
  }
  
  if (['TIMEEQ', 'TIMEGT', 'TIMELT', 'VALUEATTIME', 'PREVVAL', 'MOVING_AVERAGE', 'MOVING_MIN', 'MOVING_MAX', 'MOVING_STDDEV', 'MOVINGAVERAGE', 'MOVINGMINIMUM', 'MOVINGMAXIMUM'].includes(normalizedName)) {
    throw new Error(`A função ${name} requer uma referência válida de PI Point (entre aspas simples) no primeiro argumento e conectividade com o servidor histórico.`);
  }
  if (['ARMA', 'IMPULSE', 'MEDIANFILT', 'DELAY', 'ISDST', 'NOOUTPUT', 'ALMACKSTAT', 'ALMCONDITION', 'ALMCONDTEXT', 'ALMPRIORITY'].includes(normalizedName)) {
    throw new Error(`Função PI não implementada: ${name}.`);
  }
  throw new Error(`Função desconhecida: ${name}.`);
}

function piStringValue(value: unknown): string {
  if (value === undefined || value === null) throw new Error('STRING/TEXT não aceita valor ausente.');
  if (typeof value === 'object') throw new Error('STRING/TEXT requer o valor escalar do PI Point, não o objeto PiPointValue.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('STRING/TEXT requer um valor finito.');
  return String(value);
}

function formatPiNumber(value: unknown, format: string, numberType: unknown): string {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error('FORMAT requer um número finito.');
  const type = numberType === undefined ? 'R' : String(numberType).toUpperCase();
  if (type !== 'R' && type !== 'I') throw new Error('FORMAT aceita tipo numérico R ou I.');
  const match = format.match(/^%([-+0 ]*)(\d+)?(?:\.(\d+))?([diuoxXfFeEgG])$/);
  if (!match) throw new Error('FORMAT suporta somente uma especificação C numérica simples (%[flags][width][.precision][diuoxXfFeEgG]).');
  const [, flag, widthText, precisionText, conversion] = match;
  if (type === 'I' && !'diuoxX'.includes(conversion)) throw new Error('FORMAT tipo I requer conversão inteira.');
  if (type === 'R' && 'diuoxX'.includes(conversion)) throw new Error('FORMAT tipo R requer conversão real.');

  let result: string;
  const precision = precisionText === undefined ? undefined : Number(precisionText);
  if ('diuoxX'.includes(conversion)) {
    const integer = Math.trunc(number);
    if (conversion === 'o') result = Math.abs(integer).toString(8);
    else if (conversion === 'x' || conversion === 'X') result = Math.abs(integer).toString(16);
    else result = Math.abs(integer).toString(10);
    if (conversion === 'X') result = result.toUpperCase();
    if (precision !== undefined) result = result.padStart(precision, '0');
    if (integer < 0) result = `-${result}`;
  } else {
    const digits = precision === undefined ? 6 : precision;
    if (conversion.toLowerCase() === 'f') result = number.toFixed(digits);
    else if (conversion === 'e' || conversion === 'E') result = number.toExponential(digits);
    else {
      result = number.toPrecision(precision ?? 6);
      if (!/[eE]/.test(result)) result = result.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    }
    if (conversion === conversion.toUpperCase()) result = result.toUpperCase();
  }
  if (number >= 0 && (flag.includes('+') || flag.includes(' '))) result = `${flag.includes('+') ? '+' : ' '}${result}`;
  const width = widthText === undefined ? 0 : Number(widthText);
  if (width > result.length) {
    const padding = '0'.repeat(width - result.length);
    if (flag.includes('-')) {
      result = `${result}${' '.repeat(width - result.length)}`;
    } else if (flag.includes('0') && /^[+-]/.test(result)) {
      result = `${result[0]}${padding}${result.slice(1)}`;
    } else {
      result = `${flag.includes('0') ? padding : ' '.repeat(width - result.length)}${result}`;
    }
  }
  return result;
}

function requireArgumentCount(name: string, values: readonly unknown[], expected: number): void {
  if (values.length !== expected) {
    throw new Error(`A função ${name} requer ${expected} argumentos.`);
  }
}

function requireMinimumArgumentCount(name: string, values: readonly unknown[], minimum: number): void {
  if (values.length < minimum) {
    throw new Error(`A função ${name} requer ao menos ${minimum} argumento.`);
  }
}
