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

  const result = parseAdditive();
  skipWhitespace();
  if (cursor !== expression.length) {
    throw new Error('A expressão contém tokens inválidos.');
  }
  if (!Number.isFinite(result)) {
    throw new Error('O resultado não é um número finito.');
  }
  return result;
}
