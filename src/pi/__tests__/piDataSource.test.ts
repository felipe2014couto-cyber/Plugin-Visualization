import type { DataSourceSrv } from '@grafana/runtime';
import { checkPiConnection, PI_DATASOURCE_TYPE, resolvePiDataSource } from '../piDataSource';

function makeDataSource(overrides: Partial<{ uid: string; name: string; isDefault: boolean }> = {}) {
  return {
    uid: 'pi-default',
    name: 'PI Principal',
    type: PI_DATASOURCE_TYPE,
    isDefault: false,
    ...overrides,
  };
}

function makeDataSourceSrv(options: {
  dataSources?: Array<ReturnType<typeof makeDataSource>>;
  testDatasource?: () => Promise<unknown>;
  metricFindQuery?: (query: unknown, options: unknown) => Promise<unknown[]>;
  query?: (request: unknown) => Promise<unknown>;
  getResource?: (path: string) => Promise<unknown>;
  instanceUid?: string;
  instanceType?: string;
}) {
  const getList = jest.fn(() => options.dataSources ?? []);
  const get = jest.fn(async (ref?: { uid?: string; type?: string }) => ({
    uid: options.instanceUid ?? ref?.uid ?? 'pi-default',
    type: options.instanceType ?? PI_DATASOURCE_TYPE,
    testDatasource: options.testDatasource ?? (async () => undefined),
    metricFindQuery: options.metricFindQuery ?? (async () => []),
    query: options.query ?? (async () => ({ data: [] })),
    getResource: options.getResource ?? (async () => ({})),
  }));
  return { getList, get } as unknown as Pick<DataSourceSrv, 'getList' | 'get'>;
}

describe('PI data source integration', () => {
  it('resolve a Data Source PI padrão pela identidade estável', () => {
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ uid: 'pi-secondary' }), makeDataSource({ uid: 'pi-default', isDefault: true })],
    });

    expect(resolvePiDataSource(dataSourceSrv)).toEqual({
      uid: 'pi-default',
      name: 'PI Principal',
      type: PI_DATASOURCE_TYPE,
    });
    expect(dataSourceSrv.getList).toHaveBeenCalledWith({ type: PI_DATASOURCE_TYPE });
  });

  it('informa conectado quando a verificação da Data Source tem sucesso', async () => {
    const dataSourceSrv = makeDataSourceSrv({ dataSources: [makeDataSource({ isDefault: true })] });

    await expect(checkPiConnection(dataSourceSrv)).resolves.toEqual({
      status: 'connected',
      dataSource: { uid: 'pi-default', name: 'PI Principal', type: PI_DATASOURCE_TYPE },
    });
    expect(dataSourceSrv.get).toHaveBeenCalledWith({ uid: 'pi-default', type: PI_DATASOURCE_TYPE });
  });

  it('informa erro controlado quando a verificação falha', async () => {
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      testDatasource: async () => Promise.reject(new Error('unavailable')),
    });

    await expect(checkPiConnection(dataSourceSrv)).resolves.toEqual({
      status: 'error',
      dataSource: { uid: 'pi-default', name: 'PI Principal', type: PI_DATASOURCE_TYPE },
    });
  });

  it('informa não configurado sem tentar consultar ou pesquisar tags', async () => {
    const dataSourceSrv = makeDataSourceSrv({});

    await expect(checkPiConnection(dataSourceSrv)).resolves.toEqual({ status: 'not-configured' });
    expect(dataSourceSrv.get).not.toHaveBeenCalled();
  });

  it('pesquisa PI Points pelo contrato metricFindQuery e preserva a identidade', async () => {
    const metricFindQuery = jest.fn()
      .mockResolvedValueOnce([{ text: 'pims', WebId: 'server-webid' }])
      .mockResolvedValueOnce([
        { text: 'LFI_A268SV_TEMPERATURA_AMBIENTE', WebId: 'point-webid', Path: '\\\\pims\\LFI_A268SV_TEMPERATURA_AMBIENTE', PointType: 'Float32' },
      ]);
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      metricFindQuery,
    });

    const { searchPiPoints } = await import('../piDataSource');
    await expect(searchPiPoints(' LFI_A268SV_TEMPERATURA_AMBIENTE ', dataSourceSrv)).resolves.toEqual([
      {
        name: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
        webId: 'point-webid',
        path: '\\\\pims\\LFI_A268SV_TEMPERATURA_AMBIENTE',
        pointType: 'Float32',
        dataSourceUid: 'pi-default',
      },
    ]);
    expect(metricFindQuery).toHaveBeenNthCalledWith(1, { type: 'dataserver' }, { isPiPoint: true });
    expect(metricFindQuery).toHaveBeenNthCalledWith(
      2,
      {
        path: '',
        webId: 'server-webid',
        pointName: 'LFI_A268SV_TEMPERATURA_AMBIENTE*',
        type: 'pipoint',
      },
      { isPiPoint: true },
    );
  });

  it('não pesquisa quando o termo está vazio', async () => {
    const dataSourceSrv = makeDataSourceSrv({ dataSources: [makeDataSource({ isDefault: true })] });
    const { searchPiPoints } = await import('../piDataSource');

    await expect(searchPiPoints('   ', dataSourceSrv)).resolves.toEqual([]);
    expect(dataSourceSrv.getList).not.toHaveBeenCalled();
  });

  it('consulta o valor atual pela query de PI Point e normaliza o DataFrame', async () => {
    const query = jest.fn(async (_request: unknown) => ({
      data: [{
        fields: [
          { name: 'Time', values: ['2026-08-06T12:00:00.000Z'] },
          { name: 'LFI_A268SV_TEMPERATURA_AMBIENTE', values: [23.48] },
        ],
      }],
    }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });

    const { getPiPointCurrentValue } = await import('../piDataSource');
    await expect(getPiPointCurrentValue({
      dataSourceUid: 'pi-default',
      serverPath: 'pims',
      pointName: 'LFI_A268SV_TEMPERATURA_AMBIENTE',
    }, dataSourceSrv)).resolves.toEqual({
      value: 23.48,
      timestamp: '2026-08-06T12:00:00.000Z',
    });

    const request = query.mock.calls[0][0] as { targets: Array<Record<string, unknown>> };
    expect(request.targets[0]).toMatchObject({
      target: 'pims;LFI_A268SV_TEMPERATURA_AMBIENTE',
      isPiPoint: true,
      useLastValue: { enable: true },
      digitalStates: { enable: true },
    });
    expect(request.targets[0]).not.toHaveProperty('recordedValues.enable', true);
    expect(dataSourceSrv.get).toHaveBeenCalledWith({ uid: 'pi-default', type: PI_DATASOURCE_TYPE });
  });

  it('preserva zero, timestamp numérico e campos de qualidade disponíveis', async () => {
    const timestamp = Date.parse('2026-08-06T12:00:00.000Z');
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query: async () => ({
        data: [{
          refId: 'A',
          fields: [
            { name: 'Time', values: [timestamp] },
            { name: 'Good', values: [true] },
            { name: 'TAG_ZERO', values: [0] },
            { name: 'Questionable', values: [false] },
          ],
        }],
      }),
    });
    const { getPiPointCurrentValue } = await import('../piDataSource');

    await expect(getPiPointCurrentValue({
      dataSourceUid: 'pi-default',
      serverPath: 'pims',
      pointName: 'TAG_ZERO',
    }, dataSourceSrv)).resolves.toEqual({
      value: 0,
      timestamp: '2026-08-06T12:00:00.000Z',
      quality: { Good: true, Questionable: false },
    });
  });

  it('rejeita de forma controlada instância incompatível resolvida pelo UID', async () => {
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      instanceType: 'other-datasource',
    });
    const { getPiPointCurrentValue } = await import('../piDataSource');

    await expect(getPiPointCurrentValue({
      dataSourceUid: 'pi-default',
      serverPath: 'pims',
      pointName: 'TAG_A',
    }, dataSourceSrv)).rejects.toThrow('não é compatível com OSIsoft-PI');
  });

  it('preserva estado digital/textual e transforma respostas vazias ou com erro em falha controlada', async () => {
    const textQuery = jest.fn(async () => ({
      data: [{ fields: [{ name: 'Time', values: ['2026-08-06T12:00:00.000Z'] }, { name: 'State', values: ['Running'] }] }],
    }));
    const textDataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query: textQuery,
    });
    const { getPiPointCurrentValue } = await import('../piDataSource');
    await expect(getPiPointCurrentValue({ dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'State' }, textDataSourceSrv))
      .resolves.toEqual({ value: 'Running', timestamp: '2026-08-06T12:00:00.000Z' });

    const emptyDataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query: async () => ({ data: [{ fields: [{ name: 'Time', values: ['2026-08-06T12:00:00.000Z'] }, { name: 'State', values: [null] }] }] }),
    });
    await expect(getPiPointCurrentValue({ dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'State' }, emptyDataSourceSrv))
      .rejects.toThrow('sem valor atual');

    const errorDataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query: async () => ({ data: [], error: { message: 'backend unavailable' } }),
    });
    await expect(getPiPointCurrentValue({ dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'State' }, errorDataSourceSrv))
      .rejects.toThrow('backend unavailable');
  });

  it('agrupa targets do mesmo UID, usa refId estável e associa cada DataFrame ao binding', async () => {
    const query = jest.fn(async (_request: unknown) => ({
      data: [
        { refId: 'B', fields: [{ name: 'Time', values: ['2026-08-06T12:00:00.000Z'] }, { name: 'TAG_B', values: ['Running'] }] },
        { refId: 'A', fields: [{ name: 'Time', values: ['2026-08-06T12:00:01.000Z'] }, { name: 'TAG_A', values: [10.2] }] },
      ],
    }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });

    const { getPiPointsCurrentValues } = await import('../piDataSource');
    const tagA = { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'TAG_A' };
    const tagB = { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'TAG_B' };
    const results = await getPiPointsCurrentValues([tagB, tagA, tagA], dataSourceSrv);

    expect(query).toHaveBeenCalledTimes(1);
    const request = query.mock.calls[0][0] as { targets: Array<Record<string, unknown>> };
    expect(request.targets).toEqual([
      expect.objectContaining({ refId: 'A', target: 'pims;TAG_A' }),
      expect.objectContaining({ refId: 'B', target: 'pims;TAG_B' }),
    ]);
    expect(results['pi-default\u0000pims\u0000TAG_A']).toEqual({
      status: 'success',
      value: { value: 10.2, timestamp: '2026-08-06T12:00:01.000Z' },
    });
    expect(results['pi-default\u0000pims\u0000TAG_B']).toEqual({
      status: 'success',
      value: { value: 'Running', timestamp: '2026-08-06T12:00:00.000Z' },
    });
    expect(request.targets[0]).toMatchObject({
      useLastValue: { enable: true },
      digitalStates: { enable: true },
      recordedValues: { enable: false },
      interpolate: { enable: false },
    });
  });

  it('mantém respostas parciais independentes quando um target não retorna frame', async () => {
    const query = jest.fn(async (_request: unknown) => ({
      data: [{ refId: 'A', fields: [{ name: 'TAG_A', values: [10.2] }] }],
    }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const { getPiPointsCurrentValues } = await import('../piDataSource');
    const results = await getPiPointsCurrentValues([
      { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'TAG_A' },
      { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'TAG_B' },
    ], dataSourceSrv);

    expect(results['pi-default\u0000pims\u0000TAG_A']).toMatchObject({ status: 'success' });
    expect(results['pi-default\u0000pims\u0000TAG_B']).toMatchObject({
      status: 'error',
      error: expect.any(Error),
    });
  });

  it('consulta histórico numérico com Plot e normaliza Time/Value', async () => {
    const query = jest.fn(async (_request: unknown) => ({
      data: [{
        refId: 'A',
        fields: [
          { name: 'Time', values: ['2026-08-06T12:00:02.000Z', '2026-08-06T12:00:01.000Z'] },
          { name: 'SINUSOID', values: [3.5, -1.25] },
        ],
      }],
    }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-06T12:00:02.000Z'));

    const { getPiTrendHistory } = await import('../piDataSource');
    await expect(getPiTrendHistory({
      dataSourceUid: 'pi-default',
      serverPath: 'pims',
      pointName: 'SINUSOID',
    }, dataSourceSrv)).resolves.toEqual({
      pointName: 'SINUSOID',
      points: [
        { time: Date.parse('2026-08-06T12:00:01.000Z'), value: -1.25 },
        { time: Date.parse('2026-08-06T12:00:02.000Z'), value: 3.5 },
      ],
    });

    const request = query.mock.calls[0][0] as { targets: Array<Record<string, unknown>>; startTime: number; endTime: number; range: unknown };
    expect(request.targets[0]).toMatchObject({
      refId: 'A',
      target: 'pims;SINUSOID',
      useLastValue: { enable: false },
      recordedValues: { enable: false, boundaryType: 'Inside' },
      interpolate: { enable: false },
      digitalStates: { enable: true },
    });
    expect(request.endTime - request.startTime).toBe(60 * 60 * 1000);
    expect(request.range).toBeDefined();
    nowSpy.mockRestore();
  });

  it('agrupa histórico por UID, deduplica e associa frames por refId', async () => {
    const query = jest.fn(async (_request: unknown) => ({
      data: [
        { refId: 'B', fields: [{ name: 'Time', values: ['2026-08-06T12:00:00.000Z'] }, { name: 'TAG_B', values: [2] }] },
        { refId: 'A', fields: [{ name: 'Time', values: ['2026-08-06T12:00:00.000Z'] }, { name: 'TAG_A', values: [1] }] },
      ],
    }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const { getPiTrendsHistory } = await import('../piDataSource');
    const tagA = { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'TAG_A' };
    const tagB = { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'TAG_B' };
    const results = await getPiTrendsHistory([tagB, tagA, tagA], dataSourceSrv);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatchObject({
      targets: [
        expect.objectContaining({ refId: 'A', target: 'pims;TAG_A' }),
        expect.objectContaining({ refId: 'B', target: 'pims;TAG_B' }),
      ],
    });
    expect(results['pi-default\u0000pims\u0000TAG_A']).toMatchObject({ status: 'success', series: { points: [{ value: 1 }] } });
    expect(results['pi-default\u0000pims\u0000TAG_B']).toMatchObject({ status: 'success', series: { points: [{ value: 2 }] } });
  });

  it('envia vinte tags em uma consulta com refIds exclusivos e prévia limitada', async () => {
    const query = jest.fn(async (_request: unknown) => ({ data: [] }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const bindings = Array.from({ length: 20 }, (_, index) => ({
      dataSourceUid: 'pi-default',
      serverPath: 'pims',
      pointName: `TAG_${index + 1}`,
    }));
    const { getPiTrendsPreviewForRange } = await import('../piDataSource');

    await getPiTrendsPreviewForRange(
      bindings,
      { from: 1_000, to: 2_000 },
      dataSourceSrv,
      { maxDataPoints: 250 },
    );

    expect(query).toHaveBeenCalledTimes(1);
    const request = query.mock.calls[0][0] as {
      maxDataPoints: number;
      targets: Array<{ refId: string; target: string }>;
    };
    expect(request.maxDataPoints).toBe(250);
    expect(request.targets).toHaveLength(20);
    expect(new Set(request.targets.map(({ refId }) => refId)).size).toBe(20);
    expect(request.targets.every((target) => target.target.startsWith('pims;TAG_'))).toBe(true);
  });

  it('divide somente lotes acima de vinte targets e mantém refIds únicos em cada chamada', async () => {
    const query = jest.fn(async (_request: unknown) => ({ data: [] }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const bindings = Array.from({ length: 21 }, (_, index) => ({
      dataSourceUid: 'pi-default',
      serverPath: 'pims',
      pointName: `TAG_${index + 1}`,
    }));
    const { getPiPointsCurrentValues } = await import('../piDataSource');

    await getPiPointsCurrentValues(bindings, dataSourceSrv);

    expect(query).toHaveBeenCalledTimes(2);
    const targetBatches = query.mock.calls.map(([request]) => (
      request as unknown as { targets: Array<{ refId: string }> }
    ).targets);
    expect(targetBatches.map((targets) => targets.length)).toEqual([20, 1]);
    expect(targetBatches.every((targets) => new Set(targets.map(({ refId }) => refId)).size === targets.length)).toBe(true);
  });

  it('limita a duas chamadas de datasource em paralelo', async () => {
    const resolvers: Array<(response: { data: unknown[] }) => void> = [];
    const query = jest.fn(() => new Promise<{ data: unknown[] }>((resolve) => resolvers.push(resolve)));
    const dataSourceSrv = makeDataSourceSrv({ dataSources: [makeDataSource({ isDefault: true })], query });
    const bindings = Array.from({ length: 41 }, (_, index) => ({
      dataSourceUid: 'pi-default',
      serverPath: 'pims',
      pointName: `TAG_${index + 1}`,
    }));
    const { getPiPointsCurrentValues } = await import('../piDataSource');

    const result = getPiPointsCurrentValues(bindings, dataSourceSrv);
    await Promise.resolve();
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(2);

    resolvers[0]?.({ data: [] });
    for (let index = 0; index < 6; index += 1) {
      await Promise.resolve();
    }
    expect(query).toHaveBeenCalledTimes(3);
    resolvers[1]?.({ data: [] });
    resolvers[2]?.({ data: [] });
    await result;
  });

  it('envia o intervalo explícito da barra de tempo na consulta histórica', async () => {
    const query = jest.fn(async (_request: unknown) => ({ data: [] }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const from = Date.parse('2026-08-05T12:00:00.000Z');
    const to = Date.parse('2026-08-07T12:00:00.000Z');
    const { getPiTrendsHistoryForRange } = await import('../piDataSource');

    await getPiTrendsHistoryForRange([
      { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'SINUSOID' },
    ], { from, to }, dataSourceSrv);

    expect(query.mock.calls[0][0]).toMatchObject({
      startTime: from,
      endTime: to,
      maxDataPoints: 360,
      targets: [expect.objectContaining({
        recordedValues: { enable: false, boundaryType: 'Inside' },
        interpolate: { enable: false },
        summary: { enable: false, types: [] },
        useLastValue: { enable: false },
      })],
    });
    expect((query.mock.calls[0][0] as { range: { from: { valueOf: () => number }; to: { valueOf: () => number } } }).range.from.valueOf()).toBe(from);
    expect((query.mock.calls[0][0] as { range: { from: { valueOf: () => number }; to: { valueOf: () => number } } }).range.to.valueOf()).toBe(to);
  });

  it('consulta PlotData pelo proxy do datasource usando o WebID da tag', async () => {
    const getResource = jest.fn(async () => ({
      Items: [
        { Timestamp: '2026-08-05T12:00:00.000Z', Value: 10 },
        { Timestamp: '2026-08-05T12:05:00.000Z', Value: 20 },
      ],
    }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      getResource,
    });
    const from = Date.parse('2026-08-05T12:00:00.000Z');
    const to = Date.parse('2026-08-05T13:00:00.000Z');
    const { getPiTrendsPlotDataForRange } = await import('../piDataSource');

    await expect(getPiTrendsPlotDataForRange([
      { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'SINUSOID', webId: 'point/webid' },
    ], { from, to }, dataSourceSrv, { maxDataPoints: 500 })).resolves.toEqual({
      'pi-default\u0000pims\u0000SINUSOID': {
        status: 'success',
        series: {
          pointName: 'SINUSOID',
          points: [{ time: from, value: 10 }, { time: from + 5 * 60 * 1000, value: 20 }],
        },
      },
    });
    expect(getResource).toHaveBeenCalledWith(
      '/streams/point%2Fwebid/plot?startTime=2026-08-05T12%3A00%3A00.000Z&endTime=2026-08-05T13%3A00%3A00.000Z&intervals=500',
    );
  });

  it('usa interpolação adaptativa limitada pela resolução visual na prévia rápida do Trend', async () => {
    const query = jest.fn(async (_request: unknown) => ({ data: [] }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const to = Date.parse('2026-08-07T12:00:00.000Z');
    const from = to - 8 * 60 * 60 * 1000;
    const { getPiTrendsPreviewForRange } = await import('../piDataSource');

    await getPiTrendsPreviewForRange([
      { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'SINUSOID' },
    ], { from, to }, dataSourceSrv);

    expect(query.mock.calls[0][0]).toMatchObject({
      startTime: from,
      endTime: to,
      targets: [expect.objectContaining({
        interpolate: { enable: true, interval: '81s' },
        recordedValues: { enable: false, boundaryType: 'Inside' },
      })],
    });
  });

  it('aplica teto seguro à resolução refinada solicitada', async () => {
    const query = jest.fn(async (_request: unknown) => ({ data: [] }));
    const dataSourceSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query,
    });
    const to = Date.parse('2026-08-07T12:00:00.000Z');
    const from = to - 8 * 60 * 60 * 1000;
    const { getPiTrendsRecordedHistoryForRange } = await import('../piDataSource');

    await getPiTrendsRecordedHistoryForRange([
      { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'SINUSOID' },
    ], { from, to }, dataSourceSrv, { maxDataPoints: 6_000 });

    expect(query.mock.calls[0][0]).toMatchObject({
      startTime: from,
      endTime: to,
      maxDataPoints: 2_000,
      targets: [expect.objectContaining({
        interpolate: { enable: false },
        recordedValues: { enable: true, maxNumber: 2_000, boundaryType: 'Inside' },
      })],
    });
  });

  it.each([8, 24, 7 * 24])('mantém maxDataPoints constante ao navegar por %i horas', async (hours) => {
    const query = jest.fn(async (_request: unknown) => ({ data: [] }));
    const dataSourceSrv = makeDataSourceSrv({ dataSources: [makeDataSource({ isDefault: true })], query });
    const to = Date.parse('2026-08-07T12:00:00.000Z');
    const { getPiTrendsHistoryForRange } = await import('../piDataSource');

    await getPiTrendsHistoryForRange([
      { dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'SINUSOID' },
    ], { from: to - hours * 60 * 60 * 1000, to }, dataSourceSrv, { maxDataPoints: 1_200 });

    expect(query.mock.calls[0][0]).toMatchObject({ maxDataPoints: 1_200 });
  });

  it('controla série vazia e preserva mudanças de estado de PI Points digitais/string', async () => {
    const emptyQuery = jest.fn(async () => ({ data: [{ refId: 'A', fields: [{ name: 'Time', values: [] }, { name: 'SINUSOID', values: [] }] }] }));
    const emptySrv = makeDataSourceSrv({ dataSources: [makeDataSource({ isDefault: true })], query: emptyQuery });
    const { getPiTrendHistory } = await import('../piDataSource');
    await expect(getPiTrendHistory({ dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'SINUSOID' }, emptySrv))
      .resolves.toEqual({ pointName: 'SINUSOID', points: [] });

    const digitalSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query: async () => ({ data: [{ refId: 'A', fields: [
        { name: 'Time', values: ['2026-08-06T12:00:00.000Z', '2026-08-06T12:05:00.000Z'] },
        { name: 'State', values: ['Running', 'Stopped'] },
      ] }] }),
    });
    await expect(getPiTrendHistory({ dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'State' }, digitalSrv))
      .resolves.toEqual({
        pointName: 'State',
        points: [],
        states: [
          { time: Date.parse('2026-08-06T12:00:00.000Z'), value: 'Running' },
          { time: Date.parse('2026-08-06T12:05:00.000Z'), value: 'Stopped' },
        ],
      });
  });
});
