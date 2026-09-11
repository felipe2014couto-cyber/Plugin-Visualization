import { applyAlarmMacros, applyDigitalStateMacros, applyHistoricalMacros, applyMetadataMacros, applyQualityMacros, globalDigitalStatePromiseLock, globalDigitalStateResultCache, globalHistoricalPromiseLock, globalHistoricalResultCache, globalMetadataPromiseLock, globalMetadataResultCache } from '../calculationMacros';
import { evaluateCalculation } from '../calculationEngine';
import { getPiDigitalStateSets, getPiTrendsRecordedHistoryForRange } from '../../pi/piDataSource';

jest.mock('../../pi/piDataSource', () => ({ getPiTrendsRecordedHistoryForRange: jest.fn(), getPiPointMetadata: jest.fn(), getPiPointDigitalStates: jest.fn(), getPiDigitalStateSets: jest.fn(), decodePiAlarmState: jest.fn() }));
const query = getPiTrendsRecordedHistoryForRange as jest.Mock;
const getMetadata = require('../../pi/piDataSource').getPiPointMetadata as jest.Mock;
const getDigitalStates = require('../../pi/piDataSource').getPiPointDigitalStates as jest.Mock;
const decodeAlarm = require('../../pi/piDataSource').decodePiAlarmState as jest.Mock;
const getDigitalStateSets = getPiDigitalStateSets as jest.Mock;
const binding = { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'SINUSOID' };
const key = 'pi\u0000pims\u0000SINUSOID';
const evaluate = (expression: string) => applyHistoricalMacros(expression, 'SINUSOID', 'calc', binding, Math.floor(Date.now() / 1000));
async function fetch(expression: string) {
  expect(() => evaluate(expression)).toThrow('FETCHING_HISTORY');
  await Promise.all(globalHistoricalPromiseLock.values());
}

beforeEach(() => {
  query.mockReset();
  getMetadata.mockReset();
  getDigitalStates.mockReset();
  getDigitalStateSets.mockReset();
  decodeAlarm.mockReset();
  globalHistoricalResultCache.clear();
  globalHistoricalPromiseLock.clear();
  globalMetadataResultCache.clear();
  globalMetadataPromiseLock.clear();
  globalDigitalStateResultCache.clear();
  globalDigitalStatePromiseLock.clear();
});

it('resolve as quatro funções Alm* somente após carregar e validar o Alarm State Set', async () => {
  getDigitalStates.mockResolvedValue({ isDigital: true, states: [{ value: 1, name: '__ Low ^^' }] });
  decodeAlarm.mockReturnValue({ conditionCode: 1, conditionText: 'Low', acknowledgementStatus: 1, priority: 2 });
  expect(() => applyAlarmMacros("AlmAckStat('SINUSOID') + AlmCondition('SINUSOID') + AlmPriority('SINUSOID')", 'SINUSOID', binding, { value: 1 })).toThrow('FETCHING_DIGITAL_STATES');
  await Promise.all(globalDigitalStatePromiseLock.values());
  expect(applyAlarmMacros("AlmAckStat('SINUSOID') + AlmCondition('SINUSOID') + AlmPriority('SINUSOID') + AlmCondText('SINUSOID')", 'SINUSOID', binding, { value: 1 }))
    .toBe('1 + 1 + 2 + "Low"');
  expect(decodeAlarm).toHaveBeenCalledWith(expect.any(Array), { value: 1 });
});

it('resolve DigText, DigState e StateNo pelo Digital State Set real, sem usar índice', async () => {
  getDigitalStates.mockResolvedValue({ isDigital: true, states: [
    { value: 0, name: 'Stopped' }, { value: 5, name: 'Starting' },
    { value: 10, name: 'Running' }, { value: 20, name: 'Fault' },
  ] });
  expect(() => applyDigitalStateMacros("DigText('SINUSOID')", 'SINUSOID', binding, { value: 10 })).toThrow('FETCHING_DIGITAL_STATES');
  await Promise.all(globalDigitalStatePromiseLock.values());
  expect(applyDigitalStateMacros("DigText('SINUSOID')", 'SINUSOID', binding, { value: 10 })).toBe('"Running"');
  expect(evaluateCalculation({ id: 'digital', name: 'digital', expression: applyDigitalStateMacros("StateNo('SINUSOID')", 'SINUSOID', binding, { value: 10 }), inputs: [] }, new Map()))
    .toEqual({ status: 'success', value: 10 });
  expect(evaluateCalculation({ id: 'digital', name: 'digital', expression: applyDigitalStateMacros('StateNo(DigState("Running", \'SINUSOID\'))', 'SINUSOID', binding, { value: 10 }), inputs: [] }, new Map()))
    .toEqual({ status: 'success', value: 10 });
  expect(applyDigitalStateMacros('StateNo("Running")', 'SINUSOID', binding, { value: 10 })).toBe('StateNo("Running")');
  expect(getDigitalStates).toHaveBeenCalledTimes(1);
});

it('resolve DigState sem tag com SYSTEM primeiro e preserva a identidade do set para StateNo', async () => {
  getDigitalStateSets.mockResolvedValue([
    { name: 'SYSTEM', webId: 'system', isSystem: true, states: [{ name: 'Shutdown', value: 248, setWebId: 'system', setName: 'SYSTEM', isSystem: true }] },
    { name: 'Set A', webId: 'set-a', isSystem: false, states: [{ name: 'Running', value: 10, setWebId: 'set-a', setName: 'Set A' }] },
    { name: 'Set B', webId: 'set-b', isSystem: false, states: [{ name: 'Running', value: 200, setWebId: 'set-b', setName: 'Set B' }] },
  ]);
  expect(() => applyDigitalStateMacros('StateNo(DigState("Running"))', 'SINUSOID', binding, { value: 10 })).toThrow('FETCHING_DIGITAL_STATES');
  await Promise.all(globalDigitalStatePromiseLock.values());
  const expression = applyDigitalStateMacros('StateNo(DigState("Running"))', 'SINUSOID', binding, { value: 10 });
  expect(evaluateCalculation({ id: 'global-digital', name: 'global-digital', expression, inputs: [] }, new Map()))
    .toEqual({ status: 'success', value: 10 });
  expect(getDigitalStateSets).toHaveBeenCalledTimes(1);
});

it('resolve DigText de um System Digital State sem inseri-lo no set normal do ponto', async () => {
  getDigitalStates.mockResolvedValue({ isDigital: true, states: [{ name: 'Running', value: 10, setWebId: 'set-a', setName: 'Set A' }] });
  getDigitalStateSets.mockResolvedValue([
    { name: 'SYSTEM', webId: 'system', isSystem: true, states: [{ name: 'Shutdown', value: 248, setWebId: 'system', setName: 'SYSTEM', isSystem: true }] },
    { name: 'Set A', webId: 'set-a', isSystem: false, states: [{ name: 'Running', value: 10, setWebId: 'set-a', setName: 'Set A' }] },
  ]);
  expect(() => applyDigitalStateMacros("DigText('SINUSOID')", 'SINUSOID', binding, { value: 'Shutdown' })).toThrow('FETCHING_DIGITAL_STATES');
  await Promise.all(globalDigitalStatePromiseLock.values());
  expect(() => applyDigitalStateMacros("DigText('SINUSOID')", 'SINUSOID', binding, { value: 'Shutdown' })).toThrow('FETCHING_DIGITAL_STATES');
  await Promise.all(globalDigitalStatePromiseLock.values());
  expect(applyDigitalStateMacros("DigText('SINUSOID')", 'SINUSOID', binding, { value: 'Shutdown' })).toBe('"Shutdown"');
});

it('propaga capability e falha de consulta da busca global de DigState sem mascarar o erro', async () => {
  getDigitalStateSets.mockRejectedValueOnce(new Error('capability indisponível'));
  expect(() => applyDigitalStateMacros('DigState("Running")', 'SINUSOID', binding, { value: 10 })).toThrow('FETCHING_DIGITAL_STATES');
  await Promise.all(globalDigitalStatePromiseLock.values());
  expect(() => applyDigitalStateMacros('DigState("Running")', 'SINUSOID', binding, { value: 10 })).toThrow('capability indisponível');
});

it('retorna erro para ponto não digital, estado desconhecido ou set sem código', async () => {
  getDigitalStates.mockResolvedValueOnce({ isDigital: false, states: [] });
  expect(() => applyDigitalStateMacros("DigText('SINUSOID')", 'SINUSOID', binding, { value: 10 })).toThrow('FETCHING_DIGITAL_STATES');
  await Promise.all(globalDigitalStatePromiseLock.values());
  expect(() => applyDigitalStateMacros("DigText('SINUSOID')", 'SINUSOID', binding, { value: 10 })).toThrow('não é digital');
});

it('inicia somente a busca global explícita para DigState sem tag de referência', async () => {
  getDigitalStateSets.mockResolvedValue([]);
  expect(() => applyDigitalStateMacros('DigState("Running")', 'SINUSOID', binding, { value: 10 }))
    .toThrow('FETCHING_DIGITAL_STATES');
  expect(getDigitalStateSets).toHaveBeenCalledWith(binding);
  expect(globalDigitalStatePromiseLock.size).toBe(1);
  await Promise.all(globalDigitalStatePromiseLock.values());
});

it('resolve metadata real do PI Point, compartilha cache e não usa histórico como fallback', async () => {
  const metadata = { name: 'MOTOR_SPEED', description: 'Motor speed', engineeringUnit: 'rpm', pointSource: 'R', span: 2000, zero: -500, pointType: 'Float32' };
  getMetadata.mockResolvedValue(metadata);
  const metadataBinding = { ...binding, pointName: 'MOTOR_SPEED' };
  const evaluateMetadata = (expression: string) => applyMetadataMacros(expression, 'MOTOR_SPEED', metadataBinding);

  expect(() => evaluateMetadata("TagDesc('MOTOR_SPEED')")).toThrow('FETCHING_METADATA');
  await Promise.all(globalMetadataPromiseLock.values());
  expect(evaluateMetadata("Concat(TagDesc('MOTOR_SPEED'), \" - \", TagEU('MOTOR_SPEED'))")).toBe('Concat("Motor speed", " - ", "rpm")');
  expect(evaluateMetadata("TagSpan('MOTOR_SPEED') + TagZero('MOTOR_SPEED')")).toBe('2000 + -500');
  expect(getMetadata).toHaveBeenCalledTimes(1);
});

it('resolve TagNum somente pelo PointID real e rejeita ausência de PointID', async () => {
  getMetadata.mockResolvedValue({ name: 'TAG', pointId: 12345 });
  const tagBinding = { ...binding, pointName: 'TAG' };
  expect(() => applyMetadataMacros("TagNum('TAG')", 'TAG', tagBinding)).toThrow('FETCHING_METADATA');
  await Promise.all(globalMetadataPromiseLock.values());
  expect(applyMetadataMacros("TagNum('TAG')", 'TAG', tagBinding)).toBe('12345');

  globalMetadataResultCache.clear(); globalMetadataPromiseLock.clear();
  getMetadata.mockResolvedValue({ name: 'TAG', pointId: undefined });
  expect(() => applyMetadataMacros("TagNum('TAG')", 'TAG', tagBinding)).toThrow('FETCHING_METADATA');
  await Promise.all(globalMetadataPromiseLock.values());
  expect(() => applyMetadataMacros("TagNum('TAG')", 'TAG', tagBinding)).toThrow('PointID não disponível');
});

it('não mascara metadata ausente como string vazia ou nome da tag', async () => {
  getMetadata.mockResolvedValue({ name: 'TAG' });
  const metadataBinding = { ...binding, pointName: 'TAG' };
  expect(() => applyMetadataMacros("TagEU('TAG')", 'TAG', metadataBinding)).toThrow('FETCHING_METADATA');
  await Promise.all(globalMetadataPromiseLock.values());
  expect(() => applyMetadataMacros("TagEU('TAG')", 'TAG', metadataBinding)).toThrow('metadado não disponível');
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
  const base = Date.now() - 21_000;
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], states: [
      { time: base, value: 'On' }, { time: base + 10_000, value: 'Off' },
      { time: base + 15_000, value: 'On' }, { time: base + 20_000, value: 'Off' },
    ],
  } } });
  const expression = `TimeEq('SINUSOID', '-1h', '*', "On")`;
  await fetch(expression);
  expect(evaluate(expression)).toBe('15');
});

it('calcula Find* numérico com cruzamento contínuo e preserva a igualdade', async () => {
  const base = Date.now() + 60_000;
  const start = new Date(base - 30_000).toISOString();
  const end = new Date(base + 30_000).toISOString();
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [
      { time: base - 30_000, value: 40 }, { time: base - 20_000, value: 60 },
    ],
  } } });
  await fetch(`FindGE('SINUSOID', '${start}', '${end}', 50)`);
  const ge = Number(evaluate(`FindGE('SINUSOID', '${start}', '${end}', 50)`));
  expect(ge * 1000).toBeGreaterThanOrEqual(base - 25_000);
  expect(ge * 1000).toBeLessThanOrEqual(base - 24_000);

  globalHistoricalResultCache.clear();
  globalHistoricalPromiseLock.clear();
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [
      { time: base - 30_000, value: 50 }, { time: base - 20_000, value: 50 }, { time: base - 10_000, value: 60 },
    ],
  } } });
  await fetch(`FindGE('SINUSOID', '${start}', '${end}', 50)`);
  const equal = Number(evaluate(`FindGE('SINUSOID', '${start}', '${end}', 50)`));
  globalHistoricalResultCache.clear();
  globalHistoricalPromiseLock.clear();
  await fetch(`FindGT('SINUSOID', '${start}', '${end}', 50)`);
  const greater = Number(evaluate(`FindGT('SINUSOID', '${start}', '${end}', 50)`));
  expect(equal).toBeCloseTo((base - 30_000) / 1000, 1);
  expect(greater).toBeCloseTo((base - 20_000) / 1000, 1);
});

it('calcula FindEq e FindNE em estados digitais sem interpolar strings', async () => {
  const base = Date.now() + 60_000;
  const start = new Date(base - 30_000).toISOString();
  const end = new Date(base + 30_000).toISOString();
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], states: [
      { time: base - 30_000, value: 'Off' }, { time: base - 20_000, value: 'On' }, { time: base - 10_000, value: 'Off' },
    ],
  } } });
  await fetch(`FindEq('SINUSOID', '${start}', '${end}', "On")`);
  expect(Number(evaluate(`FindEq('SINUSOID', '${start}', '${end}', "On")`))).toBeCloseTo((base - 20_000) / 1000, 1);
  globalHistoricalResultCache.clear();
  globalHistoricalPromiseLock.clear();
  await fetch(`FindNE('SINUSOID', '${start}', '${end}', "On")`);
  expect(Number(evaluate(`FindNE('SINUSOID', '${start}', '${end}', "On")`))).toBeCloseTo((base - 30_000) / 1000, 1);
});

it('retorna erro explícito para Find sem correspondência ou comparação numérica digital', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: Date.now() - 10_000, value: 10 }, { time: Date.now(), value: 20 }],
  } } });
  await fetch("FindGT('SINUSOID', '-30s', '*', 100)");
  expect(() => evaluate("FindGT('SINUSOID', '-30s', '*', 100)")).toThrow('nenhuma correspondência');
});

it.each([['TimeGT', 1.6666666667], ['TimeLT', 1.3333333333]])('preserva %s numérico', async (fn, expected) => {
  const base = Date.now() - 4_000;
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: base, value: 5 }, { time: base + 1_000, value: 20 }, { time: base + 3_000, value: 0 }],
  } } });
  const expression = `${fn}('SINUSOID', '-1h', '*', 10)`;
  await fetch(expression);
  expect(Number(evaluate(expression))).toBeCloseTo(expected, 6);
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

it.each([
  ['TagVal', "TagVal('SINUSOID', '1970-01-01 00:00:01.500')", '20'],
  ['PrevVal', "PrevVal('SINUSOID', '1970-01-01 00:00:01.500')", '10'],
  ['NextVal', "NextVal('SINUSOID', '1970-01-01 00:00:01.500')", '30'],
])('calcula %s a partir do ponto temporal adequado', async (_name, expression, expected) => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 1000, value: 10 }, { time: 2000, value: 30 }],
  } } });
  await fetch(expression);
  expect(evaluate(expression)).toBe(expected);
});

it('não interpola PrevVal/NextVal e usa o evento exato em TagVal', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 1000, value: 10 }, { time: 2000, value: 20 }, { time: 3000, value: 30 }],
  } } });
  const prev = "PrevVal('SINUSOID', '1970-01-01 00:00:02')";
  const next = "NextVal('SINUSOID', '1970-01-01 00:00:02')";
  const exact = "TagVal('SINUSOID', '1970-01-01 00:00:02')";
  await fetch(prev); expect(evaluate(prev)).toBe('10');
  await fetch(next); expect(evaluate(next)).toBe('30');
  await fetch(exact); expect(evaluate(exact)).toBe('20');
});

it('não mascara TagVal sem evento histórico como zero', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: { pointName: 'SINUSOID', points: [] } } });
  const expression = "TagVal('SINUSOID', '1970-01-01 00:00:02')";
  await fetch(expression);
  expect(() => evaluate(expression)).toThrow('não há valor histórico');
});

it('mantém Find* em segundos Unix quando composto com Hour', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 0, value: 40 }, { time: 7_200_000, value: 60 }],
  } } });
  const calculation = {
    id: 'find-time-audit', name: 'Find e hora',
    expression: "Hour(FindGT('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 02:00:00', 50))",
    inputs: [{ name: 'SINUSOID', binding }],
  };
  expect(evaluateCalculation(calculation, new Map([['SINUSOID', 1]])).status).toBe('loading');
  await Promise.all(globalHistoricalPromiseLock.values());
  expect(evaluateCalculation(calculation, new Map([['SINUSOID', 1]]))).toEqual({ status: 'success', value: 1 });
});

it('assume o tempo atual quando TagVal omite o segundo argumento', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: Date.now() - 100, value: 10 }, { time: Date.now() + 100, value: 30 }],
  } } });
  const expression = "TagVal('SINUSOID')";
  await fetch(expression);
  expect(Number(evaluate(expression))).toBeGreaterThanOrEqual(10);
  expect(Number(evaluate(expression))).toBeLessThanOrEqual(30);
});

it('calcula TagAvg como média ponderada no tempo e mantém TagMean por eventos', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [
      { time: 0, value: 10 },
      { time: 60_000, value: 100 },
      { time: 3_540_000, value: 100 },
      { time: 3_600_000, value: 10 },
    ],
  } } });
  const avg = "TagAvg('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:01:00')";
  const mean = "TagMean('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')";
  await fetch(avg);
  expect(evaluate(avg)).toBe('55');
  await fetch(mean);
  expect(evaluate(mean)).toBe('55');
});

it('preserva Good=false no modelo histórico e não usa o evento ruim em agregações', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID',
    points: [{ time: 0, value: 10 }, { time: 60_000, value: 100 }],
    historicalValues: [
      { timestamp: 0, value: 10, quality: { good: true } },
      { timestamp: 60_000, value: 100, quality: { good: false } },
    ],
  } } });
  const expression = "TagMean('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:01:00')";
  await fetch(expression);
  expect(evaluate(expression)).toBe('10');
});

it('usa Step real quando disponível e mantém interpolação contínua quando ausente', async () => {
  const points = { pointName: 'SINUSOID', points: [{ time: 0, value: 40 }, { time: 600_000, value: 60 }] };
  getMetadata.mockResolvedValue({ name: 'SINUSOID', pointType: 'Float32', stepped: true });
  query.mockResolvedValue({ [key]: { status: 'success', series: points } });
  const steppedAvg = "TagAvg('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:10:00')";
  await fetch(steppedAvg);
  expect(Number(evaluate(steppedAvg))).toBeCloseTo(40, 8);

  globalHistoricalResultCache.clear(); globalHistoricalPromiseLock.clear();
  const steppedTot = "TagTot('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:10:00')";
  await fetch(steppedTot);
  expect(Number(evaluate(steppedTot))).toBeCloseTo(40 * 600 / 86400, 8);

  globalHistoricalResultCache.clear(); globalHistoricalPromiseLock.clear();
  const steppedTime = "TimeGT('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:10:00', 50)";
  await fetch(steppedTime);
  expect(evaluate(steppedTime)).toBe('0');

  globalHistoricalResultCache.clear(); globalHistoricalPromiseLock.clear();
  getMetadata.mockResolvedValue({ name: 'SINUSOID', pointType: 'Float32', stepped: false });
  const continuousFind = "FindGT('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:10:00', 50)";
  await fetch(continuousFind);
  expect(Number(evaluate(continuousFind))).toBeCloseTo(300, 3);

  globalHistoricalResultCache.clear(); globalHistoricalPromiseLock.clear();
  getMetadata.mockResolvedValue({ name: 'SINUSOID', pointType: 'Float32', stepped: true });
  const steppedFind = "FindGT('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:10:00', 50)";
  await fetch(steppedFind);
  expect(Number(evaluate(steppedFind))).toBeCloseTo(600, 3);
});

it('diferencia TagAvg de TagMean em uma série irregular', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [
      { time: 0, value: 10 },
      { time: 60_000, value: 100 },
      { time: 3_540_000, value: 100 },
      { time: 3_600_000, value: 10 },
    ],
  } } });
  const avg = "TagAvg('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')";
  const mean = "TagMean('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')";
  await fetch(avg);
  await fetch(mean);
  expect(Number(evaluate(avg))).toBeCloseTo(98.5, 10);
  expect(evaluate(mean)).toBe('55');
});

it('calcula TagAvg nas fronteiras da janela para Step contínuo e stepped', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [
      { time: 0, value: 40 }, { time: 600_000, value: 60 }, { time: 1_200_000, value: 80 },
    ],
  } } });
  const expression = "TagAvg('SINUSOID', '1970-01-01 00:02:00', '1970-01-01 00:18:00')";
  getMetadata.mockResolvedValue({ stepped: false });
  await fetch(expression);
  expect(Number(evaluate(expression))).toBeCloseTo(60, 8);

  globalHistoricalResultCache.clear();
  globalHistoricalPromiseLock.clear();
  getMetadata.mockResolvedValue({ stepped: true });
  await fetch(expression);
  expect(Number(evaluate(expression))).toBeCloseTo(50, 8);
});

it('não cria ponte numérica sobre intervalo com evento Good=false', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 0, value: 40 }, { time: 600_000, value: 60 }, { time: 1_200_000, value: 80 }],
    historicalValues: [
      { timestamp: 0, value: 40, quality: { good: true } },
      { timestamp: 600_000, value: 60, quality: { good: false } },
      { timestamp: 1_200_000, value: 80, quality: { good: true } },
    ],
  } } });
  const expression = "TagAvg('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:20:00')";
  await fetch(expression);
  expect(() => evaluate(expression)).toThrow('intervalo calculável');
});

it('EventCount não conta boundary quando a origem é conhecida', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 0, value: 1 }, { time: 1, value: 2 }, { time: 2, value: 3 }, { time: 3, value: 4 }],
    historicalValues: [
      { timestamp: 0, value: 1, origin: 'boundary' },
      { timestamp: 1, value: 2, origin: 'recorded' },
      { timestamp: 2, value: 3, origin: 'recorded' },
      { timestamp: 3, value: 4, origin: 'boundary' },
    ],
  } } });
  const expression = "EventCount('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:00:04')";
  await fetch(expression);
  expect(evaluate(expression)).toBe('2');
});

it('calcula TagMin, TagMax, Range, TagTot e EventCount', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [
      { time: 0, value: 10 }, { time: 1_200_000, value: 15 },
      { time: 2_400_000, value: 30 }, { time: 3_600_000, value: 20 },
    ],
  } } });
  const expressions = [
    ["TagMin('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')", '10'],
    ["TagMax('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')", '30'],
    ["Range('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')", '20'],
    ["TagTot('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')", '0.8333333333333333'],
    ["EventCount('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00')", '4'],
  ] as const;
  for (const [expression, expected] of expressions) {
    await fetch(expression);
    expect(evaluate(expression)).toBe(expected);
  }
  expect(query).toHaveBeenCalledTimes(5);
});

it('não converte série digital nem histórico vazio em estatística numérica', async () => {
  query.mockResolvedValueOnce({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], states: [{ time: 0, value: 'Off' }, { time: 1_000, value: 'On' }],
  } } });
  const digital = "TagAvg('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:00:01')";
  await fetch(digital);
  expect(() => evaluate(digital)).toThrow('valores numéricos válidos');

  query.mockResolvedValueOnce({ [key]: { status: 'success', series: { pointName: 'SINUSOID', points: [] } } });
  const empty = "TagMin('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:00:01')";
  await fetch(empty);
  expect(() => evaluate(empty)).toThrow('valores numéricos válidos');
});

it.each([
  ['TimeGT', '300'], ['TimeGE', '300'], ['TimeLT', '300'], ['TimeLE', '300'],
])('calcula %s considerando o cruzamento linear do limite', async (fn, expected) => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [{ time: 0, value: 40 }, { time: 600_000, value: 60 }],
  } } });
  const expression = `${fn}('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:10:00', 50)`;
  await fetch(expression);
  expect(evaluate(expression)).toBe(expected);
});

it('preserva a diferença entre comparadores estritos e inclusivos em um platô', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [
      { time: 0, value: 50 }, { time: 600_000, value: 50 }, { time: 1_200_000, value: 60 },
    ],
  } } });
  const result = async (fn: string) => {
    const expression = `${fn}('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:20:00', 50)`;
    await fetch(expression);
    return evaluate(expression);
  };
  expect(await result('TimeGT')).toBe('600');
  expect(await result('TimeGE')).toBe('1200');
  expect(await result('TimeLT')).toBe('0');
  expect(await result('TimeLE')).toBe('600');
});

it('calcula TimeEq e TimeNE em estados digitais como complementares', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], states: [
      { time: 0, value: 'Off' }, { time: 600_000, value: 'On' },
      { time: 2_400_000, value: 'Off' }, { time: 3_600_000, value: 'Off' },
    ],
  } } });
  const eq = `TimeEq('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00', "On")`;
  const ne = `TimeNE('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 01:00:00', "On")`;
  await fetch(eq);
  await fetch(ne);
  expect(evaluate(eq)).toBe('1800');
  expect(evaluate(ne)).toBe('1800');
});

it('implementa PrevEvent e NextEvent como timestamps de eventos arquivados estritos', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], historicalValues: [
      { timestamp: 600_000, value: 10, origin: 'recorded' },
      { timestamp: 1_200_000, value: 20, origin: 'recorded' },
      { timestamp: 1_800_000, value: 30, origin: 'recorded' },
    ],
  } } });
  const previous = "PrevEvent('SINUSOID', '1970-01-01 00:20:00')";
  const next = "NextEvent('SINUSOID', '1970-01-01 00:10:00')";
  await fetch(previous);
  await fetch(next);
  expect(evaluate(previous)).toBe('600');
  expect(evaluate(next)).toBe('1200');
});

it('calcula PctGood por duração e não por contagem de eventos', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], historicalValues: [
      { timestamp: 0, value: 1, quality: { good: true } },
      { timestamp: 600_000, value: 2, quality: { good: false } },
      { timestamp: 1_200_000, value: 3, quality: { good: true } },
    ],
  } } });
  const expression = "PctGood('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:20:00')";
  await fetch(expression);
  expect(evaluate(expression)).toBe('50');
});

it('calcula StDev histórico como desvio padrão ponderado no tempo', async () => {
  query.mockResolvedValue({ [key]: { status: 'success', series: {
    pointName: 'SINUSOID', points: [], historicalValues: [
      { timestamp: 0, value: 1, quality: { good: true } },
      { timestamp: 600_000, value: 2, quality: { good: true } },
      { timestamp: 1_200_000, value: 3, quality: { good: true } },
    ],
  } } });
  const expression = "StDev('SINUSOID', '1970-01-01 00:00:00', '1970-01-01 00:20:00')";
  await fetch(expression);
  expect(Number(evaluate(expression))).toBeCloseTo(Math.sqrt(0.5));
});

it('implementa IsSet com as flags PI disponíveis e não aproxima TagBad de BadVal', () => {
  const value = { value: 1, quality: { good: true, annotated: true, substituted: false, questionable: false } };
  expect(applyQualityMacros('IsSet(\'SINUSOID\', "a")', 'SINUSOID', value)).toBe('1');
  expect(applyQualityMacros('IsSet(\'SINUSOID\', "s")', 'SINUSOID', value)).toBe('0');
  expect(() => applyQualityMacros('TagBad(\'SINUSOID\')', 'SINUSOID', value)).toThrow('PI Calculation Controller');
  expect(() => applyQualityMacros('IsSet(\'SINUSOID\', "q")', 'SINUSOID', { value: 1 })).toThrow('não disponível');
});
