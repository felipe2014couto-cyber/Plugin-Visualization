import {
  dateTime,
  type DataFrame,
  type DataQuery,
  type DataQueryRequest,
  type DataQueryResponse,
  type DataSourceApi,
  type DataSourceInstanceSettings,
  type MetricFindValue,
} from '@grafana/data';
import { getDataSourceSrv, type DataSourceSrv } from '@grafana/runtime';
import { firstValueFrom, type Observable } from 'rxjs';
import type { PiPointBinding } from './piPointBinding';

export const PI_DATASOURCE_TYPE = 'gridprotectionalliance-osisoftpi-datasource';

export type PiConnectionStatus = 'checking' | 'connected' | 'error' | 'not-configured';

export interface PiDataSourceIdentity {
  uid: string;
  name: string;
  type: string;
}

export interface PiConnectionState {
  status: PiConnectionStatus;
  dataSource?: PiDataSourceIdentity;
}

export interface PiPointSearchResult {
  name: string;
  webId?: string;
  path?: string;
  dataSourceUid?: string;
}

export interface PiPointValue {
  value: unknown;
  timestamp?: string;
}

export type PiPointValueResult =
  | { status: 'success'; value: PiPointValue }
  | { status: 'error'; error: Error };

export interface TrendPoint {
  time: number;
  value: number;
}

export interface PiTrendSeries {
  pointName: string;
  points: TrendPoint[];
}

export interface PiTrendTimeRange {
  from: number;
  to: number;
}

export type PiTrendSeriesResult =
  | { status: 'success'; series: PiTrendSeries }
  | { status: 'error'; error: Error };

export function resolvePiDataSource(
  dataSourceSrv: Pick<DataSourceSrv, 'getList'>,
): PiDataSourceIdentity | undefined {
  const compatible = dataSourceSrv.getList({ type: PI_DATASOURCE_TYPE });
  const selected = compatible.find((dataSource) => dataSource.isDefault)
    ?? (compatible.length === 1 ? compatible[0] : undefined);

  return selected ? toPiDataSourceIdentity(selected) : undefined;
}

export async function checkPiConnection(
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiConnectionState> {
  const dataSource = resolvePiDataSource(dataSourceSrv);
  if (!dataSource) {
    return { status: 'not-configured' };
  }

  try {
    const instance = await getResolvedPiDataSource(dataSourceSrv, dataSource);
    await instance.testDatasource();
    return { status: 'connected', dataSource };
  } catch {
    return { status: 'error', dataSource };
  }
}

export async function searchPiPoints(
  term: string,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiPointSearchResult[]> {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) {
    return [];
  }

  const dataSource = resolvePiDataSource(dataSourceSrv);
  if (!dataSource) {
    throw new Error('PI Data Source não configurada');
  }

  const instance = await getResolvedPiDataSource(dataSourceSrv, dataSource);
  if (typeof instance.metricFindQuery !== 'function') {
    throw new Error('A Data Source PI não expõe pesquisa de PI Points');
  }

  const servers = await instance.metricFindQuery({ type: 'dataserver' }, { isPiPoint: true });
  const serverWebId = getMetricField(servers[0], 'WebId');
  if (!serverWebId) {
    return [];
  }

  const pointName = normalizedTerm.endsWith('*') ? normalizedTerm : `${normalizedTerm}*`;
  const points = await instance.metricFindQuery(
    { path: '', webId: serverWebId, pointName, type: 'pipoint' },
    { isPiPoint: true },
  );

  return points.flatMap((point) => {
    const name = getMetricField(point, 'text');
    if (!name) {
      return [];
    }
    return [{
      name,
      webId: getMetricField(point, 'WebId'),
      path: getMetricField(point, 'Path'),
      dataSourceUid: dataSource.uid,
    }];
  });
}

export async function getPiPointCurrentValue(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<PiPointValue> {
  const results = await getPiPointsCurrentValues([binding], dataSourceSrv);
  const result = results[getBindingKey(binding)];
  if (!result || result.status === 'error') {
    throw result?.error ?? new Error('PI Point sem valor atual');
  }
  return result.value;
}

export async function getPiPointsCurrentValues(
  bindings: readonly PiPointBinding[],
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<Record<string, PiPointValueResult>> {
  const uniqueBindings = deduplicateBindings(bindings);
  if (uniqueBindings.length === 0) {
    return {};
  }
  const grouped = groupBindingsByDataSource(uniqueBindings);
  const results: Record<string, PiPointValueResult> = {};

  await Promise.all([...grouped.entries()].map(async ([dataSourceUid, group]) => {
    try {
      const instance = await getResolvedPiDataSource(dataSourceSrv, {
        uid: dataSourceUid,
        name: '',
        type: PI_DATASOURCE_TYPE,
      });
      if (typeof instance.query !== 'function') {
        throw new Error('A Data Source PI não expõe consulta de valores');
      }

      const now = Date.now();
      const response = await resolveQueryResponse(instance.query(buildCurrentValuesRequest(group, now)));
      Object.assign(results, normalizeCurrentValues(response, group));
    } catch (error) {
      for (const binding of group) {
        results[getBindingKey(binding)] = { status: 'error', error: toError(error) };
      }
    }
  }));

  return results;
}

export async function getPiTrendHistory(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<PiTrendSeries> {
  const results = await getPiTrendsHistory([binding], dataSourceSrv);
  const result = results[getBindingKey(binding)];
  if (!result || result.status === 'error') {
    throw result?.error ?? new Error('PI Point sem histórico numérico');
  }
  return result.series;
}

export async function getPiTrendsHistory(
  bindings: readonly PiPointBinding[],
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<Record<string, PiTrendSeriesResult>> {
  const now = Date.now();
  return getPiTrendsHistoryForRange(
    bindings,
    { from: now - 60 * 60 * 1000, to: now },
    dataSourceSrv,
  );
}

export async function getPiTrendsHistoryForRange(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<Record<string, PiTrendSeriesResult>> {
  return queryPiTrendsHistory(bindings, range, dataSourceSrv, 'plot');
}

export async function getPiTrendsPreviewForRange(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<Record<string, PiTrendSeriesResult>> {
  return queryPiTrendsHistory(bindings, range, dataSourceSrv, 'preview');
}

export async function getPiTrendsRecordedHistoryForRange(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<Record<string, PiTrendSeriesResult>> {
  return queryPiTrendsHistory(bindings, range, dataSourceSrv, 'recorded');
}

async function queryPiTrendsHistory(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrv: Pick<DataSourceSrv, 'get'>,
  mode: 'plot' | 'preview' | 'recorded',
): Promise<Record<string, PiTrendSeriesResult>> {
  const uniqueBindings = deduplicateBindings(bindings);
  const grouped = groupBindingsByDataSource(uniqueBindings);
  const results: Record<string, PiTrendSeriesResult> = {};

  if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to) {
    return Object.fromEntries(uniqueBindings.map((binding) => [
      getBindingKey(binding),
      { status: 'error', error: new Error('Período histórico inválido') } as PiTrendSeriesResult,
    ]));
  }

  await Promise.all([...grouped.entries()].map(async ([dataSourceUid, group]) => {
    try {
      const instance = await getResolvedPiDataSource(dataSourceSrv, {
        uid: dataSourceUid,
        name: '',
        type: PI_DATASOURCE_TYPE,
      });
      if (typeof instance.query !== 'function') {
        throw new Error('A Data Source PI não expõe consulta histórica');
      }

      const response = await resolveQueryResponse(instance.query(buildHistoricalTrendRequest(group, range, mode)));
      Object.assign(results, normalizeTrendResponse(response, group));
    } catch (error) {
      for (const binding of group) {
        results[getBindingKey(binding)] = { status: 'error', error: toError(error) };
      }
    }
  }));

  return results;
}

async function getResolvedPiDataSource(
  dataSourceSrv: Pick<DataSourceSrv, 'get'>,
  identity: PiDataSourceIdentity,
): Promise<PiDataSourceApi> {
  return (await dataSourceSrv.get({ uid: identity.uid, type: identity.type })) as PiDataSourceApi;
}

function buildCurrentValuesRequest(
  bindings: readonly PiPointBinding[],
  now: number,
): DataQueryRequest<DataQuery> {
  const end = dateTime(now);
  const start = dateTime(now - 60_000);

  return {
    requestId: `pims-values-${bindings[0].dataSourceUid}`,
    interval: '1s',
    intervalMs: 1000,
    maxDataPoints: 1,
    range: { from: start, to: end, raw: { from: start, to: end } },
    scopedVars: {},
    targets: bindings.map((binding, index) => buildCurrentValueTarget(binding, index)),
    timezone: 'browser',
    app: 'app',
    startTime: now - 60_000,
    endTime: now,
  };
}

function buildCurrentValueTarget(binding: PiPointBinding, index: number): DataQuery {
  const pointName = binding.pointName;
  return {
    refId: refIdForIndex(index),
    target: `${binding.serverPath};${pointName}`,
    attributes: [{ label: pointName, value: { value: pointName } }],
    segments: [{ label: binding.serverPath, value: { value: binding.serverPath } }],
    isPiPoint: true,
    useLastValue: { enable: true },
    digitalStates: { enable: true },
    interpolate: { enable: false },
    recordedValues: { enable: false },
    summary: { enable: false, types: [] },
    useUnit: { enable: false },
    expression: '',
    hide: false,
  } as DataQuery;
}

function buildHistoricalTrendRequest(
  bindings: readonly PiPointBinding[],
  timeRange: PiTrendTimeRange,
  mode: 'plot' | 'preview' | 'recorded',
): DataQueryRequest<DataQuery> {
  const end = dateTime(timeRange.to);
  const start = dateTime(timeRange.from);

  return {
    requestId: `pims-trend-${bindings[0].dataSourceUid}`,
    interval: '10s',
    intervalMs: 10_000,
    maxDataPoints: 360,
    range: { from: start, to: end, raw: { from: start, to: end } },
    scopedVars: {},
    targets: bindings.map((binding, index) => ({
      refId: refIdForIndex(index),
      target: `${binding.serverPath};${binding.pointName}`,
      attributes: [{ label: binding.pointName, value: { value: binding.pointName } }],
      segments: [{ label: binding.serverPath, value: { value: binding.serverPath } }],
      isPiPoint: true,
      useLastValue: { enable: false },
      digitalStates: { enable: true },
      interpolate: mode === 'preview'
        ? { enable: true, interval: '5m' }
        : { enable: false },
      // With Recorded Values the datasource maps maxDataPoints to PI Web API
      // maxCount, which truncates dense tags at the beginning of the range.
      recordedValues: mode === 'recorded'
        ? { enable: true, maxNumber: 30_000, boundaryType: 'Inside' }
        : { enable: false, boundaryType: 'Inside' },
      summary: { enable: false, types: [] },
      useUnit: { enable: false },
      expression: '',
      hide: false,
    } as DataQuery)),
    timezone: 'browser',
    app: 'app',
    startTime: timeRange.from,
    endTime: timeRange.to,
  };
}

async function resolveQueryResponse(
  result: Promise<DataQueryResponse> | Observable<DataQueryResponse>,
): Promise<DataQueryResponse> {
  if (isPromiseLike(result)) {
    return result;
  }
  return firstValueFrom(result);
}

function isPromiseLike(value: Promise<DataQueryResponse> | Observable<DataQueryResponse>): value is Promise<DataQueryResponse> {
  return typeof (value as Promise<DataQueryResponse>).then === 'function';
}

function normalizeCurrentValue(frame: DataFrame): PiPointValue {
  if (!frame || frame.fields.length === 0) {
    throw new Error('PI Point sem valor atual');
  }

  const valueField = frame.fields.find((field) => field.name.toLocaleLowerCase() !== 'time')
    ?? frame.fields[1];
  const value = getFirstFieldValue(valueField);
  if (value === null || value === undefined) {
    throw new Error('PI Point sem valor atual');
  }

  const timeField = frame.fields.find((field) => field.name.toLocaleLowerCase() === 'time');
  const timestamp = timeField ? getFirstFieldValue(timeField) : undefined;

  return {
    value,
    timestamp: normalizeTimestamp(timestamp),
  };
}

function normalizeCurrentValues(
  response: DataQueryResponse,
  bindings: readonly PiPointBinding[],
): Record<string, PiPointValueResult> {
  const results: Record<string, PiPointValueResult> = {};
  const frames = response.data as DataFrame[];
  const framesByRefId = new Map(frames.flatMap((frame) => {
    const refId = frame.refId;
    return refId ? [[refId, frame] as const] : [];
  }));

  bindings.forEach((binding, index) => {
    const refId = refIdForIndex(index);
    const frame = framesByRefId.get(refId)
      ?? (bindings.length === 1 && frames.length === 1 ? frames[0] : undefined);
    const key = getBindingKey(binding);

    try {
      if (frame) {
        results[key] = { status: 'success', value: normalizeCurrentValue(frame) };
      } else {
        results[key] = { status: 'error', error: getResponseError(response, refId) };
      }
    } catch (error) {
      results[key] = { status: 'error', error: toError(error) };
    }
  });

  return results;
}

function normalizeTrendResponse(
  response: DataQueryResponse,
  bindings: readonly PiPointBinding[],
): Record<string, PiTrendSeriesResult> {
  const results: Record<string, PiTrendSeriesResult> = {};
  const frames = response.data as DataFrame[];
  const framesByRefId = new Map(frames.flatMap((frame) => {
    const refId = frame.refId;
    return refId ? [[refId, frame] as const] : [];
  }));

  bindings.forEach((binding, index) => {
    const refId = refIdForIndex(index);
    const frame = framesByRefId.get(refId)
      ?? (bindings.length === 1 && frames.length === 1 ? frames[0] : undefined);
    const key = getBindingKey(binding);

    try {
      if (!frame) {
        results[key] = { status: 'error', error: getTrendResponseError(response, refId) };
      } else {
        results[key] = {
          status: 'success',
          series: normalizeTrendFrame(frame, binding.pointName),
        };
      }
    } catch (error) {
      results[key] = { status: 'error', error: toError(error) };
    }
  });

  return results;
}

function normalizeTrendFrame(frame: DataFrame, pointName: string): PiTrendSeries {
  const timeField = frame.fields.find((field) => field.name.toLocaleLowerCase() === 'time');
  const valueFields = frame.fields.filter((field) => field !== timeField);
  if (!timeField || valueFields.length === 0) {
    throw new Error('Série histórica sem campos Time/Value');
  }

  const valueField = valueFields.find((field) => getFieldValues(field)
    .some((value) => typeof value === 'number' && Number.isFinite(value)));
  if (!valueField) {
    if (valueFields.every((field) => getFieldValues(field).length === 0)) {
      return { pointName, points: [] };
    }
    throw new Error('Trend suporta somente PI Points numéricos');
  }

  const times = getFieldValues(timeField);
  const values = getFieldValues(valueField);
  const points: TrendPoint[] = [];
  const length = Math.min(times.length, values.length);
  for (let index = 0; index < length; index += 1) {
    const time = normalizeTrendTimestamp(times[index]);
    const value = values[index];
    if (time === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    points.push({ time, value });
  }

  points.sort((left, right) => left.time - right.time);
  return { pointName, points };
}

function getTrendResponseError(response: DataQueryResponse, refId: string): Error {
  if (response.error?.refId && response.error.refId !== refId) {
    return new Error(`Resposta histórica ausente para o target ${refId}`);
  }
  return new Error(response.error?.message ?? 'PI Point sem histórico numérico');
}

function getFieldValues(field: DataFrame['fields'][number]): unknown[] {
  const values = field.values as unknown as { get?: (index: number) => unknown; toArray?: () => unknown[] } | unknown[];
  if (!values) {
    return [];
  }
  if (Array.isArray(values)) {
    return values;
  }
  if (typeof values.toArray === 'function') {
    return values.toArray();
  }
  if (typeof values.get === 'function') {
    const output: unknown[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      const value = values.get(index);
      if (value === undefined) {
        break;
      }
      output.push(value);
    }
    return output;
  }
  return [];
}

function normalizeTrendTimestamp(value: unknown): number | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  return undefined;
}

function getResponseError(response: DataQueryResponse, refId: string): Error {
  const responseError = response.error;
  if (responseError?.refId && responseError.refId !== refId) {
    return new Error(`Resposta ausente para o target ${refId}`);
  }
  return new Error(responseError?.message ?? 'PI Point sem valor atual ou resposta sem refId');
}

function groupBindingsByDataSource(
  bindings: readonly PiPointBinding[],
): Map<string, PiPointBinding[]> {
  const groups = new Map<string, PiPointBinding[]>();
  for (const binding of bindings) {
    const group = groups.get(binding.dataSourceUid) ?? [];
    group.push(binding);
    groups.set(binding.dataSourceUid, group);
  }
  return groups;
}

function deduplicateBindings(bindings: readonly PiPointBinding[]): PiPointBinding[] {
  const unique = new Map<string, PiPointBinding>();
  for (const binding of bindings) {
    if (!binding.dataSourceUid || !binding.serverPath || !binding.pointName) {
      continue;
    }
    unique.set(getBindingKey(binding), binding);
  }
  return [...unique.values()].sort((left, right) => getBindingKey(left).localeCompare(getBindingKey(right)));
}

function getBindingKey(binding: PiPointBinding): string {
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

function refIdForIndex(index: number): string {
  let value = index + 1;
  let refId = '';
  while (value > 0) {
    value -= 1;
    refId = String.fromCharCode(65 + (value % 26)) + refId;
    value = Math.floor(value / 26);
  }
  return refId;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getFirstFieldValue(field: DataFrame['fields'][number] | undefined): unknown {
  if (!field) {
    return undefined;
  }
  const values = field.values as unknown as { get?: (index: number) => unknown; toArray?: () => unknown[] } | unknown[];
  if (Array.isArray(values)) {
    return values[0];
  }
  if (typeof values.get === 'function') {
    return values.get(0);
  }
  if (typeof values.toArray === 'function') {
    return values.toArray()[0];
  }
  return undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

function getMetricField(value: MetricFindValue | undefined, field: 'text' | 'WebId' | 'Path'): string | undefined {
  if (!value) {
    return undefined;
  }
  const fieldValue = (value as MetricFindValue & Record<string, unknown>)[field];
  return typeof fieldValue === 'string' && fieldValue.length > 0 ? fieldValue : undefined;
}

function toPiDataSourceIdentity(dataSource: DataSourceInstanceSettings): PiDataSourceIdentity {
  return {
    uid: dataSource.uid,
    name: dataSource.name,
    type: dataSource.type,
  };
}

export type PiDataSourceApi = Pick<DataSourceApi, 'testDatasource' | 'metricFindQuery' | 'query'>;
