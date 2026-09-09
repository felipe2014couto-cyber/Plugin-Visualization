import { applyHistoricalMacros, globalHistoricalPromiseLock, globalHistoricalResultCache } from '../calculationMacros';
import { getPiTrendsRecordedHistoryForRange } from '../../pi/piDataSource';

jest.mock('../../pi/piDataSource', () => ({ getPiTrendsRecordedHistoryForRange: jest.fn() }));
const query = getPiTrendsRecordedHistoryForRange as jest.Mock;
const binding = { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'SINUSOID' };
const key = 'pi\u0000pims\u0000SINUSOID';
const evaluate = (expression: string) => applyHistoricalMacros(expression, 'SINUSOID', 'calc', binding, Math.floor(Date.now() / 1000));
async function fetch(expression: string) {
  expect(() => evaluate(expression)).toThrow('FETCHING_HISTORY');
  await Promise.all(globalHistoricalPromiseLock.values());
}

beforeEach(() => {
  query.mockReset();
  globalHistoricalResultCache.clear();
  globalHistoricalPromiseLock.clear();
});

it('consome a chave composta e calcula Average numérico', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 1000, value: 10 }, { time: 2000, value: 30 }],
  } } });
  const expression = "Average('SINUSOID', '-1h', '*')";
  await fetch(expression);
  expect(evaluate(expression)).toBe('20');
  expect(query).toHaveBeenCalledTimes(1);
});

it('calcula TimeEq usando states quando points está vazio', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], states: [
      { time: 1000, value: 'On' }, { time: 11000, value: 'Off' },
      { time: 16000, value: 'On' }, { time: 21000, value: 'Off' },
    ],
  } } });
  const expression = `TimeEq('SINUSOID', '-1h', '*', "On")`;
  await fetch(expression);
  expect(evaluate(expression)).toBe('15');
});

it.each([['TimeGT', '2'], ['TimeLT', '1']])('preserva %s numérico', async (fn, expected) => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 1000, value: 5 }, { time: 2000, value: 20 }, { time: 4000, value: 0 }],
  } } });
  const expression = `${fn}('SINUSOID', '-1h', '*', 10)`;
  await fetch(expression);
  expect(evaluate(expression)).toBe(expected);
});

it.each(['resolved', 'rejected', 'missing'])('não armazena erro %s como zero e expõe a falha na avaliação', async (mode) => {
  if (mode === 'rejected') query.mockRejectedValue(new Error('HTTP 500'));
  else query.mockResolvedValue(mode === 'missing' ? {} : { [key]: { status: 'error', error: new Error('HTTP 500') } });
  const expression = "Average('SINUSOID', '-1h', '*')";
  await fetch(expression);
  expect(() => evaluate(expression)).toThrow(mode === 'missing' ? 'Resposta histórica inválida' : 'HTTP 500');
  expect([...globalHistoricalResultCache.values()][0]).toMatchObject({ error: expect.any(Error) });
  expect([...globalHistoricalResultCache.values()][0].value).toBeUndefined();
  expect(query).toHaveBeenCalledTimes(1);
});

it('distingue histórico vazio válido de falha de consulta', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: { pointName: 'SINUSOID', points: [] } } });
  const expression = "Count('SINUSOID', '-1h', '*')";
  await fetch(expression);
  expect(evaluate(expression)).toBe('0');
  expect([...globalHistoricalResultCache.values()][0].error).toBeUndefined();
});
