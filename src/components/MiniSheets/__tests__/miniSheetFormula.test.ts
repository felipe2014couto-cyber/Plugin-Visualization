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
    });
    expect(parseFormula('=PIArcVal("LFS_RB2_MOTOR_TEMP", "*-1h")')).toEqual({
      type: 'pi_arc_val',
      tag: 'LFS_RB2_MOTOR_TEMP',
      timeExpression: '*-1h',
    });
  });

  it('parses PICompDat and PISampDat', () => {
    expect(parseFormula('=PICompDat("LFS_RB2_TAG", "*-1h", "*")')).toEqual({
      type: 'pi_comp_dat',
      tag: 'LFS_RB2_TAG',
      startTime: '*-1h',
      endTime: '*',
    });
    expect(parseFormula('=PISampDat("LFS_RB2_TAG", "*-1h", "*", "5m")')).toEqual({
      type: 'pi_samp_dat',
      tag: 'LFS_RB2_TAG',
      startTime: '*-1h',
      endTime: '*',
      interval: '5m',
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
  });

  it('handles errors gracefully: #REF!, #FORMULA!, #DIV/0!', () => {
    expect(parseFormula('=SUM(INVALID)')).toEqual({ type: 'error', error: '#FORMULA!' });
    expect(evaluateMathExpression('A1/0', () => 10)).toEqual({ status: 'error', error: '#DIV/0!' });
  });
});
