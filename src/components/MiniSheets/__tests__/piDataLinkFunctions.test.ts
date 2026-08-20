import {
  parseFormula,
  resolveParameter,
  parseRangeAddresses,
} from '../miniSheetFormula';

describe('PI DataLink Formula Parsing & Reference Resolution', () => {
  const getCellValue = (coord: { col: number; row: number }) => {
    const map: Record<string, string> = {
      '0,0': 'LFS_RB2_TEMP', // A1
      '0,1': '*-8h',         // A2
      '0,2': '*',            // A3
      '0,3': '5m',           // A4
    };
    return map[`${coord.col},${coord.row}`];
  };

  test('parses PICurrVal with literal and cell reference', () => {
    const literal = parseFormula('=PICurrVal("LFS_RB2_TEMP")');
    expect(literal).toEqual({
      type: 'pi_curr_val',
      tag: 'LFS_RB2_TEMP',
      referencedCells: [],
    });
    if (literal.type === 'pi_curr_val') {
      expect(resolveParameter(literal.tag, getCellValue)).toBe('LFS_RB2_TEMP');
    }

    const ref = parseFormula('=PICurrVal(A1)');
    expect(ref).toEqual({
      type: 'pi_curr_val',
      tag: 'A1',
      referencedCells: [{ col: 0, row: 0 }],
    });
    if (ref.type === 'pi_curr_val') {
      expect(resolveParameter(ref.tag, getCellValue)).toBe('LFS_RB2_TEMP');
    }
  });

  test('parses PIArcVal with literal and cell references', () => {
    const parsed = parseFormula('=PIArcVal("LFS_RB2_TEMP", "*-1h", "Interpolated")');
    expect(parsed).toEqual({
      type: 'pi_arc_val',
      tag: 'LFS_RB2_TEMP',
      timeExpression: '*-1h',
      mode: 'Interpolated',
      referencedCells: [],
    });

    const refParsed = parseFormula('=PIArcVal(A1, A2)');
    expect(refParsed).toEqual({
      type: 'pi_arc_val',
      tag: 'A1',
      timeExpression: 'A2',
      mode: undefined,
      referencedCells: [{ col: 0, row: 0 }, { col: 0, row: 1 }],
    });
    if (refParsed.type === 'pi_arc_val') {
      expect(resolveParameter(refParsed.tag, getCellValue)).toBe('LFS_RB2_TEMP');
      expect(resolveParameter(refParsed.timeExpression, getCellValue)).toBe('*-8h');
    }
  });

  test('parses PICompDat with maxCount and showTimestamp options', () => {
    const parsed = parseFormula('=PICompDat("LFS_RB2_TEMP", "*-1h", "*", 250, false)');
    expect(parsed).toEqual({
      type: 'pi_comp_dat',
      tag: 'LFS_RB2_TEMP',
      startTime: '*-1h',
      endTime: '*',
      maxCount: 250,
      showTimestamp: false,
      referencedCells: [],
    });
  });

  test('parses PISampDat with interval and cell references', () => {
    const parsed = parseFormula('=PISampDat(A1, A2, A3, A4)');
    expect(parsed).toEqual({
      type: 'pi_samp_dat',
      tag: 'A1',
      startTime: 'A2',
      endTime: 'A3',
      interval: 'A4',
      showTimestamp: true,
      referencedCells: [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
        { col: 0, row: 2 },
        { col: 0, row: 3 },
      ],
    });
    if (parsed.type === 'pi_samp_dat') {
      expect(resolveParameter(parsed.tag, getCellValue)).toBe('LFS_RB2_TEMP');
      expect(resolveParameter(parsed.startTime, getCellValue)).toBe('*-8h');
      expect(resolveParameter(parsed.endTime, getCellValue)).toBe('*');
      expect(resolveParameter(parsed.interval, getCellValue)).toBe('5m');
    }
  });

  test('parses PITimeDat with timestamp ranges', () => {
    const parsed = parseFormula('=PITimeDat("LFS_RB2_TEMP", A1:A4, "Actual")');
    expect(parsed).toEqual({
      type: 'pi_time_dat',
      tag: 'LFS_RB2_TEMP',
      timestampsRange: 'A1:A4',
      mode: 'Actual',
      referencedCells: [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
        { col: 0, row: 2 },
        { col: 0, row: 3 },
      ],
    });
  });

  test('parses PIAdvCalcVal with calculation and interval', () => {
    const parsed = parseFormula('=PIAdvCalcVal("LFS_RB2_TEMP", "*-8h", "*", "Average", "1h")');
    expect(parsed).toEqual({
      type: 'pi_adv_calc_val',
      tag: 'LFS_RB2_TEMP',
      startTime: '*-8h',
      endTime: '*',
      calculation: 'Average',
      interval: '1h',
      referencedCells: [],
    });
  });

  test('parses PITimeFilter with condition expression and unit', () => {
    const parsed = parseFormula(`=PITimeFilter("'LFS_RB2_TEMP' > 50", "*-8h", "*", "hours")`);
    expect(parsed).toEqual({
      type: 'pi_time_filter',
      expression: `'LFS_RB2_TEMP' > 50`,
      startTime: '*-8h',
      endTime: '*',
      unit: 'hours',
      referencedCells: [],
    });
  });

  test('parseRangeAddresses handles single cell and ranges correctly', () => {
    expect(parseRangeAddresses('B4')).toEqual([{ col: 1, row: 3 }]);
    expect(parseRangeAddresses('A1:A3')).toEqual([
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: 2 },
    ]);
  });

  test('resolves a scalar parameter from the first cell of a selected range', () => {
    expect(resolveParameter('A1:A3', getCellValue)).toBe('LFS_RB2_TEMP');
  });
});
