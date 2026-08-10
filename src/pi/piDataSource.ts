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
import {
  DATA_QUERY_MAX_CONCURRENT_BATCHES,
  DATA_QUERY_MAX_TARGETS,
} from './dataQueryPolicy';

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
  quality?: Record<string, unknown>;
}

export type PiPointValueResult =
  | { status: 'success'; value: PiPointValue }
  | { status: 'error'; error: Error };

export interface TrendPoint {
  time: number;
  value: number;
}

export interface TrendStatePoint {
  time: number;
  value: string;
}

export interface PiTrendSeries {
  pointName: string;
  points: TrendPoint[];
  states?: TrendStatePoint[];
}

export interface PiTrendTimeRange {
  from: number;
  to: number;
}

export interface PiTrendQueryOptions {
  maxDataPoints?: number;
}

export const TREND_QUERY_MIN_DATA_POINTS = 100;
export const TREND_QUERY_MAX_DATA_POINTS = 2000;
const TREND_QUERY_DEFAULT_MAX_DATA_POINTS = 360;
let dataQueryRequestSequence = 0;

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

  const tasks = [...grouped.entries()].flatMap(([dataSourceUid, group]) => (
    chunkBindings(group).map((batch) => async () => {
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
        const response = await resolveQueryResponse(instance.query(buildCurrentValuesRequest(batch, now)));
        Object.assign(results, normalizeCurrentValues(response, batch));
      } catch (error) {
        for (const binding of batch) {
          results[getBindingKey(binding)] = { status: 'error', error: toError(error) };
        }
      }
    })
  ));
  await runQueryTasks(tasks);

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
  dataSourceSrvOrOptions: Pick<DataSourceSrv, 'get'> | PiTrendQueryOptions = getDataSourceSrv(),
  explicitOptions: PiTrendQueryOptions = {},
): Promise<Record<string, PiTrendSeriesResult>> {
  const { dataSourceSrv, options } = resolveTrendQueryArguments(dataSourceSrvOrOptions, explicitOptions);
  return queryPiTrendsHistory(bindings, range, dataSourceSrv, 'plot', options);
}

export async function getPiTrendsPreviewForRange(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrvOrOptions: Pick<DataSourceSrv, 'get'> | PiTrendQueryOptions = getDataSourceSrv(),
  explicitOptions: PiTrendQueryOptions = {},
): Promise<Record<string, PiTrendSeriesResult>> {
  const { dataSourceSrv, options } = resolveTrendQueryArguments(dataSourceSrvOrOptions, explicitOptions);
  return queryPiTrendsHistory(bindings, range, dataSourceSrv, 'preview', options);
}

export async function getPiTrendsRecordedHistoryForRange(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrvOrOptions: Pick<DataSourceSrv, 'get'> | PiTrendQueryOptions = getDataSourceSrv(),
  explicitOptions: PiTrendQueryOptions = {},
): Promise<Record<string, PiTrendSeriesResult>> {
  const { dataSourceSrv, options } = resolveTrendQueryArguments(dataSourceSrvOrOptions, explicitOptions);
  return queryPiTrendsHistory(bindings, range, dataSourceSrv, 'recorded', options);
}

async function queryPiTrendsHistory(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrv: Pick<DataSourceSrv, 'get'>,
  mode: 'plot' | 'preview' | 'recorded',
  options: PiTrendQueryOptions = {},
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

  const tasks = [...grouped.entries()].flatMap(([dataSourceUid, group]) => (
    chunkBindings(group).map((batch) => async () => {
      try {
        const instance = await getResolvedPiDataSource(dataSourceSrv, {
          uid: dataSourceUid,
          name: '',
          type: PI_DATASOURCE_TYPE,
        });
        if (typeof instance.query !== 'function') {
          throw new Error('A Data Source PI não expõe consulta histórica');
        }

        const response = await resolveQueryResponse(instance.query(buildHistoricalTrendRequest(batch, range, mode, options)));
        Object.assign(results, normalizeTrendResponse(response, batch));
      } catch (error) {
        for (const binding of batch) {
          results[getBindingKey(binding)] = { status: 'error', error: toError(error) };
        }
      }
    })
  ));
  await runQueryTasks(tasks);

  return results;
}

async function getResolvedPiDataSource(
  dataSourceSrv: Pick<DataSourceSrv, 'get'>,
  identity: PiDataSourceIdentity,
): Promise<PiDataSourceApi> {
  const instance = (await dataSourceSrv.get({ uid: identity.uid, type: identity.type })) as PiDataSourceApi;
  if (instance.uid !== identity.uid || instance.type !== PI_DATASOURCE_TYPE) {
    throw new Error('A Data Source selecionada não é compatível com OSIsoft-PI');
  }
  return instance;
}

function buildCurrentValuesRequest(
  bindings: readonly PiPointBinding[],
  now: number,
): DataQueryRequest<DataQuery> {
  const end = dateTime(now);
  const start = dateTime(now - 60_000);

  return {
    requestId: nextDataQueryRequestId('values', bindings[0].dataSourceUid),
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
  options: PiTrendQueryOptions,
): DataQueryRequest<DataQuery> {
  const end = dateTime(timeRange.to);
  const start = dateTime(timeRange.from);

  const maxDataPoints = clampTrendMaxDataPoints(options.maxDataPoints);
  const intervalMs = Math.max(1000, Math.ceil((timeRange.to - timeRange.from) / Math.max(1, maxDataPoints - 1)));
  const interval = formatQueryInterval(intervalMs);
  return {
    requestId: nextDataQueryRequestId('trend', bindings[0].dataSourceUid),
    interval,
    intervalMs,
    maxDataPoints,
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
        ? { enable: true, interval }
        : { enable: false },
      recordedValues: mode === 'recorded'
        ? { enable: true, maxNumber: maxDataPoints, boundaryType: 'Inside' }
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

function normalizeCurrentValue(frame: DataFrame, pointName: string): PiPointValue {
  if (!frame || frame.fields.length === 0) {
    throw new Error('PI Point sem valor atual');
  }

  const valueField = frame.fields.find((field) => field.name.toLocaleLowerCase() === pointName.toLocaleLowerCase())
    ?? frame.fields.find((field) => !isCurrentValueMetadataField(field.name));
  const value = getFirstFieldValue(valueField);
  if (value === null || value === undefined) {
    throw new Error('PI Point sem valor atual');
  }

  const timeField = frame.fields.find((field) => field.name.toLocaleLowerCase() === 'time');
  const timestamp = timeField ? getFirstFieldValue(timeField) : undefined;

  const quality = normalizeQuality(frame);
  return {
    value,
    timestamp: normalizeTimestamp(timestamp),
    ...(quality ? { quality } : {}),
  };
}

function normalizeCurrentValues(
  response: DataQueryResponse,
  bindings: readonly PiPointBinding[],
): Record<string, PiPointValueResult> {
  const results: Record<string, PiPointValueResult> = {};
  const frames = Array.isArray(response.data) ? response.data as DataFrame[] : [];
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
        results[key] = { status: 'success', value: normalizeCurrentValue(frame, binding.pointName) };
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
  const frames = Array.isArray(response.data) ? response.data as DataFrame[] : [];
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

  const preferredField = valueFields.find((field) => field.name.toLocaleLowerCase() === pointName.toLocaleLowerCase());
  const valueField = preferredField ?? valueFields[0];
  const values = getFieldValues(valueField);
  const hasNumericValue = values.some((value) => typeof value === 'number' && Number.isFinite(value));
  if (!hasNumericValue) {
    if (valueFields.every((field) => getFieldValues(field).length === 0)) {
      return { pointName, points: [] };
    }
    return normalizeStateTrendFrame(pointName, getFieldValues(timeField), values);
  }

  const times = getFieldValues(timeField);
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

function normalizeStateTrendFrame(
  pointName: string,
  times: unknown[],
  values: unknown[],
): PiTrendSeries {
  const states: TrendStatePoint[] = [];
  const length = Math.min(times.length, values.length);
  for (let index = 0; index < length; index += 1) {
    const time = normalizeTrendTimestamp(times[index]);
    const value = values[index];
    if (time === undefined || value === null || value === undefined) {
      continue;
    }
    states.push({ time, value: String(value) });
  }
  states.sort((left, right) => left.time - right.time);
  return { pointName, points: [], states };
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

function resolveTrendQueryArguments(
  value: Pick<DataSourceSrv, 'get'> | PiTrendQueryOptions,
  explicitOptions: PiTrendQueryOptions,
): { dataSourceSrv: Pick<DataSourceSrv, 'get'>; options: PiTrendQueryOptions } {
  if ('get' in value && typeof value.get === 'function') {
    return { dataSourceSrv: value, options: explicitOptions };
  }
  return { dataSourceSrv: getDataSourceSrv(), options: value as PiTrendQueryOptions };
}

function clampTrendMaxDataPoints(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return TREND_QUERY_DEFAULT_MAX_DATA_POINTS;
  }
  return Math.min(
    TREND_QUERY_MAX_DATA_POINTS,
    Math.max(TREND_QUERY_MIN_DATA_POINTS, Math.round(value as number)),
  );
}

function chunkBindings(bindings: readonly PiPointBinding[]): PiPointBinding[][] {
  const chunks: PiPointBinding[][] = [];
  for (let index = 0; index < bindings.length; index += DATA_QUERY_MAX_TARGETS) {
    chunks.push(bindings.slice(index, index + DATA_QUERY_MAX_TARGETS));
  }
  return chunks;
}

async function runQueryTasks(tasks: ReadonlyArray<() => Promise<void>>): Promise<void> {
  let nextTask = 0;
  const workers = Array.from(
    { length: Math.min(DATA_QUERY_MAX_CONCURRENT_BATCHES, tasks.length) },
    async () => {
      while (nextTask < tasks.length) {
        const task = tasks[nextTask];
        nextTask += 1;
        await task();
      }
    },
  );
  await Promise.all(workers);
}

function formatQueryInterval(intervalMs: number): string {
  const seconds = Math.max(1, Math.ceil(intervalMs / 1000));
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
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

function nextDataQueryRequestId(mode: 'values' | 'trend', dataSourceUid: string): string {
  dataQueryRequestSequence += 1;
  return `pims-${mode}-${dataSourceUid}-${dataQueryRequestSequence}`;
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

const CURRENT_VALUE_QUALITY_FIELDS = new Set(['quality', 'good', 'questionable', 'substituted']);

function isCurrentValueMetadataField(fieldName: string): boolean {
  const normalized = fieldName.toLocaleLowerCase();
  return normalized === 'time' || CURRENT_VALUE_QUALITY_FIELDS.has(normalized);
}

function normalizeQuality(frame: DataFrame): Record<string, unknown> | undefined {
  const entries = frame.fields.flatMap((field) => {
    const normalized = field.name.toLocaleLowerCase();
    if (!CURRENT_VALUE_QUALITY_FIELDS.has(normalized)) {
      return [];
    }
    const value = getFirstFieldValue(field);
    return value === undefined ? [] : [[field.name, value] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
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

export type PiDataSourceApi = Pick<DataSourceApi, 'uid' | 'type' | 'testDatasource' | 'metricFindQuery' | 'query'>;
