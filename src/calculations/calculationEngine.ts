import type { PiPointBinding } from '../pi/piPointBinding';

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
  | { status: 'success'; value: number }
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
  const variables = new Map<string, number>();
  const inputs = [...(calculation.inputs ?? [])].sort((left, right) => right.name.length - left.name.length);

  for (const [index, input] of inputs.entries()) {
    const key = `__pi_${index}`;
    const value = values.get(input.name);
    if (value === undefined) {
      return { status: 'loading' };
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { status: 'error', error: new Error(`O PI Point "${input.name}" não possui um valor numérico.`) };
    }
    variables.set(key, value);
    resolvedExpression = replaceToken(resolvedExpression, input.name, key);
  }

  try {
    return { status: 'success', value: parseArithmeticExpression(resolvedExpression, variables) };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error : new Error(String(error)) };
  }
}

function replaceToken(expression: string, token: string, replacement: string): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return expression.replace(new RegExp(`(?<![A-Za-z0-9_.:-])${escaped}(?![A-Za-z0-9_.:-])`, 'gi'), replacement);
}

function parseArithmeticExpression(expression: string, variables: ReadonlyMap<string, number>): number {
  let cursor = 0;

  const skipWhitespace = () => {
    while (/\s/.test(expression[cursor] ?? '')) {
      cursor += 1;
    }
  };
  const parsePrimary = (): number => {
    skipWhitespace();
    if (expression[cursor] === '(') {
      cursor += 1;
      const value = parseAdditive();
      skipWhitespace();
      if (expression[cursor] !== ')') {
        throw new Error('Parênteses não balanceados.');
      }
      cursor += 1;
      return value;
    }
    const variable = expression.slice(cursor).match(/^__pi_\d+/)?.[0];
    if (variable) {
      cursor += variable.length;
      const value = variables.get(variable);
      if (value === undefined) {
        throw new Error(`Variável desconhecida: ${variable}.`);
      }
      return value;
    }
    // Parser de strings
    const stringMatch = expression.slice(cursor).match(/^(["'])(.*?)\1/);
    if (stringMatch) {
      cursor += stringMatch[0].length;
      return parsePiTime(stringMatch[2]);
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
      const argumentsList: number[] = [];
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
  const parseUnary = (): number => {
    skipWhitespace();
    if (expression[cursor] === '+') { cursor += 1; return parseUnary(); }
    if (expression[cursor] === '-') { cursor += 1; return -parseUnary(); }
    return parsePrimary();
  };
  const parseMultiplicative = (): number => {
    let value = parseUnary();
    while (true) {
      skipWhitespace();
      const operator = expression[cursor];
      if (operator !== '*' && operator !== '/') {
        break;
      }
      cursor += 1;
      const right = parseUnary();
      if (operator === '/' && right === 0) {
        throw new Error('Divisão por zero.');
      }
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  function parseAdditive(): number {
    let value = parseMultiplicative();
    while (true) {
      skipWhitespace();
      const operator = expression[cursor];
      if (operator !== '+' && operator !== '-') {
        break;
      }
      cursor += 1;
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseComparison(): number {
    let value = parseAdditive();
    while (true) {
      skipWhitespace();
      const operator = expression.slice(cursor, cursor + 2);
      const comparison = operator === '>=' || operator === '<=' ? operator : expression[cursor];
      if (!['>', '<', '>=', '<='].includes(comparison)) {
        break;
      }
      cursor += comparison.length;
      const right = parseAdditive();
      value = comparison === '>' ? Number(value > right)
        : comparison === '<' ? Number(value < right)
          : comparison === '>=' ? Number(value >= right)
            : Number(value <= right);
    }
    return value;
  }

  function parseEquality(): number {
    let value = parseComparison();
    while (true) {
      skipWhitespace();
      const operator = expression.slice(cursor, cursor + 2);
      if (operator !== '==' && operator !== '!=') {
        break;
      }
      cursor += 2;
      const right = parseComparison();
      value = Number(operator === '==' ? value === right : value !== right);
    }
    return value;
  }

  function parseLogicalAnd(): number {
    let value = parseEquality();
    while (true) {
      skipWhitespace();
      if (expression.slice(cursor, cursor + 2) !== '&&') {
        break;
      }
      cursor += 2;
      value = Number(Boolean(value) && Boolean(parseEquality()));
    }
    return value;
  }

  function parseLogicalOr(): number {
    let value = parseLogicalAnd();
    while (true) {
      skipWhitespace();
      if (expression.slice(cursor, cursor + 2) !== '||') {
        break;
      }
      cursor += 2;
      value = Number(Boolean(value) || Boolean(parseLogicalAnd()));
    }
    return value;
  }

  const result = parseLogicalOr();
  skipWhitespace();
  if (cursor !== expression.length) {
    throw new Error('A expressão contém tokens inválidos.');
  }
  if (!Number.isFinite(result)) {
    throw new Error('O resultado não é um número finito.');
  }
  return result;
}


function parsePiTime(str: string): number {
  const lower = str.toLowerCase();
  const now = new Date();
  switch (lower) {
    case '*':
      return Math.floor(now.getTime() / 1000);
    case 't':
    case 'today':
      return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
    case 'y':
    case 'yesterday':
      return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime() / 1000);
    default:
      // Pode adicionar fallback para parsing mais avancado depois se quiser
      return Math.floor(now.getTime() / 1000);
  }
}

function evaluateFunction(name: string, values: number[]): number {
  const normalizedName = name.toLocaleUpperCase();
  
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
  if (normalizedName === 'MIN') {
    requireMinimumArgumentCount(name, values, 1);
    return Math.min(...values);
  }
  if (normalizedName === 'MAX') {
    requireMinimumArgumentCount(name, values, 1);
    return Math.max(...values);
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
  if (normalizedName === 'WHILE') {
    throw new Error('WHILE não é suportado em cálculos, pois a expressão precisa sempre terminar. Use IF para condições.');
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
