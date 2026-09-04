import {
  parsePiTime,
  parseIntervalToMs,
  formatDateTime,
} from '../miniSheetTime';
import {
  parseFormula,
  evaluateMathExpression,
  evaluateAggregate,
  parseCellAddress,
  formatCellAddress,
  colIndexToLetter,
  colLetterToIndex,
} from '../miniSheetFormula';

describe('miniSheetTime', () => {
  it('parses * as now', () => {
    const now = 1700000000000;
    expect(parsePiTime('*', now)).toBe(now);
  });

  it('parses relative time offsets correctly', () => {
    const now = 1700000000000;
    expect(parsePiTime('*-30s', now)).toBe(now - 30 * 1000);
    expect(parsePiTime('*-15m', now)).toBe(now - 15 * 60 * 1000);
    expect(parsePiTime('*-1h', now)).toBe(now - 3600 * 1000);
    expect(parsePiTime('*-8h', now)).toBe(now - 8 * 3600 * 1000);
    expect(parsePiTime('*-1d', now)).toBe(now - 86400 * 1000);
    expect(parsePiTime('*-7d', now)).toBe(now - 7 * 86400 * 1000);
  });

  it('parses intervals to ms', () => {
    expect(parseIntervalToMs('5m')).toBe(5 * 60 * 1000);
    expect(parseIntervalToMs('10s')).toBe(10 * 1000);
    expect(parseIntervalToMs('1h')).toBe(3600 * 1000);
  });

  it('parses absolute Brazilian and ISO dates correctly', () => {
    const expected = new Date(2026, 7, 25, 9, 0, 0).getTime();
    expect(parsePiTime('25/08/2026 09:00')).toBe(expected);
    expect(parsePiTime('25/08/2026 09:00:00')).toBe(expected);
    expect(parsePiTime('25-08-2026 09:00')).toBe(expected);
    expect(parsePiTime('2026-08-25 09:00:00')).toBe(expected);
    expect(parsePiTime('2026-08-25T09:00:00')).toBe(expected);

    const dateOnly = new Date(2026, 7, 25, 0, 0, 0).getTime();
    expect(parsePiTime('25/08/2026')).toBe(dateOnly);
    expect(parsePiTime('2026-08-25')).toBe(dateOnly);
  });

  it('parses today (t) and yesterday (y) offsets correctly', () => {
    const now = new Date(2026, 7, 25, 14, 30, 0).getTime();
    const todayMidnight = new Date(2026, 7, 25, 0, 0, 0).getTime();
    const yesterdayMidnight = new Date(2026, 7, 24, 0, 0, 0).getTime();

    expect(parsePiTime('t', now)).toBe(todayMidnight);
    expect(parsePiTime('today', now)).toBe(todayMidnight);
    expect(parsePiTime('t+8h', now)).toBe(todayMidnight + 8 * 3600 * 1000);
    expect(parsePiTime('y', now)).toBe(yesterdayMidnight);
    expect(parsePiTime('yesterday', now)).toBe(yesterdayMidnight);
    expect(parsePiTime('y+8h', now)).toBe(yesterdayMidnight + 8 * 3600 * 1000);
  });

  it('formats timestamp to Brazilian/standard format', () => {
    const ts = new Date(2026, 7, 19, 7, 5, 0).getTime();
    expect(formatDateTime(ts)).toBe('19/08/2026 07:05:00');
  });
});

describe('miniSheetFormula', () => {
  it('converts between column letters and indices', () => {
    expect(colIndexToLetter(0)).toBe('A');
    expect(colIndexToLetter(19)).toBe('T');
    expect(colLetterToIndex('A')).toBe(0);
    expect(colLetterToIndex('T')).toBe(19);
    expect(parseCellAddress('A1')).toEqual({ col: 0, row: 0 });
    expect(parseCellAddress('B5')).toEqual({ col: 1, row: 4 });
    expect(formatCellAddress({ col: 0, row: 0 })).toBe('A1');
  });

  it('parses literal text and numbers', () => {
    expect(parseFormula('Temperatura')).toEqual({ type: 'literal_string', value: 'Temperatura' });
    expect(parseFormula('123.45')).toEqual({ type: 'literal_number', value: 123.45 });
  });

  it('parses PICurrVal and PIArcVal', () => {
    expect(parseFormula('=PICurrVal("LFS_RB2_TAG")')).toEqual({
      type: 'pi_curr_val',
      tag: 'LFS_RB2_TAG',
      referencedCells: [],
    });
    expect(parseFormula('=PIArcVal("LFS_RB2_MOTOR_TEMP", "*-1h")')).toEqual({
      type: 'pi_arc_val',
      tag: 'LFS_RB2_MOTOR_TEMP',
      timeExpression: '*-1h',
      mode: undefined,
      referencedCells: [],
    });
  });

  it('parses PICompDat and PISampDat', () => {
    expect(parseFormula('=PICompDat("LFS_RB2_TAG", "*-1h", "*")')).toEqual({
      type: 'pi_comp_dat',
      tag: 'LFS_RB2_TAG',
      startTime: '*-1h',
      endTime: '*',
      maxCount: undefined,
      showTimestamp: true,
      referencedCells: [],
    });
    expect(parseFormula('=PISampDat("LFS_RB2_TAG", "*-1h", "*", "5m")')).toEqual({
      type: 'pi_samp_dat',
      tag: 'LFS_RB2_TAG',
      startTime: '*-1h',
      endTime: '*',
      interval: '5m',
      showTimestamp: true,
      referencedCells: [],
    });
  });

  it('parses basic arithmetic and aggregations', () => {
    expect(parseFormula('=A1+B1')).toEqual({
      type: 'math_expression',
      expression: 'A1+B1',
      referencedCells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
    });

    const sumParsed = parseFormula('=SUM(A1:A5)');
    expect(sumParsed).toMatchObject({
      type: 'aggregate',
      func: 'SUM',
      range: {
        start: { col: 0, row: 0 },
        end: { col: 0, row: 4 },
      },
    });
  });

  it('evaluates math expressions with cell getters', () => {
    const cells: Record<string, number> = {
      '0,0': 10, // A1
      '1,0': 20, // B1
      '2,0': 5,  // C1
    };
    const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];

    expect(evaluateMathExpression('A1+B1', getVal)).toEqual({ status: 'success', value: 30 });
    expect(evaluateMathExpression('A1*B1 - C1', getVal)).toEqual({ status: 'success', value: 195 });
    expect(evaluateMathExpression('B1/A1', getVal)).toEqual({ status: 'success', value: 2 });
    expect(evaluateMathExpression('2+3*4', getVal)).toEqual({ status: 'success', value: 14 });
    expect(evaluateMathExpression('(A1+B1)*C1', getVal)).toEqual({ status: 'success', value: 150 });
    expect(evaluateMathExpression('A1^2', getVal)).toEqual({ status: 'success', value: 100 });
  });

  it('evaluates aggregates correctly', () => {
    const cells: Record<string, number> = {
      '0,0': 10,
      '0,1': 20,
      '0,2': 30,
      '0,3': 40,
    };
    const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
    const rangeCells = [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: 2 },
      { col: 0, row: 3 },
    ];

    expect(evaluateAggregate('SUM', rangeCells, getVal)).toEqual({ status: 'success', value: 100 });
    expect(evaluateAggregate('AVERAGE', rangeCells, getVal)).toEqual({ status: 'success', value: 25 });
    expect(evaluateAggregate('MIN', rangeCells, getVal)).toEqual({ status: 'success', value: 10 });
    expect(evaluateAggregate('MAX', rangeCells, getVal)).toEqual({ status: 'success', value: 40 });
    expect(evaluateMathExpression('SUM(A1:A4)+2', getVal)).toEqual({ status: 'success', value: 102 });
    expect(evaluateMathExpression('AVERAGE(A1:A4)*2', getVal)).toEqual({ status: 'success', value: 50 });
  });

  it('handles errors gracefully: #REF!, #FORMULA!, #DIV/0!', () => {
    expect(parseFormula('=SUM(INVALID)')).toEqual({ type: 'error', error: '#FORMULA!' });
    expect(evaluateMathExpression('A1/0', () => 10)).toEqual({ status: 'error', error: '#DIV/0!' });
  });

  describe('Math Functions: ABS, ROUND, SQRT, INT, MOD', () => {
    const noCell = (_coord: any) => undefined;

    it('ABS: returns absolute value for positive and negative numbers', () => {
      expect(evaluateMathExpression('ABS(-10)', noCell)).toEqual({ status: 'success', value: 10 });
      expect(evaluateMathExpression('ABS(10)', noCell)).toEqual({ status: 'success', value: 10 });
      expect(evaluateMathExpression('ABS(0)', noCell)).toEqual({ status: 'success', value: 0 });
    });

    it('ABS: works with cell references (=ABS(A1-B1))', () => {
      const cells: Record<string, number> = { '0,0': 3, '1,0': 8 }; // A1=3, B1=8
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('ABS(A1-B1)', getVal)).toEqual({ status: 'success', value: 5 });
    });

    it('ROUND: rounds to specified decimal places', () => {
      expect(evaluateMathExpression('ROUND(10.456, 2)', noCell)).toEqual({ status: 'success', value: 10.46 });
      expect(evaluateMathExpression('ROUND(10.454, 2)', noCell)).toEqual({ status: 'success', value: 10.45 });
      expect(evaluateMathExpression('ROUND(10.5, 0)', noCell)).toEqual({ status: 'success', value: 11 });
      expect(evaluateMathExpression('ROUND(-2.5, 0)', noCell)).toEqual({ status: 'success', value: -2 });
    });

    it('ROUND: rounds to 0 decimal places when second argument is omitted', () => {
      expect(evaluateMathExpression('ROUND(10.456)', noCell)).toEqual({ status: 'success', value: 10 });
      expect(evaluateMathExpression('ROUND(10.5)', noCell)).toEqual({ status: 'success', value: 11 });
    });

    it('ROUND: rounds to negative decimal places (Excel-compatible)', () => {
      // ROUND(1234, -2) → 1200
      expect(evaluateMathExpression('ROUND(1234, -2)', noCell)).toEqual({ status: 'success', value: 1200 });
    });

    it('SQRT: returns square root for non-negative numbers', () => {
      expect(evaluateMathExpression('SQRT(25)', noCell)).toEqual({ status: 'success', value: 5 });
      expect(evaluateMathExpression('SQRT(0)', noCell)).toEqual({ status: 'success', value: 0 });
      expect(evaluateMathExpression('SQRT(2)', noCell)).toEqual({ status: 'success', value: Math.sqrt(2) });
    });

    it('SQRT: returns #VALUE! for negative numbers', () => {
      expect(evaluateMathExpression('SQRT(-1)', noCell)).toEqual({ status: 'error', error: '#VALUE!' });
      expect(evaluateMathExpression('SQRT(-100)', noCell)).toEqual({ status: 'error', error: '#VALUE!' });
    });

    it('INT: truncates towards negative infinity (floor)', () => {
      expect(evaluateMathExpression('INT(10.9)', noCell)).toEqual({ status: 'success', value: 10 });
      expect(evaluateMathExpression('INT(10.1)', noCell)).toEqual({ status: 'success', value: 10 });
      expect(evaluateMathExpression('INT(-10.1)', noCell)).toEqual({ status: 'success', value: -11 });
      expect(evaluateMathExpression('INT(5)', noCell)).toEqual({ status: 'success', value: 5 });
    });

    it('MOD: returns remainder (same sign as divisor, Excel-compatible)', () => {
      expect(evaluateMathExpression('MOD(10, 3)', noCell)).toEqual({ status: 'success', value: 1 });
      expect(evaluateMathExpression('MOD(10, 5)', noCell)).toEqual({ status: 'success', value: 0 });
      expect(evaluateMathExpression('MOD(-7, 3)', noCell)).toEqual({ status: 'success', value: 2 });
    });

    it('MOD: returns #DIV/0! when divisor is zero', () => {
      expect(evaluateMathExpression('MOD(10, 0)', noCell)).toEqual({ status: 'error', error: '#DIV/0!' });
    });

    it('MOD: returns #FORMULA! when second argument is omitted', () => {
      expect(evaluateMathExpression('MOD(10)', noCell)).toEqual({ status: 'error', error: '#FORMULA!' });
    });

    it('functions can be composed and mixed with arithmetic', () => {
      expect(evaluateMathExpression('ABS(-3) + SQRT(9)', noCell)).toEqual({ status: 'success', value: 6 });
      expect(evaluateMathExpression('ROUND(SQRT(2), 4)', noCell)).toEqual({ status: 'success', value: 1.4142 });
      expect(evaluateMathExpression('INT(10.9) * 2', noCell)).toEqual({ status: 'success', value: 20 });
    });

    it('functions work inside larger expressions with cell references', () => {
      const cells: Record<string, number> = { '0,0': -5, '1,0': 16 }; // A1=-5, B1=16
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('ABS(A1)', getVal)).toEqual({ status: 'success', value: 5 });
      expect(evaluateMathExpression('SQRT(B1)', getVal)).toEqual({ status: 'success', value: 4 });
      expect(evaluateMathExpression('ABS(A1) + SQRT(B1)', getVal)).toEqual({ status: 'success', value: 9 });
      expect(evaluateMathExpression('ROUND(B1 / 3, 2)', getVal)).toEqual({ status: 'success', value: 5.33 });
    });

    it('unknown functions return #FORMULA!', () => {
      expect(evaluateMathExpression('TESTE(10)', noCell)).toEqual({ status: 'error', error: '#FORMULA!' });
      expect(evaluateMathExpression('XYZ()', noCell)).toEqual({ status: 'error', error: '#FORMULA!' });
    });

    it('cell reference containing non-numeric value returns #VALUE! in SQRT', () => {
      const getVal = (_coord: any) => 'ABC'; // non-numeric cell
      // Cell ref to string → evaluateMathExpression returns #VALUE! before parseArithmeticExpression
      expect(evaluateMathExpression('A1', getVal)).toEqual({ status: 'error', error: '#VALUE!' });
    });

    it('parseFormula routes math functions to math_expression type', () => {
      expect(parseFormula('=ABS(-10)')).toMatchObject({ type: 'math_expression', expression: 'ABS(-10)' });
      expect(parseFormula('=ROUND(3.5,0)')).toMatchObject({ type: 'math_expression', expression: 'ROUND(3.5,0)' });
      expect(parseFormula('=SQRT(16)')).toMatchObject({ type: 'math_expression', expression: 'SQRT(16)' });
      expect(parseFormula('=INT(9.9)')).toMatchObject({ type: 'math_expression', expression: 'INT(9.9)' });
      expect(parseFormula('=MOD(10,3)')).toMatchObject({ type: 'math_expression', expression: 'MOD(10,3)' });
    });
  });

  describe('Logical Functions: IF and IFERROR', () => {
    const noCell = (_coord: any) => undefined;

    // ─── IF: numeric condition and numeric return values ────────────────────
    it('IF: simple numeric condition, returns number for true branch', () => {
      expect(evaluateMathExpression('IF(10>5,100,0)', noCell)).toEqual({ status: 'success', value: 100 });
      expect(evaluateMathExpression('IF(3>5,100,0)', noCell)).toEqual({ status: 'success', value: 0 });
    });

    it('IF: returns text strings from branches', () => {
      expect(evaluateMathExpression('IF(10>5,"OK","ERRO")', noCell)).toEqual({ status: 'success', value: 'OK' });
      expect(evaluateMathExpression('IF(3>5,"OK","ERRO")', noCell)).toEqual({ status: 'success', value: 'ERRO' });
    });

    it('IF: all comparison operators', () => {
      expect(evaluateMathExpression('IF(5>=5,1,0)', noCell)).toEqual({ status: 'success', value: 1 });
      expect(evaluateMathExpression('IF(5<=4,1,0)', noCell)).toEqual({ status: 'success', value: 0 });
      expect(evaluateMathExpression('IF(5=5,1,0)', noCell)).toEqual({ status: 'success', value: 1 });
      expect(evaluateMathExpression('IF(5<>5,1,0)', noCell)).toEqual({ status: 'success', value: 0 });
      expect(evaluateMathExpression('IF(3<5,1,0)', noCell)).toEqual({ status: 'success', value: 1 });
    });

    it('IF: cell reference as condition operand', () => {
      const cells: Record<string, number> = { '0,0': 150, '1,0': 50 }; // A1=150, B1=50
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('IF(A1>100,"ALTO","NORMAL")', getVal)).toEqual({ status: 'success', value: 'ALTO' });
      expect(evaluateMathExpression('IF(B1>100,"ALTO","NORMAL")', getVal)).toEqual({ status: 'success', value: 'NORMAL' });
    });

    it('IF: cell reference in return branch', () => {
      const cells: Record<string, number> = { '0,0': 120, '1,0': 999, '2,0': 0 }; // A1=120, B1=999, C1=0
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      // IF(A1>100,B1,C1) → B1=999
      expect(evaluateMathExpression('IF(A1>100,B1,C1)', getVal)).toEqual({ status: 'success', value: 999 });
      // IF(A1<100,B1,C1) → C1=0
      expect(evaluateMathExpression('IF(A1<100,B1,C1)', getVal)).toEqual({ status: 'success', value: 0 });
    });

    it('IF: string equality comparison with cell', () => {
      const cells: Record<string, string | number> = { '0,0': 'ATENCAO' }; // A1="ATENCAO"
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`] as string | number | undefined;
      expect(evaluateMathExpression('IF(A1="ATENCAO","sim","nao")', getVal)).toEqual({ status: 'success', value: 'sim' });
      expect(evaluateMathExpression('IF(A1="NORMAL","sim","nao")', getVal)).toEqual({ status: 'success', value: 'nao' });
    });

    it('IF: arithmetic expression in return branch', () => {
      const cells: Record<string, number> = { '0,0': 10, '1,0': 20 }; // A1=10, B1=20
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      // IF(A1>5, A1*2, 0) → 20
      expect(evaluateMathExpression('IF(A1>5,A1*2,0)', getVal)).toEqual({ status: 'success', value: 20 });
      // IF(A1>50, A1*2, 0) → 0
      expect(evaluateMathExpression('IF(A1>50,A1*2,0)', getVal)).toEqual({ status: 'success', value: 0 });
    });

    it('IF: nested IF in true branch', () => {
      const cells: Record<string, number> = { '0,0': 85 }; // A1=85
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      // IF(A1>100,"CRITICO", IF(A1>70,"ATENCAO","NORMAL"))
      expect(evaluateMathExpression('IF(A1>100,"CRITICO",IF(A1>70,"ATENCAO","NORMAL"))', getVal))
        .toEqual({ status: 'success', value: 'ATENCAO' });
    });

    it('IF: nested IF - critical branch', () => {
      const cells: Record<string, number> = { '0,0': 110 }; // A1=110
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('IF(A1>100,"CRITICO",IF(A1>70,"ATENCAO","NORMAL"))', getVal))
        .toEqual({ status: 'success', value: 'CRITICO' });
    });

    it('IF: nested IF - normal branch', () => {
      const cells: Record<string, number> = { '0,0': 30 }; // A1=30
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('IF(A1>100,"CRITICO",IF(A1>70,"ATENCAO","NORMAL"))', getVal))
        .toEqual({ status: 'success', value: 'NORMAL' });
    });

    it('IF: simulates PI tag comparison (static cell value)', () => {
      // Simulates: =IF(PICurrVal("TAG")>50,"ALTO","NORMAL")
      // The cell that holds the PI value is evaluated as a numeric cell ref
      const cells: Record<string, number> = { '0,0': 75 }; // A1 holds the PI value
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('IF(A1>50,"ALTO","NORMAL")', getVal))
        .toEqual({ status: 'success', value: 'ALTO' });
    });

    it('IF: missing else branch returns 0', () => {
      // Excel: IF(condition, true) without false → FALSE (0)
      expect(evaluateMathExpression('IF(5>10,99)', noCell)).toEqual({ status: 'success', value: 0 });
    });

    it('IF: wrong number of arguments returns #FORMULA!', () => {
      expect(evaluateMathExpression('IF()', noCell)).toEqual({ status: 'error', error: '#FORMULA!' });
      expect(evaluateMathExpression('IF(1>0)', noCell)).toEqual({ status: 'error', error: '#FORMULA!' });
    });

    // ─── IFERROR ────────────────────────────────────────────────────────────
    it('IFERROR: returns fallback value on #DIV/0! error', () => {
      expect(evaluateMathExpression('IFERROR(10/0,0)', noCell)).toEqual({ status: 'success', value: 0 });
      expect(evaluateMathExpression('IFERROR(10/0,"ERR")', noCell)).toEqual({ status: 'success', value: 'ERR' });
    });

    it('IFERROR: returns the expression result when no error', () => {
      expect(evaluateMathExpression('IFERROR(10/2,0)', noCell)).toEqual({ status: 'success', value: 5 });
      expect(evaluateMathExpression('IFERROR(42,0)', noCell)).toEqual({ status: 'success', value: 42 });
    });

    it('IFERROR: catches #FORMULA! from invalid formula', () => {
      const cells: Record<string, number> = { '0,0': 0 };
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      // A1=0, A1/0 → #DIV/0! → IFERROR returns fallback 100
      expect(evaluateMathExpression('IFERROR(A1/0,100)', getVal)).toEqual({ status: 'success', value: 100 });
    });

    it('IFERROR: simulates PI offline fallback (static)', () => {
      // Simulates: =IFERROR(PICurrVal("TAG"),"SEM DADO")
      // The cell holding the PI value errors → fallback returned
      const errCell = (_coord: any) => '#PI!'; // cell returns error string
      expect(evaluateMathExpression('IFERROR(A1,"SEM DADO")', errCell)).toEqual({ status: 'success', value: 'SEM DADO' });
    });

    it('IFERROR: without error propagates the original value', () => {
      const cells: Record<string, number> = { '0,0': 25 };
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('IFERROR(SQRT(A1),0)', getVal)).toEqual({ status: 'success', value: 5 });
    });

    it('Error propagates correctly without IFERROR', () => {
      // =A1/0 without protection → #DIV/0!
      const cells: Record<string, number> = { '0,0': 10 };
      const getVal = (coord: { col: number; row: number }) => cells[`${coord.col},${coord.row}`];
      expect(evaluateMathExpression('A1/0', getVal)).toEqual({ status: 'error', error: '#DIV/0!' });
    });

    it('parseFormula routes IF and IFERROR to math_expression type', () => {
      expect(parseFormula('=IF(A1>10,"ALTO","NORMAL")')).toMatchObject({
        type: 'math_expression',
        expression: 'IF(A1>10,"ALTO","NORMAL")',
      });
      expect(parseFormula('=IFERROR(A1/0,0)')).toMatchObject({
        type: 'math_expression',
        expression: 'IFERROR(A1/0,0)',
      });
    });
  });
});
