import { PiCalculationExecutionError } from '../../pi/piCalculation';
import { capturePiGoldenRuntime, discoverPiGoldenAlarmStateSets, discoverPiGoldenPerformanceEquations, inspectPiGoldenQualityEvidence, PiGoldenRuntimeUnavailableError, PiGoldenTimestampMismatchError } from '../piGoldenRuntime';

jest.mock('../../pi/piCalculation', () => ({
  ...jest.requireActual('../../pi/piCalculation'),
  evaluatePiExpression: jest.fn(),
}));

jest.mock('../../pi/piDataSource', () => ({
  ...jest.requireActual('../../pi/piDataSource'),
  getPiRecordedRawHistory: jest.fn(),
  getPiDigitalStateSets: jest.fn(),
  getPiPerformanceEquationPointAttributes: jest.fn(),
  searchPiPointsWithStatus: jest.fn(),
}));

const evaluate = require('../../pi/piCalculation').evaluatePiExpression as jest.Mock;
const getRecorded = require('../../pi/piDataSource').getPiRecordedRawHistory as jest.Mock;
const getDigitalStateSets = require('../../pi/piDataSource').getPiDigitalStateSets as jest.Mock;
const getPeAttributes = require('../../pi/piDataSource').getPiPerformanceEquationPointAttributes as jest.Mock;
const searchPoints = require('../../pi/piDataSource').searchPiPointsWithStatus as jest.Mock;

const request = {
  runtime: 'grafana-gpa' as const,
  functionName: 'BadVal' as const,
  binding: { dataSourceUid: 'gpa', serverPath: 'PISRV', pointName: 'TAG' },
  expression: "BadVal('TAG')",
  scanId: 'scan-1',
  evaluationTimestamp: '2026-01-01T00:00:00.000Z',
  input: 'TAG',
};

describe('PI golden runtime adapter', () => {
  afterEach(() => { evaluate.mockReset(); getRecorded.mockReset(); getDigitalStateSets.mockReset(); getPeAttributes.mockReset(); searchPoints.mockReset(); });

  it('normaliza o resultado PI sem perder timestamp, quality e Digital State', async () => {
    evaluate.mockResolvedValue({
      value: { name: 'Alarm', value: 313, isSystem: false },
      timestamp: '2026-01-01T00:00:00.000Z',
      good: true,
      questionable: false,
      substituted: false,
      annotated: true,
      errors: [],
    });
    await expect(capturePiGoldenRuntime(request)).resolves.toMatchObject({
      source: 'pi-real',
      context: { dataSourceUid: 'gpa', dataSourceType: 'gridprotectionalliance-osisoftpi-datasource', serverPath: 'PISRV', resolution: 'binding' },
      piExpected: {
        kind: 'value',
        value: 'Alarm',
        timestamp: '2026-01-01T00:00:00.000Z',
        quality: { Good: true, Questionable: false, Substituted: false, Annotated: true },
        digitalState: { name: 'Alarm', code: 313, isSystem: false },
      },
    });
  });

  it('preserva erro como categoria, sem convertê-lo em valor', async () => {
    evaluate.mockRejectedValue(new PiCalculationExecutionError('Calc Failed'));
    await expect(capturePiGoldenRuntime(request)).resolves.toMatchObject({ piExpected: { kind: 'error', code: 'CALC_FAILED' } });
  });

  it('envia o timestamp solicitado ao modo times e gera scanId normalizado', async () => {
    evaluate.mockResolvedValue({ value: 3, timestamp: '2026-01-01T00:00:00.000Z', good: true, errors: [] });
    const capture = await capturePiGoldenRuntime(request);
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ mode: 'times', time: '2026-01-01T00:00:00.000Z' }));
    expect(capture).toMatchObject({ scanId: 'golden-2026-01-01T00:00:00.000Z', requestedEvaluationTimestamp: '2026-01-01T00:00:00.000Z', piEvaluationTimestamp: '2026-01-01T00:00:00.000Z' });
  });

  it('rejeita timestamp PI diferente do instante solicitado', async () => {
    evaluate.mockResolvedValue({ value: 3, timestamp: '2026-01-01T01:00:00.000Z', good: true, errors: [] });
    await expect(capturePiGoldenRuntime(request)).rejects.toBeInstanceOf(PiGoldenTimestampMismatchError);
  });

  it('bloqueia timestamp inválido antes de consultar PI', async () => {
    await expect(capturePiGoldenRuntime({ ...request, evaluationTimestamp: "BadVal('sinusoid')" }))
      .rejects.toThrow('Evaluation timestamp deve ser um timestamp ISO válido.');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('não usa o Controller isolado como golden de função stateful', async () => {
    await expect(capturePiGoldenRuntime({ ...request, functionName: 'Delay', expression: 'Delay(1,1,2)' }))
      .rejects.toBeInstanceOf(PiGoldenRuntimeUnavailableError);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('resolve um único Data Server para Sqr sem criar binding', async () => {
    evaluate.mockResolvedValue({ value: 3, timestamp: '2026-01-01T00:00:00.000Z', good: true, errors: [] });
    const dataSourceSrv = {
      getList: jest.fn(() => [{ uid: 'gpa', name: 'GPA', type: 'gridprotectionalliance-osisoftpi-datasource', isDefault: true }]),
      get: jest.fn(async () => ({ uid: 'gpa', type: 'gridprotectionalliance-osisoftpi-datasource', metricFindQuery: async () => [{ Name: 'PISRV', WebId: 'server-1' }] })),
    };
    await expect(capturePiGoldenRuntime({ ...request, binding: undefined, functionName: 'Sqr', expression: 'Sqr(9)', dataSourceSrv: dataSourceSrv as never }))
      .resolves.toMatchObject({ piExpected: { kind: 'value', value: 3 }, context: { dataSourceUid: 'gpa', resolution: 'datasource-single-server' }, executionSource: 'pi-calculation-controller' });
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ dataSourceUid: 'gpa', dataServerWebId: 'server-1', binding: undefined }));
  });

  it('não escolhe arbitrariamente entre múltiplos Data Servers', async () => {
    const dataSourceSrv = {
      getList: jest.fn(() => [{ uid: 'gpa', name: 'GPA', type: 'gridprotectionalliance-osisoftpi-datasource', isDefault: true }]),
      get: jest.fn(async () => ({ uid: 'gpa', type: 'gridprotectionalliance-osisoftpi-datasource', metricFindQuery: async () => [
        { Name: 'PISRV-A', WebId: 'server-a' }, { Name: 'PISRV-B', WebId: 'server-b' },
      ] })),
    };
    await expect(capturePiGoldenRuntime({ ...request, binding: undefined, functionName: 'Sqr', expression: 'Sqr(9)', dataSourceSrv: dataSourceSrv as never }))
      .rejects.toThrow('Não foi possível determinar unicamente o PI Data Server');
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('preserva somente candidatos reais de quality, inclusive false distinto de ausência', async () => {
    getRecorded.mockResolvedValue([
      { time: Date.parse('2026-01-01T00:00:00Z'), value: 1, quality: { good: true, questionable: false } },
      { time: Date.parse('2026-01-01T00:01:00Z'), value: { Name: 'I/O Timeout', Value: 248, IsSystem: true }, quality: { good: false, substituted: true }, recorded: true, origin: 'recorded' },
      { time: Date.parse('2026-01-01T00:02:00Z'), value: 3, quality: { annotated: true } },
    ]);
    await expect(inspectPiGoldenQualityEvidence({
      runtime: 'grafana-gpa',
      binding: { ...request.binding, webId: 'point-webid' },
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-01T00:03:00Z',
    })).resolves.toEqual({
      source: 'pi-real',
      runtime: 'grafana-gpa',
      executionSource: 'pi-web-api-recorded',
      context: { dataSourceUid: 'gpa', dataSourceType: 'gridprotectionalliance-osisoftpi-datasource', serverPath: 'PISRV', resolution: 'binding' },
      pointName: 'TAG',
      range: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T00:03:00.000Z' },
      returnedEventCount: 3,
      candidates: [
        {
          timestamp: '2026-01-01T00:01:00.000Z',
          value: { name: 'I/O Timeout', code: 248, isSystem: true },
          quality: { good: false, substituted: true },
          recorded: true,
          origin: 'recorded',
        },
        { timestamp: '2026-01-01T00:02:00.000Z', value: 3, quality: { annotated: true } },
      ],
    });
    expect(getRecorded).toHaveBeenCalledWith(
      expect.objectContaining({ webId: 'point-webid' }),
      { from: Date.parse('2026-01-01T00:00:00.000Z'), to: Date.parse('2026-01-01T00:03:00.000Z') },
      expect.objectContaining({ selectedFields: expect.arrayContaining(['Good', 'Questionable', 'Substituted', 'Annotated']) }),
      undefined,
    );
  });

  it('rejeita varredura sem WebId ou com intervalo invertido antes de chamar GPA', async () => {
    await expect(inspectPiGoldenQualityEvidence({
      runtime: 'grafana-gpa', binding: request.binding,
      from: '2026-01-01T00:00:00Z', to: '2026-01-01T00:01:00Z',
    })).rejects.toThrow('WebId');
    await expect(inspectPiGoldenQualityEvidence({
      runtime: 'grafana-gpa', binding: { ...request.binding, webId: 'point-webid' },
      from: '2026-01-01T00:02:00Z', to: '2026-01-01T00:01:00Z',
    })).rejects.toThrow('posterior');
    expect(getRecorded).not.toHaveBeenCalled();
  });

  it('descobre somente Alarm State Sets aceitos pelo decoder estrutural', async () => {
    const validStates = [
      { name: '----', value: 0 },
      ...Array.from({ length: 9 }, (_, index) => ({ name: `active-${index + 1}`, value: index + 1 })),
      { name: 'LOW', value: 10 }, { name: '3 3', value: 11 },
    ];
    getDigitalStateSets.mockResolvedValue([
      { name: 'Normal states', isSystem: false, states: [{ name: 'Alarm', value: 1 }] },
      { name: 'Pialarm33', webId: 'alarm-set', isSystem: false, states: validStates },
    ]);
    await expect(discoverPiGoldenAlarmStateSets({ runtime: 'grafana-gpa', binding: request.binding }))
      .resolves.toMatchObject({
        source: 'pi-real', executionSource: 'pi-enumeration-set',
        structuralAlarmStateSets: [{ name: 'Pialarm33', webId: 'alarm-set', states: expect.arrayContaining([
          expect.objectContaining({ name: '----', code: 0, decoded: expect.objectContaining({ conditionCode: 0 }) }),
        ]) }],
      });
    expect(getDigitalStateSets).toHaveBeenCalledWith(request.binding, undefined);
  });

  it('descobre candidatos PE por atributos brutos e classifica Clock/Event sem usar PointSource isoladamente', async () => {
    searchPoints.mockResolvedValue({ results: [
      { name: 'OUT_EVENT', webId: 'event', path: '\\PIServers[pims]\\OUT_EVENT', dataSourceUid: 'gpa' },
      { name: 'OUT_DELAY', webId: 'delay', path: '\\PIServers[pims]\\OUT_DELAY', dataSourceUid: 'gpa' },
      { name: 'NOT_PE', webId: 'other', path: '\\PIServers[pims]\\NOT_PE', dataSourceUid: 'gpa' },
    ], hasMore: true });
    getPeAttributes.mockImplementation(async (binding: { pointName: string; webId: string }) => ({
      name: binding.pointName, webId: binding.webId,
      ...(binding.pointName === 'OUT_EVENT' ? { pointSource: 'R', exDesc: "event=TRIGGER_TAG, NoOutput()", location3: 99, location4: 7 } : {}),
      ...(binding.pointName === 'OUT_DELAY' ? { pointSource: 'C', exDesc: "Delay('INPUT',1,2)", location4: 2, scan: 1 } : {}),
      ...(binding.pointName === 'NOT_PE' ? { pointSource: 'C', exDesc: 'not a calculation', location4: 3 } : {}),
    }));
    await expect(discoverPiGoldenPerformanceEquations({ runtime: 'grafana-gpa', nameFilter: 'OUT*', limit: 100, startIndex: 100 }))
      .resolves.toMatchObject({
        source: 'pi-real', executionSource: 'pi-point-attributes', nameFilter: 'OUT*', startIndex: 100, limit: 100, hasMore: true,
        candidates: [
          expect.objectContaining({ outputPoint: 'OUT_DELAY', pointSource: 'C', exDesc: "Delay('INPUT',1,2)", scheduleType: 'clock', location4: 2, detectedFunctions: ['Delay'], classification: 'LIKELY_PE_CLOCK' }),
          expect.objectContaining({ outputPoint: 'OUT_EVENT', pointSource: 'R', scheduleType: 'event', triggerTag: 'TRIGGER_TAG', calculationExpression: 'NoOutput()', location3: 99, location4: 7, detectedFunctions: ['NoOutput'], classification: 'LIKELY_PE_EVENT' }),
          expect.objectContaining({ outputPoint: 'NOT_PE', classification: 'NOT_PE', detectedFunctions: [] }),
        ],
      });
    expect(searchPoints).toHaveBeenCalledWith({ term: 'OUT*', limit: 100, startIndex: 100 }, undefined);
  });
});
