import type { PiPointBinding } from '../pi/piPointBinding';
import { applyQualityMacros, applyTemporalMacros, applyHistoricalMacros, updateTemporalCache, parsePiTimeMs } from './calculationMacros';

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
}

export type CalculationEvaluation =
  | { status: 'success'; value: number | string }
  | { status: 'loading' }
  | { status: 'error'; error: Error };

export function evaluateCalculation(
  calculation: CalculationDefinition,
  values: ReadonlyMap<string, unknown>,
): CalculationEvaluation {
  const expression = calculation.expression.trim();
  if (!expression) {
    return { status: 'error', error: new Error('A expressão está vazia.') };
  }

  let resolvedExpression = expression;
  const variables = new Map<string, number | string>();
  const inputs = [...(calculation.inputs ?? [])].sort((left, right) => right.name.length - left.name.length);

  const now = Math.floor(Date.now() / 1000);

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
      resolvedExpressionTemp = applyHistoricalMacros(resolvedExpressionTemp, input.name, calculation.id, input.binding, now);
    } catch (e: any) {
      if (e.message === 'FETCHING_HISTORY') return { status: 'loading' };
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
    const value = parseArithmeticExpression(resolvedExpression, variables);
    return { status: 'success', value: value };
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
  return expression.replace(new RegExp(`(?<![A-Za-z0-9_.:])${escaped}(?![A-Za-z0-9_.:])`, 'gi'), replacement);
}

function parseArithmeticExpression(expression: string, variables: ReadonlyMap<string, number | string>): number | string {
  let cursor = 0;

  const skipWhitespace = () => {
    while (/\s/.test(expression[cursor] ?? '')) {
      cursor += 1;
    }
  };
  const parsePrimary = (): number | string => {
    skipWhitespace();
    if (expression[cursor] === '(') {
      cursor += 1;
      const value = parseLogicalOr();
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
      const argumentsList: any[] = [];
      skipWhitespace();
      if (expression[cursor] !== ')') {
        while (true) {
          argumentsList.push(parseLogicalOr());
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
      return evaluateFunction(functionName, argumentsList);
    }
    const number = expression.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0];
    if (number) {
      cursor += number.length;
      return Number(number);
    }
    throw new Error(`Expressão inválida próxima de "${expression.slice(cursor, cursor + 12)}".`);
  };
  const parsePower = (): number | string => {
    let value = parsePrimary();
    skipWhitespace();
    if (expression[cursor] === '^' || expression.slice(cursor, cursor + 2) === '**') {
      const isDouble = expression.slice(cursor, cursor + 2) === '**';
      cursor += isDouble ? 2 : 1;
      const right = parseUnary();
      value = Math.pow(Number(value), Number(right));
    }
    return value;
  };
  const parseUnary = (): number | string => {
    skipWhitespace();
    if (expression[cursor] === '+') { cursor += 1; return Number(parseUnary()); }
    if (expression[cursor] === '-') { cursor += 1; return -Number(parseUnary()); }
    return parsePower();
  };
  const parseMultiplicative = (): number | string => {
    let value = parseUnary();
    while (true) {
      skipWhitespace();
      const operator = expression[cursor];
      if (operator !== '*' && operator !== '/' && operator !== '%') {
        break;
      }
      cursor += 1;
      const right = parseUnary();
      const valNum = Number(value);
      const rightNum = Number(right);
      if ((operator === '/' || operator === '%') && rightNum === 0) {
        throw new Error('Divisão por zero.');
      }
      value = operator === '*' ? valNum * rightNum : operator === '/' ? valNum / rightNum : valNum % rightNum;
    }
    return value;
  };
  function parseAdditive(): number | string {
    let value = parseMultiplicative();
    while (true) {
      skipWhitespace();
      const operator = expression[cursor];
      if (operator !== '+' && operator !== '-') {
        break;
      }
      cursor += 1;
      const right = parseMultiplicative();
      value = operator === '+' ? Number(value) + Number(right) : Number(value) - Number(right);
    }
    return value;
  }

  function parseComparison(): number | string {
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
      if (typeof value === 'string' || typeof right === 'string') {
        const sValue = String(value);
        const sRight = String(right);
        value = comparison === '>' ? Number(sValue.localeCompare(sRight) > 0)
          : comparison === '<' ? Number(sValue.localeCompare(sRight) < 0)
            : comparison === '>=' ? Number(sValue.localeCompare(sRight) >= 0)
              : Number(sValue.localeCompare(sRight) <= 0);
      } else {
        value = comparison === '>' ? Number(value > right)
          : comparison === '<' ? Number(value < right)
            : comparison === '>=' ? Number(value >= right)
              : Number(value <= right);
      }
    }
    return value;
  }

  function parseEquality(): number | string {
    let value = parseComparison();
    while (true) {
      skipWhitespace();
      const operator2 = expression.slice(cursor, cursor + 2);
      if (operator2 === '==' || operator2 === '!=' || operator2 === '<>') {
        cursor += 2;
        const right = parseComparison();
        if (typeof value === 'string' || typeof right === 'string') {
          const sValue = String(value);
          const sRight = String(right);
          const eq = sValue.localeCompare(sRight, undefined, { sensitivity: 'accent' }) === 0;
          value = Number(operator2 === '==' ? eq : !eq);
        } else {
          value = Number(operator2 === '==' ? value === right : value !== right);
        }
        continue;
      }
      const operator1 = expression[cursor];
      if (operator1 === '=') {
        cursor += 1;
        const right = parseComparison();
        if (typeof value === 'string' || typeof right === 'string') {
          const sValue = String(value);
          const sRight = String(right);
          const eq = sValue.localeCompare(sRight, undefined, { sensitivity: 'accent' }) === 0;
          value = Number(eq);
        } else {
          value = Number(value === right);
        }
        continue;
      }
      break;
    }
    return value;
  }

  function parseLogicalAnd(): number | string {
    let value = parseEquality();
    while (true) {
      skipWhitespace();
      if (expression.slice(cursor, cursor + 2) !== '&&') {
        break;
      }
      cursor += 2;
      value = Number(Boolean(Number(value)) && Boolean(Number(parseEquality())));
    }
    return value;
  }

  function parseLogicalOr(): number | string {
    let value = parseLogicalAnd();
    while (true) {
      skipWhitespace();
      if (expression.slice(cursor, cursor + 2) !== '||') {
        break;
      }
      cursor += 2;
      value = Number(Boolean(Number(value)) || Boolean(Number(parseLogicalAnd())));
    }
    return value;
  }

  const result = parseLogicalOr();
  skipWhitespace();
  if (cursor !== expression.length) {
    throw new Error('A expressão contém tokens inválidos.');
  }
  if (typeof result === 'number' && !Number.isFinite(result)) {
    throw new Error('O resultado não é um número finito.');
  }
  return result;
}


function parsePiTime(str: string): number {
  return Math.floor(parsePiTimeMs(str, Date.now()) / 1000);
}

function evaluateFunction(name: string, args: any[]): number | string {
  const normalizedName = name.toLocaleUpperCase();
  
  // Helpers para forçar conversoes numericas localmente apenas para funcoes que precisam
  const getNumValues = () => args.map(a => typeof a === 'string' ? Number(a) : a);
  
  // Retrocompatibilidade: por padrão a maior parte das funções abaixo espera numbers
  const values = getNumValues();
  
  // Funcoes de tempo do PI
  if (['DAY', 'MONTH', 'YEAR', 'HOUR', 'MINUTE', 'SECOND'].includes(normalizedName)) {
    requireArgumentCount(name, values, 1);
    const date = new Date(values[0] * 1000);
    switch (normalizedName) {
      case 'DAY': return date.getDate();
      case 'MONTH': return date.getMonth() + 1;
      case 'YEAR': return date.getFullYear();
      case 'HOUR': return date.getHours();
      case 'MINUTE': return date.getMinutes();
      case 'SECOND': return date.getSeconds();
    }
  }

  if (normalizedName === 'IF' || normalizedName === 'SE') {
    requireArgumentCount(name, values, 3);
    return values[0] !== 0 ? values[1] : values[2];
  }
  if (normalizedName === 'MIN' || normalizedName === 'MINIMUM') {
    requireMinimumArgumentCount(name, values, 1);
    return Math.min(...values);
  }
  if (normalizedName === 'MAX' || normalizedName === 'MAXIMUM') {
    requireMinimumArgumentCount(name, values, 1);
    return Math.max(...values);
  }
  if (normalizedName === 'SUM' || normalizedName === 'TOTAL') {
    requireMinimumArgumentCount(name, values, 1);
    return values.reduce((a, b) => a + b, 0);
  }
  if (normalizedName === 'AVG' || normalizedName === 'AVERAGE') {
    requireMinimumArgumentCount(name, values, 1);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  if (normalizedName === 'COUNT') {
    return values.length;
  }
  if (normalizedName === 'MEDIAN') {
    requireMinimumArgumentCount(name, values, 1);
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  if (normalizedName === 'VARIANCE') {
    requireMinimumArgumentCount(name, values, 1);
    if (values.length === 1) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length - 1);
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
  if (normalizedName === 'ROUND') {
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
    return values[0] * values[0];
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
  if (normalizedName === 'ATAN') {
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
  if (normalizedName === 'SIGN') {
    requireArgumentCount(name, values, 1);
    return Math.sign(values[0]);
  }
  if (normalizedName === 'TRUNC') {
    requireArgumentCount(name, values, 1);
    return Math.trunc(values[0]);
  }
  if (normalizedName === 'ATAN2') {
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

  // Funções de Strings
  if (normalizedName === 'CONCAT') {
    return args.join('');
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
  throw new Error(`Função desconhecida: ${name}.`);
}

function requireArgumentCount(name: string, values: number[], expected: number): void {
  if (values.length !== expected) {
    throw new Error(`A função ${name} requer ${expected} argumentos.`);
  }
}

function requireMinimumArgumentCount(name: string, values: number[], minimum: number): void {
  if (values.length < minimum) {
    throw new Error(`A função ${name} requer ao menos ${minimum} argumento.`);
  }
}
