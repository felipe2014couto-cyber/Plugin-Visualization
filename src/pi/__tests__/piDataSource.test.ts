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
}) {
  const getList = jest.fn(() => options.dataSources ?? []);
  const get = jest.fn(async () => ({
    testDatasource: options.testDatasource ?? (async () => undefined),
    metricFindQuery: options.metricFindQuery ?? (async () => []),
    query: options.query ?? (async () => ({ data: [] })),
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
        { text: 'LFI_A268SV_TEMPERATURA_AMBIENTE', WebId: 'point-webid', Path: '\\\\pims\\LFI_A268SV_TEMPERATURA_AMBIENTE' },
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

  it('usa interpolação leve de 5 minutos na prévia rápida do Trend', async () => {
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
        interpolate: { enable: true, interval: '5m' },
        recordedValues: { enable: false, boundaryType: 'Inside' },
      })],
    });
  });

  it('solicita até 30000 Recorded Values para o cache detalhado', async () => {
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
    ], { from, to }, dataSourceSrv);

    expect(query.mock.calls[0][0]).toMatchObject({
      startTime: from,
      endTime: to,
      targets: [expect.objectContaining({
        interpolate: { enable: false },
        recordedValues: { enable: true, maxNumber: 30_000, boundaryType: 'Inside' },
      })],
    });
  });

  it('controla série vazia, erro e PI Point digital/string', async () => {
    const emptyQuery = jest.fn(async () => ({ data: [{ refId: 'A', fields: [{ name: 'Time', values: [] }, { name: 'SINUSOID', values: [] }] }] }));
    const emptySrv = makeDataSourceSrv({ dataSources: [makeDataSource({ isDefault: true })], query: emptyQuery });
    const { getPiTrendHistory } = await import('../piDataSource');
    await expect(getPiTrendHistory({ dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'SINUSOID' }, emptySrv))
      .resolves.toEqual({ pointName: 'SINUSOID', points: [] });

    const digitalSrv = makeDataSourceSrv({
      dataSources: [makeDataSource({ isDefault: true })],
      query: async () => ({ data: [{ refId: 'A', fields: [{ name: 'Time', values: ['2026-08-06T12:00:00.000Z'] }, { name: 'State', values: ['Running'] }] }] }),
    });
    await expect(getPiTrendHistory({ dataSourceUid: 'pi-default', serverPath: 'pims', pointName: 'State' }, digitalSrv))
      .rejects.toThrow('somente PI Points numéricos');
  });
});
