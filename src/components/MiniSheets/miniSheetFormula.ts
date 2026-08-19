/**
 * MiniSheets Formula Parser and Evaluator.
 *
 * Supported syntax:
 * - Simple literals: numbers or strings
 * - Basic arithmetic: =A1+B1, =A1-B1, =A1*B1, =A1/B1 (with parentheses and standard operator precedence)
 * - Basic aggregation: =SUM(A1:A10), =AVERAGE(A1:A10), =MIN(A1:A10), =MAX(A1:A10)
 * - PI DataLink functions:
 *     =PICurrVal("TAG")
 *     =PIArcVal("TAG", "*-1h")
 *     =PICompDat("TAG", "*-1h", "*")
 *     =PISampDat("TAG", "*-1h", "*", "5m")
 *
 * Cell references: Column A-T (0-19), Row 1-50 (0-49)
 * Cell Coordinate: { row: number, col: number } (0-indexed)
 */

export interface CellCoord {
  row: number;
  col: number;
}

export type ParsedFormula =
  | { type: 'literal_number'; value: number }
  | { type: 'literal_string'; value: string }
  | {
      type: 'pi_curr_val';
      tag: string;
    }
  | {
      type: 'pi_arc_val';
      tag: string;
      timeExpression: string;
    }
  | {
      type: 'pi_comp_dat';
      tag: string;
      startTime: string;
      endTime: string;
    }
  | {
      type: 'pi_samp_dat';
      tag: string;
      startTime: string;
      endTime: string;
      interval: string;
    }
  | {
      type: 'math_expression';
      expression: string;
      referencedCells: CellCoord[];
    }
  | {
      type: 'aggregate';
      func: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX';
      range: { start: CellCoord; end: CellCoord };
      referencedCells: CellCoord[];
    };

export function colIndexToLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function colLetterToIndex(colLetter: string): number {
  let index = 0;
  const upper = colLetter.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1;
}

export function parseCellAddress(address: string): CellCoord | null {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(address.trim());
  if (!match) {
    return null;
  }
  const col = colLetterToIndex(match[1]);
  const row = parseInt(match[2], 10) - 1;
  if (col < 0 || row < 0) {
    return null;
  }
  return { col, row };
}

export function formatCellAddress(coord: CellCoord): string {
  return `${colIndexToLetter(coord.col)}${coord.row + 1}`;
}

export function getRangeCells(start: CellCoord, end: CellCoord): CellCoord[] {
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);

  const cells: CellCoord[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/**
 * Tokenizes formula arguments respecting strings and parentheses.
 */
function parseFunctionArguments(argsStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let parenDepth = 0;

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
      }
      current += char;
    } else if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if (char === ',' && parenDepth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    args.push(current.trim());
  }
  return args;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parses a cell input text or formula.
 */
export function parseFormula(input: string): ParsedFormula | { type: 'error'; error: string } {
  const trimmed = input.trim();
  if (!trimmed.startsWith('=')) {
    const num = Number(trimmed);
    if (!isNaN(num) && trimmed !== '') {
      return { type: 'literal_number', value: num };
    }
    return { type: 'literal_string', value: input };
  }

  const formulaBody = trimmed.slice(1).trim();

  // Match PI Functions: =PICurrVal(...), =PIArcVal(...), =PICompDat(...), =PISampDat(...)
  const piMatch = /^([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/.exec(formulaBody);
  if (piMatch) {
    const funcName = piMatch[1].toUpperCase();
    const rawArgs = parseFunctionArguments(piMatch[2]);

    if (funcName === 'PICURRVAL') {
      if (rawArgs.length < 1 || !rawArgs[0]) {
        return { type: 'error', error: '#FORMULA!' };
      }
      return {
        type: 'pi_curr_val',
        tag: stripQuotes(rawArgs[0]),
      };
    }

    if (funcName === 'PIARCVAL') {
      if (rawArgs.length < 2 || !rawArgs[0] || !rawArgs[1]) {
        return { type: 'error', error: '#FORMULA!' };
      }
      return {
        type: 'pi_arc_val',
        tag: stripQuotes(rawArgs[0]),
        timeExpression: stripQuotes(rawArgs[1]),
      };
    }

    if (funcName === 'PICOMPDAT') {
      if (rawArgs.length < 3 || !rawArgs[0] || !rawArgs[1] || !rawArgs[2]) {
        return { type: 'error', error: '#FORMULA!' };
      }
      return {
        type: 'pi_comp_dat',
        tag: stripQuotes(rawArgs[0]),
        startTime: stripQuotes(rawArgs[1]),
        endTime: stripQuotes(rawArgs[2]),
      };
    }

    if (funcName === 'PISAMPDAT') {
      if (rawArgs.length < 4 || !rawArgs[0] || !rawArgs[1] || !rawArgs[2] || !rawArgs[3]) {
        return { type: 'error', error: '#FORMULA!' };
      }
      return {
        type: 'pi_samp_dat',
        tag: stripQuotes(rawArgs[0]),
        startTime: stripQuotes(rawArgs[1]),
        endTime: stripQuotes(rawArgs[2]),
        interval: stripQuotes(rawArgs[3]),
      };
    }

    if (['SUM', 'AVERAGE', 'MIN', 'MAX'].includes(funcName)) {
      if (rawArgs.length !== 1) {
        return { type: 'error', error: '#FORMULA!' };
      }
      const rangeParts = rawArgs[0].split(':');
      if (rangeParts.length !== 2) {
        return { type: 'error', error: '#FORMULA!' };
      }
      const startCoord = parseCellAddress(rangeParts[0]);
      const endCoord = parseCellAddress(rangeParts[1]);
      if (!startCoord || !endCoord) {
        return { type: 'error', error: '#REF!' };
      }
      return {
        type: 'aggregate',
        func: funcName as 'SUM' | 'AVERAGE' | 'MIN' | 'MAX',
        range: { start: startCoord, end: endCoord },
        referencedCells: getRangeCells(startCoord, endCoord),
      };
    }
  }

  // General arithmetic formula with cell references (e.g. =A1+B1, =A1*(B2-C3)/2)
  const cellRefRegex = /\b([A-Za-z]+[0-9]+)\b/g;
  const referencedCells: CellCoord[] = [];
  let match: RegExpExecArray | null;
  let hasInvalidRef = false;

  while ((match = cellRefRegex.exec(formulaBody)) !== null) {
    const coord = parseCellAddress(match[1]);
    if (!coord) {
      hasInvalidRef = true;
    } else {
      referencedCells.push(coord);
    }
  }

  if (hasInvalidRef) {
    return { type: 'error', error: '#REF!' };
  }

  return {
    type: 'math_expression',
    expression: formulaBody,
    referencedCells,
  };
}

/**
 * Evaluates an arithmetic expression given cell values map or function.
 */
export function evaluateMathExpression(
  expression: string,
  getCellValue: (coord: CellCoord) => number | string | undefined,
  maxCol = 20,
  maxRow = 50,
): { status: 'success'; value: number } | { status: 'error'; error: string } {
  // Replace cell tokens with their numeric values
  let resolved = expression;
  const cellRefRegex = /\b([A-Za-z]+[0-9]+)\b/g;
  let refMatch: RegExpExecArray | null;
  const matchedTokens: string[] = [];

  while ((refMatch = cellRefRegex.exec(expression)) !== null) {
    matchedTokens.push(refMatch[1]);
  }

  // Sort longest first to avoid partial replacements
  matchedTokens.sort((a, b) => b.length - a.length);

  const variables = new Map<string, number>();
  for (let i = 0; i < matchedTokens.length; i++) {
    const token = matchedTokens[i];
    const coord = parseCellAddress(token);
    if (!coord || coord.col < 0 || coord.col >= maxCol || coord.row < 0 || coord.row >= maxRow) {
      return { status: 'error', error: '#REF!' };
    }
    const rawVal = getCellValue(coord);
    if (typeof rawVal === 'string') {
      if (rawVal.startsWith('#')) {
        return { status: 'error', error: rawVal };
      }
      const num = Number(rawVal);
      if (isNaN(num)) {
        return { status: 'error', error: '#VALUE!' };
      }
      variables.set(`__cell_${i}`, num);
    } else if (typeof rawVal === 'number') {
      variables.set(`__cell_${i}`, rawVal);
    } else if (rawVal === undefined || rawVal === null || rawVal === '') {
      variables.set(`__cell_${i}`, 0);
    } else {
      return { status: 'error', error: '#VALUE!' };
    }

    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    resolved = resolved.replace(new RegExp(`\\b${escaped}\\b`, 'g'), `__cell_${i}`);
  }

  try {
    const num = parseArithmeticExpression(resolved, variables);
    return { status: 'success', value: num };
  } catch (err: any) {
    if (err?.message === 'Divisão por zero.') {
      return { status: 'error', error: '#DIV/0!' };
    }
    return { status: 'error', error: '#FORMULA!' };
  }
}

/**
 * Evaluates aggregation functions: SUM, AVERAGE, MIN, MAX over a range of cells.
 */
export function evaluateAggregate(
  func: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX',
  rangeCells: CellCoord[],
  getCellValue: (coord: CellCoord) => number | string | undefined,
  maxCol = 20,
  maxRow = 50,
): { status: 'success'; value: number } | { status: 'error'; error: string } {
  const numbers: number[] = [];

  for (const coord of rangeCells) {
    if (coord.col < 0 || coord.col >= maxCol || coord.row < 0 || coord.row >= maxRow) {
      return { status: 'error', error: '#REF!' };
    }
    const val = getCellValue(coord);
    if (typeof val === 'string') {
      if (val.startsWith('#')) {
        return { status: 'error', error: val };
      }
      const num = Number(val);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    } else if (typeof val === 'number') {
      numbers.push(val);
    }
  }

  if (numbers.length === 0) {
    return { status: 'success', value: 0 };
  }

  switch (func) {
    case 'SUM': {
      const sum = numbers.reduce((acc, n) => acc + n, 0);
      return { status: 'success', value: sum };
    }
    case 'AVERAGE': {
      const sum = numbers.reduce((acc, n) => acc + n, 0);
      return { status: 'success', value: sum / numbers.length };
    }
    case 'MIN': {
      return { status: 'success', value: Math.min(...numbers) };
    }
    case 'MAX': {
      return { status: 'success', value: Math.max(...numbers) };
    }
  }
}

/**
 * Safe Recursive Descent Parser for arithmetic expressions without eval() or new Function().
 */
function parseArithmeticExpression(
  expression: string,
  variables: ReadonlyMap<string, number>,
): number {
  let cursor = 0;

  const skipWhitespace = () => {
    while (/\s/.test(expression[cursor] ?? '')) {
      cursor++;
    }
  };

  const parsePrimary = (): number => {
    skipWhitespace();
    if (expression[cursor] === '(') {
      cursor++;
      const value = parseAdditive();
      skipWhitespace();
      if (expression[cursor] !== ')') {
        throw new Error('Parênteses não balanceados.');
      }
      cursor++;
      return value;
    }
    const variable = expression.slice(cursor).match(/^__cell_\d+/)?.[0];
    if (variable) {
      cursor += variable.length;
      const value = variables.get(variable);
      if (value === undefined) {
        throw new Error(`Variável desconhecida: ${variable}.`);
      }
      return value;
    }
    const numberMatch = expression
      .slice(cursor)
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0];
    if (numberMatch) {
      cursor += numberMatch.length;
      return Number(numberMatch);
    }
    throw new Error(`Expressão inválida próxima de "${expression.slice(cursor, cursor + 12)}".`);
  };

  const parseUnary = (): number => {
    skipWhitespace();
    if (expression[cursor] === '+') {
      cursor++;
      return parseUnary();
    }
    if (expression[cursor] === '-') {
      cursor++;
      return -parseUnary();
    }
    return parsePrimary();
  };

  const parseMultiplicative = (): number => {
    let value = parseUnary();
    while (true) {
      skipWhitespace();
      const op = expression[cursor];
      if (op !== '*' && op !== '/') {
        break;
      }
      cursor++;
      const right = parseUnary();
      if (op === '/' && right === 0) {
        throw new Error('Divisão por zero.');
      }
      value = op === '*' ? value * right : value / right;
    }
    return value;
  };

  const parseAdditive = (): number => {
    let value = parseMultiplicative();
    while (true) {
      skipWhitespace();
      const op = expression[cursor];
      if (op !== '+' && op !== '-') {
        break;
      }
      cursor++;
      const right = parseMultiplicative();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };

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
