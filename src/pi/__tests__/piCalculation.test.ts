import type { DataSourceSrv } from '@grafana/runtime';
import { classifyPiExpression, evaluatePiExpression, PiCalculationExecutionError, PiCalculationNoMatchError, probePiCalculationController, resetPiCalculationCachesForTests } from '../piCalculation';
import { PI_DATASOURCE_TYPE } from '../piDataSource';

const binding = { dataSourceUid: 'pi-default', serverPath: 'PIMS', pointName: 'SINUSOID' };

function dataSourceSrv(getResource: (path: string) => Promise<unknown>) {
  return {
    get: jest.fn(async () => ({
      uid: 'pi-default',
      type: PI_DATASOURCE_TYPE,
      metricFindQuery: async () => [{ Name: 'PIMS', WebId: 'server-webid' }],
      getResource,
    })),
  } as unknown as Pick<DataSourceSrv, 'get'>;
}

function item(value: unknown = 3) {
  return { Items: [{ Timestamp: '2026-01-01T00:00:00Z', Value: value, Good: true, UnitsAbbreviation: 'kW' }] };
}

describe('PI Calculation Controller adapter', () => {
  beforeEach(resetPiCalculationCachesForTests);

  it('envia a expressão completa e normaliza valor numérico, string e digital', async () => {
    const getResource = jest.fn()
      .mockResolvedValueOnce(item(3))
      .mockResolvedValueOnce(item(3))
      .mockResolvedValueOnce(item(3))
      .mockResolvedValueOnce(item(3))
      .mockResolvedValueOnce(item(9))
      .mockResolvedValueOnce(item('Running'))
      .mockResolvedValueOnce(item({ Name: 'Shutdown', Value: 248, IsSystem: true }))
      .mockResolvedValueOnce(item(52))
      .mockResolvedValueOnce(item(3600))
      .mockResolvedValueOnce(item(10));
    const srv = dataSourceSrv(getResource);
    await probePiCalculationController(binding, srv);
    await expect(evaluatePiExpression({ binding, expression: '1+2', dataSourceSrv: srv })).resolves.toMatchObject({ value: 9, unitsAbbreviation: 'kW' });
    await expect(evaluatePiExpression({ binding, expression: 'Sqr(9)', dataSourceSrv: srv })).resolves.toMatchObject({ value: 'Running' });
    await expect(evaluatePiExpression({ binding, expression: "TagVal('STATUS', '*')", dataSourceSrv: srv })).resolves.toMatchObject({ value: { name: 'Shutdown', value: 248, isSystem: true } });
    await expect(evaluatePiExpression({ binding, expression: "TagAvg('SINUSOID', '*-1h', '*')", dataSourceSrv: srv })).resolves.toMatchObject({ value: 52 });
    await expect(evaluatePiExpression({ binding, expression: "TimeGT('SINUSOID', '*-1h', '*', 50)", dataSourceSrv: srv })).resolves.toMatchObject({ value: 3600 });
    await expect(evaluatePiExpression({ binding, expression: "IF 'SINUSOID' > 10 THEN 10 ELSE 0", dataSourceSrv: srv })).resolves.toMatchObject({ value: 10 });
    expect(getResource.mock.calls[4][0]).toContain('/calculation/times?');
    expect(getResource.mock.calls[4][0]).toContain('expression=1%2B2');
    expect(getResource.mock.calls[4][0]).toContain('time=*');
  });

  it('não mascara Good=false, Errors, resposta inválida nem Items vazios', async () => {
    const cases = [
      { Items: [{ Value: 1, Good: false }] },
      { Errors: ['PE parsing error'], Items: [] },
      { Items: [] },
      { value: 1 },
    ];
    for (const response of cases) {
      resetPiCalculationCachesForTests();
      await expect(evaluatePiExpression({ binding, expression: 'TagAvg(\'SINUSOID\', \'*-1h\', \'*\')', dataSourceSrv: dataSourceSrv(async () => response) }))
        .rejects.toBeInstanceOf(PiCalculationExecutionError);
    }
  });

  it('distingue no-match de erro real em Find', async () => {
    const response = { Items: [{ Value: { Name: 'No Data', Value: 249, IsSystem: true }, Good: false }] };
    await expect(evaluatePiExpression({ binding, expression: "FindGT('SINUSOID','*-1h','*',50)", dataSourceSrv: dataSourceSrv(async () => response) }))
      .rejects.toBeInstanceOf(PiCalculationNoMatchError);
  });

  it('marca o resultado de Find como timestamp sem inferir pelo tamanho do número', async () => {
    const response = { Items: [{ Timestamp: '2026-09-10T16:00:00Z', Value: 1789009200, Good: true }] };
    await expect(evaluatePiExpression({ binding, expression: "FindLT('SINUSOID','*-1h','*',50)", dataSourceSrv: dataSourceSrv(async () => response) }))
      .resolves.toMatchObject({ value: 1789009200, valueKind: 'timestamp' });
  });

  it('normaliza somente o marcador PI comprovado de NoOutput', async () => {
    const noOutput = { Items: [{ Timestamp: '2026-01-01T00:00:00Z', Value: { Name: 'No Sample', Value: 211, IsSystem: true }, Good: false }] };
    await expect(evaluatePiExpression({ binding, expression: 'NoOutput()', dataSourceSrv: dataSourceSrv(async () => noOutput) }))
      .resolves.toEqual({ kind: 'no-output' });
    await expect(evaluatePiExpression({ binding, expression: 'IF(1=1, NoOutput(), 10)', dataSourceSrv: dataSourceSrv(async () => ({ Items: [{ Value: { Name: 'No Sample', Value: 211, IsSystem: true }, Good: false, Errors: ['Calc Failed'] }] })) }))
      .rejects.toBeInstanceOf(PiCalculationExecutionError);
  });

  it('normaliza o valor temporal aninhado retornado por calculation/summary', async () => {
    const response = { Items: [{ Type: 'Total', Value: {
      Timestamp: '2026-01-01T00:00:00Z', Value: 12.5, Good: true, UnitsAbbreviation: 'kWh',
    } }] };
    await expect(evaluatePiExpression({
      binding,
      expression: "TagTot('SINUSOID', '*-1h', '*')",
      mode: 'summary',
      dataSourceSrv: dataSourceSrv(async () => response),
    })).resolves.toMatchObject({ value: 12.5, timestamp: '2026-01-01T00:00:00Z', unitsAbbreviation: 'kWh' });
  });

  it.each([401, 403, 404, 405, 500, 501])('mantém HTTP %i como indisponibilidade explícita', async (status) => {
    const error = Object.assign(new Error(`HTTP ${status}`), { status });
    await expect(evaluatePiExpression({ binding, expression: 'TagAvg(\'SINUSOID\', \'*-1h\', \'*\')', dataSourceSrv: dataSourceSrv(async () => { throw error; }) }))
      .rejects.toMatchObject({ name: 'PiCalculationUnavailableError', status });
  });

  it('faz probe das quatro rotas e não cacheia 500 como unsupported', async () => {
    const getResource = jest.fn(async (path: string) => {
      if (path.includes('/recorded')) throw Object.assign(new Error('server error'), { status: 500 });
      return item(2);
    });
    const srv = dataSourceSrv(getResource);
    await expect(probePiCalculationController(binding, srv)).resolves.toEqual({ times: 'supported', recorded: 'error', intervals: 'supported', summary: 'supported' });
    await probePiCalculationController(binding, srv);
    expect(getResource).toHaveBeenCalledTimes(8);
  });

  it('compartilha chamada simultânea, usa chave por expressão e reaproveita resultado por pouco tempo', async () => {
    let resolve!: (value: unknown) => void;
    const getResource = jest.fn()
      .mockImplementationOnce(() => new Promise<unknown>((done) => { resolve = done; }))
      .mockResolvedValueOnce(item(4));
    const srv = dataSourceSrv(getResource);
    const first = evaluatePiExpression({ binding, expression: '1+2', dataSourceSrv: srv });
    const second = evaluatePiExpression({ binding, expression: '1+2', dataSourceSrv: srv });
    for (let index = 0; index < 8 && !resolve; index += 1) await Promise.resolve();
    expect(getResource).toHaveBeenCalledTimes(1);
    resolve(item(3));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await evaluatePiExpression({ binding, expression: '1+2', dataSourceSrv: srv });
    expect(getResource).toHaveBeenCalledTimes(1);
    await evaluatePiExpression({ binding, expression: '1+3', dataSourceSrv: srv });
    expect(getResource).toHaveBeenCalledTimes(2);
  });

  it('classifica tokens sem confundir nomes dentro de aspas e só permite fallback local seguro', () => {
    expect(classifyPiExpression("TagAvg('Average', '*-1h', '*')")).toEqual({ target: 'pi', localFallbackSafe: false });
    expect(classifyPiExpression("Average('SINUSOID', '-1h', '*')")).toEqual({ target: 'local', localFallbackSafe: true });
    expect(classifyPiExpression('Sqr(9)')).toEqual({ target: 'pi', localFallbackSafe: true });
    expect(classifyPiExpression('MedianFilt(\'SINUSOID\', 1, 3)')).toEqual({ target: 'pi', localFallbackSafe: false });
    expect(classifyPiExpression('Concat("A", "B")')).toEqual({ target: 'pi', localFallbackSafe: false });
    expect(classifyPiExpression('CONCAT("A", "B")')).toEqual({ target: 'local', localFallbackSafe: true });
    expect(classifyPiExpression('UnknownPimsFunction(1)')).toEqual({ target: 'local', localFallbackSafe: false });
  });
});
