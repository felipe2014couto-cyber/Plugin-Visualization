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
});
