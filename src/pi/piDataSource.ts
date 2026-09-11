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
import type { PiPointBinding, PiPointDatabaseLimits } from './piPointBinding';
import {
  DATA_QUERY_CURRENT_MAX_CONCURRENT_BATCHES,
  DATA_QUERY_CURRENT_MAX_TARGETS,
  DATA_QUERY_CURRENT_TIMEOUT_MS,
  DATA_QUERY_HISTORICAL_TIMEOUT_MS,
  DATA_QUERY_MAX_CONCURRENT_BATCHES,
  DATA_QUERY_MAX_TARGETS,
} from './dataQueryPolicy';

export const PI_DATASOURCE_TYPE = 'gridprotectionalliance-osisoftpi-datasource';
const CURRENT_VALUE_LOOKBACK_MS = 60 * 1000;
const runHistoricalQuery = createAsyncLimiter(DATA_QUERY_MAX_CONCURRENT_BATCHES);

export type PiConnectionStatus = 'checking' | 'connected' | 'error' | 'not-configured';

export interface PiDataSourceIdentity {
  uid: string;
  name: string;
  type: string;
}

export interface PiCalculationDataServerContext {
  dataSourceUid: string;
  serverPath: string;
  webId: string;
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
  pointType?: string;
  description?: string;
  engineeringUnit?: string;
  pointSource?: string;
}

export interface PiPointSearchRequest {
  term?: string;
  description?: string;
  pointTypes?: string[];
  engineeringUnits?: string[];
  pointSources?: string[];
  limit?: number;
  /** Explicit read-only pagination offset for PI Web API point searches. */
  startIndex?: number;
}

export interface PiPointSearchResponse {
  results: PiPointSearchResult[];
  hasMore: boolean;
}

export const PI_POINT_SEARCH_MAX_RESULTS = 1000;
const PI_POINT_SEARCH_DEFAULT_LIMIT = PI_POINT_SEARCH_MAX_RESULTS;
const PI_POINT_METADATA_CONCURRENCY = 8;
const PI_METADATA_CACHE_MAX_ENTRIES = 512;

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries = PI_METADATA_CACHE_MAX_ENTRIES): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    cache.delete(oldestKey);
  }
}

const piPointMetadataCache = new Map<string, PiPointSearchResult>();
const piPointDetailsMetadataCache = new Map<string, Promise<PiPointMetadata>>();

export interface PiPointValue {
  value: unknown;
  timestamp?: string;
  unit?: string;
  quality?: Record<string, unknown>;
}

/** Basic PI Point attributes used by the Trend information panel. */
export interface PiPointMetadata {
  name: string;
  description?: string;
  extendedDescriptor?: string;
  pointSource?: string;
  instrumentTag?: string;
  pointType?: string;
  zero?: number;
  span?: number;
  compDev?: number;
  excDev?: number;
  engineeringUnit?: string;
  typicalValue?: number | string;
  stepped?: boolean;
  pointId?: number | string;
}

/** Raw PI Point attributes needed to discover configured Performance Equations. */
export interface PiPerformanceEquationPointAttributes {
  name: string;
  webId: string;
  pointSource?: unknown;
  exDesc?: unknown;
  location1?: unknown;
  location3?: unknown;
  location4?: unknown;
  scan?: unknown;
  shutdown?: unknown;
  pointClass?: unknown;
  pointType?: unknown;
}

/** A compact representation of a state configured in a PI Digital State Set. */
export interface PiDigitalState {
  name: string;
  value?: number | string;
  /** Present only when a state was resolved from a server-wide set lookup. */
  setWebId?: string;
  setName?: string;
  isSystem?: boolean;
}

export interface PiDigitalStatesResult {
  isDigital: boolean;
  states: PiDigitalState[];
}

const piDigitalStatesCache = new Map<string, Promise<PiDigitalStatesResult>>();

export interface PiDigitalStateSet {
  name: string;
  webId?: string;
  isSystem: boolean;
  states: PiDigitalState[];
}

export interface PiAlarmStateInfo {
  conditionCode: number;
  conditionText: string;
  acknowledgementStatus: 0 | 1 | 2;
  priority: number;
}

const piDigitalStateSetsCache = new Map<string, Promise<PiDigitalStateSet[]>>();

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
  historicalValues?: PiHistoricalValue[];
}

export interface PiTrendTimeRange {
  from: number;
  to: number;
}

export interface PiTrendQueryOptions {
  maxDataPoints?: number;
}

export type PiCapabilityStatus = 'confirmed' | 'unsupported' | 'permission-denied' | 'invalid' | 'error' | 'not-tested';

export interface PiCapabilityResourceReport {
  status: PiCapabilityStatus;
  message?: string;
  fields: string[];
}

export interface PiCapabilityRecordedReport extends PiCapabilityResourceReport {
  itemCount: number;
  qualityFlagsDetected: string[];
  firstTimestamp?: string;
  lastTimestamp?: string;
}

export interface PiCapabilityBoundaryReport {
  mode: string;
  status: PiCapabilityStatus;
  itemCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  message?: string;
}

export interface PiCapabilityReport {
  pointResource: PiCapabilityResourceReport & { webId?: string; pointId?: number | string };
  stepped: { available: boolean; field?: string; value?: unknown };
  pointId: { available: boolean; value?: number | string };
  recordedRaw: PiCapabilityRecordedReport;
  historicalQuality: { available: boolean; flags: string[] };
  boundaryModes: PiCapabilityBoundaryReport[];
  timezone: { available: false; status: 'not-tested'; message: string };
  digitalStateSet: { available: boolean; status: PiCapabilityStatus; message?: string };
}

export interface PiCapabilityProbeOptions {
  from?: number;
  to?: number;
  boundaryModes?: readonly string[];
}

export interface PiRecordedRawQuality {
  good?: boolean;
  questionable?: boolean;
  substituted?: boolean;
  annotated?: boolean;
}

export type PiHistoricalOrigin = 'recorded' | 'boundary' | 'interpolated';

/** Common historical value representation. Optional fields are intentionally not defaulted. */
export interface PiHistoricalValue {
  timestamp: number;
  value: number | string;
  quality?: PiRecordedRawQuality;
  origin?: PiHistoricalOrigin;
}

export interface PiRecordedRawPoint {
  time: number;
  value: unknown;
  quality?: PiRecordedRawQuality;
  recorded?: boolean;
  origin?: PiHistoricalOrigin;
}

export interface PiRecordedRawHistoryOptions {
  boundaryType?: string;
  selectedFields?: readonly string[];
}

const piRecordedCapabilityCache = new Map<string, 'supported' | 'unsupported'>();
const piRecordedPromiseLock = new Map<string, Promise<readonly PiRecordedRawPoint[]>>();
const piRecordedResultCache = new Map<string, readonly PiRecordedRawPoint[]>();

function rawField(value: Record<string, unknown>, ...names: string[]): unknown {
  const actual = Object.keys(value).find((key) => names.some((name) => key.toLocaleLowerCase() === name.toLocaleLowerCase()));
  return actual ? value[actual] : undefined;
}

function normalizeRawRecordedPoint(value: unknown): PiRecordedRawPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta recorded inválida: item não é objeto.');
  const item = value as Record<string, unknown>;
  const rawTime = rawField(item, 'Timestamp', 'Time');
  const time = typeof rawTime === 'number' ? rawTime : typeof rawTime === 'string' ? Date.parse(rawTime) : NaN;
  if (!Number.isFinite(time)) throw new Error('Resposta recorded inválida: timestamp ausente.');
  const qualityEntries = (['Good', 'Questionable', 'Substituted', 'Annotated'] as const).flatMap((name) => {
    const candidate = rawField(item, name);
    return typeof candidate === 'boolean' ? [[name.toLocaleLowerCase(), candidate] as const] : [];
  });
  const quality = qualityEntries.length > 0 ? Object.fromEntries(qualityEntries) as PiRecordedRawQuality : undefined;
  const recorded = rawField(item, 'Recorded');
  const rawOrigin = rawField(item, 'Origin', 'ValueOrigin');
  const origin = rawOrigin === 'recorded' || rawOrigin === 'boundary' || rawOrigin === 'interpolated'
    ? rawOrigin
    : recorded === true ? 'recorded' : undefined;
  return {
    time,
    value: rawField(item, 'Value'),
    ...(quality ? { quality } : {}),
    ...(typeof recorded === 'boolean' ? { recorded } : {}),
    ...(origin ? { origin } : {}),
  };
}

function normalizeRawRecordedHistory(value: unknown): readonly PiRecordedRawPoint[] {
  const items = Array.isArray(value) ? value : getResourceItems(value);
  if (!Array.isArray(value) && (!value || typeof value !== 'object' || !('Items' in (value as Record<string, unknown>)))) {
    throw new Error('Resposta recorded inválida: coleção ausente.');
  }
  return items.map(normalizeRawRecordedPoint);
}

export function hasPendingPiRecordedRawRequests(): boolean {
  return piRecordedPromiseLock.size > 0;
}

export async function waitForPendingPiRecordedRawRequests(): Promise<void> {
  await Promise.allSettled([...piRecordedPromiseLock.values()]);
}

/** Reads raw recorded values only when explicitly requested by a capability-aware path. */
export async function getPiRecordedRawHistory(
  binding: PiPointBinding,
  range: PiTrendTimeRange,
  options: PiRecordedRawHistoryOptions = {},
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<readonly PiRecordedRawPoint[]> {
  if (!binding.webId) throw new Error('Histórico raw requer WebId do PI Point.');
  const capabilityKey = `${binding.dataSourceUid}:recorded`;
  if (piRecordedCapabilityCache.get(capabilityKey) === 'unsupported') {
    throw new Error('O recurso recorded não é suportado pela datasource GPA.');
  }
  const fields = options.selectedFields?.join(';') ?? '';
  const key = `${binding.dataSourceUid}\u0000${binding.webId}\u0000${range.from}\u0000${range.to}\u0000${options.boundaryType ?? ''}\u0000${fields}`;
  const cached = piRecordedResultCache.get(key);
  if (cached) return cached;
  const existing = piRecordedPromiseLock.get(key);
  if (existing) return existing;
  const params = new URLSearchParams({
    startTime: new Date(range.from).toISOString(),
    endTime: new Date(range.to).toISOString(),
    maxCount: '100',
  });
  if (options.boundaryType) params.set('boundaryType', options.boundaryType);
  if (fields) params.set('selectedFields', fields);
  const request = getPiResource<unknown>(binding.dataSourceUid, `/streams/${encodeURIComponent(binding.webId)}/recorded?${params.toString()}`, dataSourceSrv)
    .then((response) => {
      const result = normalizeRawRecordedHistory(response);
      piRecordedCapabilityCache.set(capabilityKey, 'supported');
      piRecordedResultCache.set(key, result);
      return result;
    })
    .catch((error) => {
      const status = getPiQueryStatus(error);
      if (status === 404 || status === 405 || status === 501) piRecordedCapabilityCache.set(capabilityKey, 'unsupported');
      throw error;
    })
    .finally(() => piRecordedPromiseLock.delete(key));
  piRecordedPromiseLock.set(key, request);
  return request;
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

function capabilityMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, '[URL]').replace(/(authorization|cookie|token|password)\s*[:=]\s*\S+/gi, '$1=[redacted]');
}

function capabilityStatus(error: unknown): PiCapabilityStatus {
  const status = getPiQueryStatus(error);
  if (status === 401 || status === 403) return 'permission-denied';
  if (status === 404 || status === 405 || status === 501) return 'unsupported';
  return 'error';
}

function capabilityObjectFields(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>);
}

function capabilityField(value: unknown, ...names: string[]): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).find((key) => names.some((name) => key.toLocaleLowerCase() === name.toLocaleLowerCase()));
  return actual ? record[actual] : undefined;
}

function capabilityItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return getResourceItems(value);
}

function inspectRecordedCapability(value: unknown): PiCapabilityRecordedReport {
  const items = capabilityItems(value);
  if (!Array.isArray(value) && (!value || typeof value !== 'object' || !('Items' in (value as Record<string, unknown>)))) {
    return { status: 'invalid', message: 'Resposta recorded inválida.', fields: [], itemCount: 0, qualityFlagsDetected: [] };
  }
  const fields = [...new Set(items.flatMap(capabilityObjectFields))];
  const qualityFlagsDetected = fields.filter((field) => ['good', 'questionable', 'substituted', 'annotated'].includes(field.toLocaleLowerCase()));
  const timestamps = items.map((item) => capabilityField(item, 'Timestamp', 'Time')).map(normalizeTimestamp).filter((item): item is string => Boolean(item));
  return {
    status: 'confirmed',
    fields,
    itemCount: items.length,
    qualityFlagsDetected,
    ...(timestamps[0] ? { firstTimestamp: timestamps[0] } : {}),
    ...(timestamps.at(-1) ? { lastTimestamp: timestamps.at(-1) } : {}),
  };
}

/**
 * Performs an explicit, side-effect-free capability check through the
 * configured GPA datasource. It is diagnostic only and is never called by a
 * normal calculation.
 */
export async function probePiCapabilities(
  binding: PiPointBinding,
  options: PiCapabilityProbeOptions = {},
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiCapabilityReport> {
  const webId = binding.webId;
  const emptyRecorded: PiCapabilityRecordedReport = { status: 'not-tested', fields: [], itemCount: 0, qualityFlagsDetected: [] };
  const base: PiCapabilityReport = {
    pointResource: { status: 'not-tested', fields: [], ...(webId ? { webId } : {}) },
    stepped: { available: false },
    pointId: { available: false },
    recordedRaw: emptyRecorded,
    historicalQuality: { available: false, flags: [] },
    boundaryModes: [],
    timezone: { available: false, status: 'not-tested', message: 'Não testado pelo capability probe.' },
    digitalStateSet: { available: false, status: 'not-tested' },
  };
  if (!webId) {
    base.pointResource = { status: 'invalid', message: 'O binding não possui WebId.', fields: [] };
    return base;
  }

  let point: unknown;
  try {
    point = await getPiResource(binding.dataSourceUid, `/points/${encodeURIComponent(webId)}`, dataSourceSrv);
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      base.pointResource = { status: 'invalid', message: 'Resposta do recurso point inválida.', fields: [], webId };
      return base;
    }
    const fields = capabilityObjectFields(point);
    const pointId = capabilityField(point, 'PointID', 'Id');
    const stepField = Object.keys(point as Record<string, unknown>).find((field) => ['step', 'stepped', 'stepflag', 'interpolation'].includes(field.toLocaleLowerCase()));
    const stepValue = stepField ? (point as Record<string, unknown>)[stepField] : undefined;
    base.pointResource = { status: 'confirmed', fields, webId, ...(pointId !== undefined && (typeof pointId === 'string' || typeof pointId === 'number') ? { pointId } : {}) };
    base.pointId = pointId !== undefined && (typeof pointId === 'string' || typeof pointId === 'number') ? { available: true, value: pointId } : { available: false };
    base.stepped = stepField ? { available: true, field: stepField, value: stepValue } : { available: false };
  } catch (error) {
    base.pointResource = { status: capabilityStatus(error), message: capabilityMessage(error), fields: [], webId };
    return base;
  }

  const from = options.from ?? Date.now() - 10 * 60 * 1000;
  const to = options.to ?? Date.now();
  const modes = options.boundaryModes ?? ['Inside'];
  for (const mode of modes) {
    const path = `/streams/${encodeURIComponent(webId)}/recorded?startTime=${encodeURIComponent(new Date(from).toISOString())}&endTime=${encodeURIComponent(new Date(to).toISOString())}&maxCount=100&boundaryType=${encodeURIComponent(mode)}`;
    try {
      const recorded = inspectRecordedCapability(await getPiResource(binding.dataSourceUid, path, dataSourceSrv));
      base.boundaryModes.push({ mode, status: recorded.status, itemCount: recorded.itemCount, ...(recorded.firstTimestamp ? { firstTimestamp: recorded.firstTimestamp } : {}), ...(recorded.lastTimestamp ? { lastTimestamp: recorded.lastTimestamp } : {}), ...(recorded.message ? { message: recorded.message } : {}) });
      if (mode === modes[0]) {
        base.recordedRaw = recorded;
        base.historicalQuality = { available: recorded.qualityFlagsDetected.length > 0, flags: recorded.qualityFlagsDetected };
      }
    } catch (error) {
      const status = capabilityStatus(error);
      base.boundaryModes.push({ mode, status, itemCount: 0, message: capabilityMessage(error) });
      if (mode === modes[0]) base.recordedRaw = { status, message: capabilityMessage(error), fields: [], itemCount: 0, qualityFlagsDetected: [] };
    }
  }

  try {
    const digital = await getPiPointDigitalStates(binding, dataSourceSrv);
    base.digitalStateSet = { available: digital.isDigital && digital.states.length > 0, status: digital.isDigital && digital.states.length > 0 ? 'confirmed' : 'invalid', ...(digital.states.length === 0 ? { message: 'Nenhum estado foi retornado.' } : {}) };
  } catch (error) {
    base.digitalStateSet = { available: false, status: capabilityStatus(error), message: capabilityMessage(error) };
  }
  return base;
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
  termOrRequest: string | PiPointSearchRequest,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiPointSearchResult[]> {
  return (await searchPiPointsWithStatus(termOrRequest, dataSourceSrv)).results;
}

export async function searchPiPointsWithStatus(
  termOrRequest: string | PiPointSearchRequest,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiPointSearchResponse> {
  const request = normalizePiPointSearchRequest(termOrRequest);
  if (!request.term && !hasMetadataFilters(request)) {
    return { results: [], hasMore: false };
  }

  const dataSource = resolvePiDataSource(dataSourceSrv);
  if (!dataSource) {
    throw new Error('PI Data Source não configurada');
  }

  const instance = await getResolvedPiDataSource(dataSourceSrv, dataSource);
  const resourceApi = instance as PiDataSourceResourceApi;
  let serverWebId: string | undefined;
  if (typeof instance.metricFindQuery === 'function') {
    try {
      const servers = await instance.metricFindQuery({ type: 'dataserver' }, { isPiPoint: true });
      serverWebId = getMetricField(servers[0], 'WebId') ?? getMetricField(servers[0], 'value');
    } catch {
      // A mensagem de fallback abaixo será usada se não houver outra estratégia.
    }
  }

  if (serverWebId && typeof resourceApi.getResource === 'function') {
    try {
      const advancedResults = await searchPiPointsAdvanced(resourceApi, request, dataSource.uid, serverWebId);
      const filteredAdvancedResults = filterPiPointSearchResults(advancedResults.results, request);
      // Alguns adaptadores aceitam o endpoint, mas ignoram parte dos filtros
      // e respondem vazio. Se há um nome, ainda podemos usar o fallback seguro
      // por nome para não esconder uma PI Point existente.
      if (filteredAdvancedResults.length > 0 || !request.term) {
        return { results: filteredAdvancedResults.slice(0, request.limit), hasMore: advancedResults.hasMore };
      }
    } catch {
      // Instalações antigas do PI Web API não expõem pesquisa avançada.
    }
  }

  if (!request.term && !hasMetadataFilters(request)) {
    throw new Error('Informe o nome ou máscara da tag para pesquisar.');
  }

  const fallbackRequest = request.term ? request : { ...request, term: '*' };

  // O datasource GridProtectionAlliance fixa maxCount=100 em piPointSearch().
  // Para buscas por nome, use diretamente o endpoint legado do mesmo PI Web
  // API, preservando o datasource/proxy configurado e permitindo paginação.
  if (serverWebId && typeof resourceApi.getResource === 'function') {
    try {
      const legacyResults = await searchPiPointsByDataServer(resourceApi, fallbackRequest, dataSource.uid, serverWebId);
      return {
        results: filterPiPointSearchResults(legacyResults.results, request),
        hasMore: legacyResults.hasMore,
      };
    } catch {
      // Somente instalações sem esse recurso precisam usar metricFindQuery.
    }
  }

  if (typeof instance.metricFindQuery !== 'function') throw new Error('A Data Source PI não expõe pesquisa de PI Points');
  if (!serverWebId) return { results: [], hasMore: false };
  const pointNameCandidates = request.term.includes('*') || request.term.includes('?')
    ? [request.term]
    : [`${request.term}*`, `*${request.term}*`, request.term];
  let points: MetricFindValue[] = [];
  for (const pointName of pointNameCandidates) {
    try {
      points = await instance.metricFindQuery(
        { path: '', webId: serverWebId, pointName, type: 'pipoint' },
        { isPiPoint: true },
      );
    } catch {
      points = [];
    }
    if (points.length > 0) break;
  }
  const hasMore = points.length > request.limit;
  const candidates = points.slice(0, request.limit).flatMap((point) => {
    const result = normalizePiPointMetadata(point, dataSource.uid);
    return result ? [result] : [];
  });
  const enriched = await enrichPiPointMetadata(candidates, resourceApi, dataSource.uid);
  return { results: filterPiPointSearchResults(enriched, request), hasMore };
}

async function searchPiPointsByDataServer(
  resourceApi: PiDataSourceResourceApi,
  request: ReturnType<typeof normalizePiPointSearchRequest>,
  dataSourceUid: string,
  serverWebId: string,
): Promise<PiPointSearchResponse> {
  const pointName = request.term.includes('*') || request.term.includes('?') ? request.term : `${request.term}*`;
  const baseParams = new URLSearchParams({
    nameFilter: pointName,
    selectedFields: 'Items.WebId;Items.Name;Items.Path;Items.Descriptor;Items.PointType;Items.EngineeringUnits;Items.PointSource',
  });
  const basePath = `/dataservers/${encodeURIComponent(serverWebId)}/points`;
  const results: PiPointSearchResult[] = [];
  const identities = new Set<string>();
  let startIndex = request.startIndex;

  while (results.length < request.limit) {
    const params = new URLSearchParams(baseParams);
    params.set('startIndex', String(startIndex));
    params.set('maxCount', String(request.limit - results.length));
    const response = await resourceApi.getResource(`${basePath}?${params.toString()}`);
    assertPiPointSearchResponse(response);
    const rawItems = getResourceItems(response);
    if (rawItems.length === 0) break;

    let added = 0;
    for (const item of rawItems) {
      const result = normalizePiPointMetadata(item, dataSourceUid);
      if (!result) continue;
      const identity = result.webId ?? `${result.path ?? ''}:${result.name}`;
      if (identities.has(identity)) continue;
      identities.add(identity);
      results.push(result);
      added += 1;
      if (results.length === request.limit) break;
    }
    startIndex += rawItems.length;
    if (added === 0) break;
  }

  let hasMore = false;
  if (results.length === request.limit) {
    const probeParams = new URLSearchParams(baseParams);
    probeParams.set('startIndex', String(startIndex));
    probeParams.set('maxCount', '1');
    const probeResponse = await resourceApi.getResource(`${basePath}?${probeParams.toString()}`);
    assertPiPointSearchResponse(probeResponse);
    hasMore = getResourceItems(probeResponse).some((item) => {
      const result = normalizePiPointMetadata(item, dataSourceUid);
      const identity = result?.webId ?? (result ? `${result.path ?? ''}:${result.name}` : undefined);
      return Boolean(identity && !identities.has(identity));
    });
  }
  return { results, hasMore };
}

function normalizePiPointSearchRequest(value: string | PiPointSearchRequest): Required<Pick<PiPointSearchRequest, 'term' | 'description' | 'pointTypes' | 'engineeringUnits' | 'pointSources' | 'limit' | 'startIndex'>> {
  const request = typeof value === 'string' ? { term: value } : value;
  return {
    term: request.term?.trim() ?? '',
    description: request.description?.trim() ?? '',
    pointTypes: normalizeSearchValues(request.pointTypes),
    engineeringUnits: normalizeSearchValues(request.engineeringUnits),
    pointSources: normalizeSearchValues(request.pointSources),
    limit: Math.min(PI_POINT_SEARCH_MAX_RESULTS, Math.max(1, request.limit ?? PI_POINT_SEARCH_DEFAULT_LIMIT)),
    startIndex: Math.max(0, Math.floor(request.startIndex ?? 0)),
  };
}

function normalizeSearchValues(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function hasMetadataFilters(request: Pick<PiPointSearchRequest, 'description' | 'pointTypes' | 'engineeringUnits' | 'pointSources'>): boolean {
  return Boolean(request.description?.trim() || request.pointTypes?.length || request.engineeringUnits?.length || request.pointSources?.length);
}

async function searchPiPointsAdvanced(
  resourceApi: PiDataSourceResourceApi,
  request: ReturnType<typeof normalizePiPointSearchRequest>,
  dataSourceUid: string,
  serverWebId: string,
): Promise<PiPointSearchResponse> {
  const baseParams = new URLSearchParams({
    dataServerWebId: serverWebId,
    selectedFields: 'WebId;Name;Path;Descriptor;PointType;EngineeringUnits;PointSource',
  });
  baseParams.set('query', buildPiPointSearchQuery(request));

  const results: PiPointSearchResult[] = [];
  const identities = new Set<string>();
  let startIndex = request.startIndex;
  let knownTotal: number | undefined;

  while (results.length < request.limit) {
    const params = new URLSearchParams(baseParams);
    params.set('startIndex', String(startIndex));
    params.set('maxCount', String(request.limit - results.length));
    const response = await resourceApi.getResource(`/points/search?${params.toString()}`);
    assertPiPointSearchResponse(response);
    const rawItems = getResourceItems(response);
    if (rawItems.length === 0) break;

    knownTotal = getResourceTotal(response) ?? knownTotal;
    let added = 0;
    for (const item of rawItems) {
      const result = normalizePiPointMetadata(item, dataSourceUid);
      if (!result) continue;
      const identity = result.webId ?? `${result.path ?? ''}:${result.name}`;
      if (identities.has(identity)) continue;
      identities.add(identity);
      results.push(result);
      added += 1;
      if (results.length === request.limit) break;
    }
    startIndex += rawItems.length;
    // Protege contra adaptadores antigos que ignoram startIndex e repetem a página.
    if (added === 0) break;
  }

  let hasMore = knownTotal !== undefined && knownTotal > request.startIndex + results.length;
  if (!hasMore && results.length === request.limit) {
    const probeParams = new URLSearchParams(baseParams);
    probeParams.set('startIndex', String(startIndex));
    probeParams.set('maxCount', '1');
    const probeResponse = await resourceApi.getResource(`/points/search?${probeParams.toString()}`);
    assertPiPointSearchResponse(probeResponse);
    hasMore = getResourceItems(probeResponse).some((item) => {
      const result = normalizePiPointMetadata(item, dataSourceUid);
      const identity = result?.webId ?? (result ? `${result.path ?? ''}:${result.name}` : undefined);
      return Boolean(identity && !identities.has(identity));
    });
  }
  return { results, hasMore };
}

function assertPiPointSearchResponse(response: unknown): void {
  if (!Array.isArray(response) && (!response || typeof response !== 'object' || !Array.isArray((response as Record<string, unknown>).Items))) {
    throw new Error('Pesquisa avançada de PI Points indisponível');
  }
}

function buildPiPointSearchQuery(request: ReturnType<typeof normalizePiPointSearchRequest>): string {
  const criteria: string[] = [];
  if (request.term) {
    const term = request.term.includes('*') || request.term.includes('?') ? request.term : `${request.term}*`;
    criteria.push(`Tag:="${escapePiSearchValue(term)}"`);
  }
  if (request.description) {
    const desc = request.description.includes('*') || request.description.includes('?') ? request.description : `*${request.description}*`;
    criteria.push(`Descriptor:="${escapePiSearchValue(desc)}"`);
  }
  if (request.pointTypes.length) {
    criteria.push(`(${request.pointTypes.map((type) => `PointType:="${escapePiSearchValue(type)}"`).join(' OR ')})`);
  }
  if (request.engineeringUnits.length) {
    criteria.push(`(${request.engineeringUnits.map((unit) => `EngineeringUnits:="${escapePiSearchValue(unit)}"`).join(' OR ')})`);
  }
  if (request.pointSources.length) {
    criteria.push(`(${request.pointSources.map((source) => `PointSource:="${escapePiSearchValue(source)}"`).join(' OR ')})`);
  }
  return criteria.join(' AND ');
}

function escapePiSearchValue(value: string): string {
  return value.replace(/([\\"])/g, '\\$1');
}

async function enrichPiPointMetadata(
  candidates: PiPointSearchResult[],
  resourceApi: PiDataSourceResourceApi,
  dataSourceUid: string,
): Promise<PiPointSearchResult[]> {
  if (typeof resourceApi.getResource !== 'function') return candidates;
  const tasks = candidates.map((candidate) => async () => {
    if (!candidate.webId) return candidate;
    const cacheKey = `${dataSourceUid}:${candidate.webId}`;
    const cached = piPointMetadataCache.get(cacheKey);
    if (cached) return { ...candidate, ...cached };
    try {
      const response = await resourceApi.getResource(`/points/${encodeURIComponent(candidate.webId)}`);
      const metadata = normalizePiPointMetadata(response, dataSourceUid);
      if (metadata) {
        setBoundedCache(piPointMetadataCache, cacheKey, metadata);
        return { ...candidate, ...metadata };
      }
    } catch {
      // Um PI Point sem metadados não deve invalidar toda a pesquisa.
    }
    return candidate;
  });
  return runLimited(tasks, PI_POINT_METADATA_CONCURRENCY);
}

function normalizePiPointMetadata(value: unknown, dataSourceUid: string): PiPointSearchResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const fields = value as Record<string, unknown>;
  const name = getUnknownString(fields.Name) ?? getUnknownString(fields.text) ?? getUnknownString(fields.Text);
  if (!name) return undefined;
  const webId = getUnknownString(fields.WebId);
  const path = getUnknownString(fields.Path);
  const pointType = getUnknownString(fields.PointType);
  const description = getUnknownString(fields.Descriptor) ?? getUnknownString(fields.Description);
  const engineeringUnit = getUnknownString(fields.EngineeringUnits)
    ?? getUnknownString(fields.EngineeringUnit)
    ?? getUnknownString(fields.EngUnits);
  const pointSource = getUnknownString(fields.PointSource);
  return {
    name,
    ...(webId ? { webId } : {}),
    ...(path ? { path } : {}),
    ...(pointType ? { pointType } : {}),
    ...(description ? { description } : {}),
    ...(engineeringUnit ? { engineeringUnit } : {}),
    ...(pointSource ? { pointSource } : {}),
    dataSourceUid,
  };
}

function getResourceItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const items = (value as Record<string, unknown>).Items;
  return Array.isArray(items) ? items : [];
}

function getResourceTotal(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const fields = value as Record<string, unknown>;
  // Em algumas versões/adapters, `Total` representa apenas o tamanho da
  // página atual (normalmente 100), não o total da consulta. Somente
  // `TotalCount` é tratado como total global.
  const total = typeof fields.TotalCount === 'number' ? fields.TotalCount : undefined;
  return total !== undefined && Number.isFinite(total) && total >= 0 ? total : undefined;
}

function getUnknownString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function filterPiPointSearchResults(
  results: PiPointSearchResult[],
  request: ReturnType<typeof normalizePiPointSearchRequest>,
): PiPointSearchResult[] {
  return results.filter((result) => (
    matchesTagSearch(result.name, request.term)
    && includesIgnoreCase(result.description, request.description)
    && matchesAny(result.pointType, request.pointTypes)
    && (request.engineeringUnits.length === 0 || Boolean(result.engineeringUnit && request.engineeringUnits.some((unit) => includesIgnoreCase(result.engineeringUnit, unit))))
    && matchesAny(result.pointSource, request.pointSources)
  ));
}

function matchesTagSearch(name: string, term: string): boolean {
  if (!term) return true;
  if (!term.includes('*') && !term.includes('?')) {
    return name.toLocaleLowerCase().startsWith(term.toLocaleLowerCase());
  }
  const pattern = term
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`, 'i').test(name);
}

function includesIgnoreCase(value: string | undefined, expected: string): boolean {
  if (!expected) return true;
  if (!value) return false;
  if (expected.includes('*') || expected.includes('?')) {
    const pattern = expected
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${pattern}$`, 'i').test(value);
  }
  return value.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
}

function matchesAny(value: string | undefined, expected: string[]): boolean {
  return expected.length === 0 || Boolean(value && expected.some((item) => item.localeCompare(value, undefined, { sensitivity: 'base' }) === 0));
}

async function runLimited<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  }));
  return results;
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

export async function getPiPointDatabaseLimits(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiPointDatabaseLimits> {
  const dataSource = resolvePiDataSource(dataSourceSrv);
  if (!dataSource) throw new Error('PI Data Source não configurada');
  const instance = await getResolvedPiDataSource(dataSourceSrv, dataSource);
  const resourceApi = instance as PiDataSourceResourceApi;
  if (binding.webId && typeof resourceApi.getResource === 'function') {
    try {
      const response = await resourceApi.getResource(`/points/${encodeURIComponent(binding.webId)}`);
      const zero = getResourceNumber(response, 'Zero');
      const span = getResourceNumber(response, 'Span');
      if (zero !== undefined && span !== undefined && span > 0) return { zero, span };
    } catch {
      // Some datasource versions do not expose PI Point metadata as a resource.
    }
  }
  if (typeof instance.metricFindQuery !== 'function') throw new Error('A Data Source PI não expõe metadados de PI Points');
  const queries = [
    { path: binding.serverPath, pointName: binding.pointName, type: 'pipoint', webId: binding.webId },
    { path: '', pointName: binding.pointName, type: 'pipoint', webId: binding.webId },
  ];
  let point: MetricFindValue | undefined;
  for (const query of queries) {
    let points: MetricFindValue[] = [];
    try {
      points = await instance.metricFindQuery(query, { isPiPoint: true });
    } catch {
      continue;
    }
    point = points.find((candidate) => getMetricField(candidate, 'text') === binding.pointName) ?? points[0];
    if (getMetricNumber(point, 'Zero') !== undefined && getMetricNumber(point, 'Span') !== undefined) break;
  }
  const zero = getMetricNumber(point, 'Zero');
  const span = getMetricNumber(point, 'Span');
  if (zero === undefined || span === undefined || span <= 0) throw new Error('PI Point sem Zero/Span válidos');
  return { zero, span };
}

/**
 * Reads the PI Point attributes through the datasource already configured in
 * Grafana.  It deliberately uses the same resource/metricFind fallbacks used
 * by the existing database-limit and digital-state integrations.
 */
export async function getPiPointMetadata(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiPointMetadata> {
  const cacheKey = `${binding.dataSourceUid}:${binding.webId ?? `${binding.serverPath}\\${binding.pointName}`}`;
  const cached = piPointDetailsMetadataCache.get(cacheKey);
  if (cached) return cached;
  const request = loadPiPointMetadata(binding, dataSourceSrv).catch((error) => {
    piPointDetailsMetadataCache.delete(cacheKey);
    throw error;
  });
  setBoundedCache(piPointDetailsMetadataCache, cacheKey, request);
  return request;
}

/**
 * Reads the unmodified PI Point attribute values used by PE configuration.
 * This is deliberately a GET-only datasource resource call; no PI write path
 * is available from this helper.
 */
export async function getPiPerformanceEquationPointAttributes(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<PiPerformanceEquationPointAttributes> {
  if (!binding.webId) throw new Error('Descoberta de Performance Equation exige WebId do PI Point.');
  const pointPath = `/points/${encodeURIComponent(binding.webId)}`;
  const response = await getPiResource<unknown>(
    binding.dataSourceUid,
    `${pointPath}/attributes?selectedFields=Items.Name;Items.Value`,
    dataSourceSrv,
  );
  const attributes = rawPiPointAttributes(response);
  if (Object.keys(attributes).length === 0) {
    throw new Error('Resposta de atributos PE inválida ou vazia.');
  }
  return {
    name: binding.pointName,
    webId: binding.webId,
    ...(attributes.pointsource !== undefined ? { pointSource: attributes.pointsource } : {}),
    ...(attributes.exdesc !== undefined ? { exDesc: attributes.exdesc } : {}),
    ...(attributes.location1 !== undefined ? { location1: attributes.location1 } : {}),
    ...(attributes.location3 !== undefined ? { location3: attributes.location3 } : {}),
    ...(attributes.location4 !== undefined ? { location4: attributes.location4 } : {}),
    ...(attributes.scan !== undefined ? { scan: attributes.scan } : {}),
    ...(attributes.shutdown !== undefined ? { shutdown: attributes.shutdown } : {}),
    ...(attributes.pointclass !== undefined ? { pointClass: attributes.pointclass } : attributes.ptclassname !== undefined ? { pointClass: attributes.ptclassname } : {}),
    ...(attributes.pointtype !== undefined ? { pointType: attributes.pointtype } : {}),
  };
}

function rawPiPointAttributes(response: unknown): Record<string, unknown> {
  const entries = getResourceItems(response).flatMap((item): Array<[string, unknown]> => {
    if (!item || typeof item !== 'object') return [];
    const fields = item as Record<string, unknown>;
    const name = getUnknownString(fields.Name) ?? getUnknownString(fields.name);
    const value = unwrapPiAttributeValue(fields.Value ?? fields.value);
    return name && value !== undefined ? [[name.toLocaleLowerCase(), value]] : [];
  });
  return Object.fromEntries(entries);
}

async function loadPiPointMetadata(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'>,
): Promise<PiPointMetadata> {
  const dataSource = resolvePiDataSource(dataSourceSrv);
  if (!dataSource) throw new Error('PI Data Source não configurada');
  const instance = await getResolvedPiDataSource(dataSourceSrv, dataSource);
  const resourceApi = instance as PiDataSourceResourceApi;
  const metadata = await getPiPointMetadataForBinding(binding, instance, resourceApi, true);
  const attributes = binding.webId && typeof resourceApi.getResource === 'function'
    ? await getPiPointAttributes(resourceApi, binding.webId)
    : {};
  const fields = { ...(metadata ?? {}), ...attributes };
  const description = getMetadataString(fields, 'Description', 'Descriptor');
  const extendedDescriptor = getMetadataString(fields, 'ExtendedDescriptor', 'ExDesc');
  const instrumentTag = getMetadataString(fields, 'InstrumentTag', 'SourceTag', 'PointSource');
  const pointSource = getMetadataString(fields, 'PointSource');
  const pointType = getMetadataString(fields, 'PointType') ?? binding.pointType;
  const engineeringUnit = getMetadataString(fields, 'EngineeringUnits', 'EngUnits');
  const zero = getMetadataNumber(fields, 'Zero');
  const span = getMetadataNumber(fields, 'Span');
  const compDev = getMetadataNumber(fields, 'CompDev', 'CompressionDeviation');
  const excDev = getMetadataNumber(fields, 'ExcDev', 'ExceptionDeviation');
  const typicalValue = getMetadataScalar(fields, 'TypicalValue', 'TypicalVal');
  const stepped = getMetadataBoolean(fields, 'Step', 'Stepped');
  const pointId = getMetadataPointId(fields);
  return {
    name: getMetadataString(fields, 'Name', 'text') ?? binding.pointName,
    ...(description ? { description } : {}),
    ...(extendedDescriptor ? { extendedDescriptor } : {}),
    ...(pointSource ? { pointSource } : {}),
    ...(instrumentTag ? { instrumentTag } : {}),
    ...(pointType ? { pointType } : {}),
    ...(zero !== undefined ? { zero } : {}),
    ...(span !== undefined ? { span } : {}),
    ...(compDev !== undefined ? { compDev } : {}),
    ...(excDev !== undefined ? { excDev } : {}),
    ...(engineeringUnit ? { engineeringUnit } : {}),
    ...(typicalValue !== undefined ? { typicalValue } : {}),
    ...(stepped !== undefined ? { stepped } : {}),
    ...(pointId !== undefined ? { pointId } : {}),
  };
}

async function getPiPointAttributes(resourceApi: PiDataSourceResourceApi, webId: string): Promise<Record<string, unknown>> {
  const pointPath = `/points/${encodeURIComponent(webId)}/attributes`;
  for (const path of [`${pointPath}?selectedFields=Items.Name;Items.Value`, pointPath]) {
    try {
      const values = normalizePiPointAttributes(await resourceApi.getResource(path));
      if (Object.keys(values).length > 0) return values;
    } catch {
      // Try the next representation supported by this PI Web API version.
    }
  }
  const names = ['descriptor', 'exdesc', 'instrumenttag', 'sourcetag', 'pointsource', 'compdev', 'excdev', 'engunits', 'typicalvalue', 'pointid'];
  const responses = await Promise.all(names.map(async (name) => {
    try {
      const response = await resourceApi.getResource(`${pointPath}/${encodeURIComponent(name)}`);
      return [name, unwrapPiAttributeValue(response)] as const;
    } catch {
      return [name, undefined] as const;
    }
  }));
  return Object.fromEntries(responses.filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined));
}

function normalizePiPointAttributes(response: unknown): Record<string, unknown> {
  const entries = getResourceItems(response).flatMap((item): Array<[string, unknown]> => {
    if (!item || typeof item !== 'object') return [];
    const fields = item as Record<string, unknown>;
    const name = getUnknownString(fields.Name) ?? getUnknownString(fields.name);
    const value = unwrapPiAttributeValue(fields.Value ?? fields.value);
    return name && value !== undefined ? [[name, value]] : [];
  });
  return Object.fromEntries(entries);
}

function unwrapPiAttributeValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const fields = value as Record<string, unknown>;
  if ('Value' in fields) return unwrapPiAttributeValue(fields.Value);
  if ('value' in fields) return unwrapPiAttributeValue(fields.value);
  return undefined;
}

/**
 * Gets the actual Digital State Set assigned to a PI Point using the existing
 * Grafana PI datasource proxy.  No direct PI Web API connection is created.
 */
export function getPiPointDigitalStates(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiDigitalStatesResult> {
  const cacheKey = `${binding.dataSourceUid}:${binding.webId ?? `${binding.serverPath}\\${binding.pointName}`}`;
  const cached = piDigitalStatesCache.get(cacheKey);
  if (cached) return cached;

  const request = loadPiPointDigitalStates(binding, dataSourceSrv).catch((error) => {
    piDigitalStatesCache.delete(cacheKey);
    throw error;
  });
  setBoundedCache(piDigitalStatesCache, cacheKey, request);
  return request;
}

async function loadPiPointDigitalStates(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'>,
): Promise<PiDigitalStatesResult> {
  const dataSource = resolvePiDataSource(dataSourceSrv);
  if (!dataSource) throw new Error('PI Data Source não configurada');
  const instance = await getResolvedPiDataSource(dataSourceSrv, dataSource);
  const resourceApi = instance as PiDataSourceResourceApi;
  const metadata = await getPiPointMetadataForBinding(binding, instance, resourceApi);
  const pointType = getUnknownString(metadata?.PointType) ?? binding.pointType;
  const isDigital = pointType?.trim().toLocaleLowerCase() === 'digital';
  if (!isDigital) return { isDigital: false, states: [] };

  const embeddedStates = normalizePiDigitalStates(metadata);
  const digitalSet = getDigitalSetReference(metadata);
  const withSetIdentity = (states: PiDigitalState[]): PiDigitalState[] => states.map((state) => ({
    ...state,
    ...(digitalSet.webId ? { setWebId: digitalSet.webId } : {}),
    ...(digitalSet.name ? { setName: digitalSet.name } : {}),
  }));
  if (embeddedStates.length > 0) return { isDigital: true, states: withSetIdentity(embeddedStates) };
  if (typeof resourceApi.getResource !== 'function') {
    throw new Error('A Data Source PI não expõe estados digitais');
  }

  if (digitalSet.webId) {
    const states = await loadDigitalStatesBySetWebId(resourceApi, digitalSet.webId);
    if (states.length > 0) return { isDigital: true, states: withSetIdentity(states) };
  }
  if (digitalSet.name) {
    const states = await loadDigitalStatesByName(instance, resourceApi, digitalSet.name);
    if (states.length > 0) return { isDigital: true, states: withSetIdentity(states) };
  }
  throw new Error('Não foi possível localizar o conjunto de estados digitais da PI Point');
}

async function loadDigitalStatesBySetWebId(resourceApi: PiDataSourceResourceApi, webId: string): Promise<PiDigitalState[]> {
  const paths = [
    `/enumerationsets/${encodeURIComponent(webId)}/enumerationvalues`,
    `/enumerationsets/${encodeURIComponent(webId)}`,
    // Legacy/custom PI Web API adapters may expose these aliases.
    `/digitalstatesets/${encodeURIComponent(webId)}/digitalstates`,
    `/digitalstatesets/${encodeURIComponent(webId)}`,
  ];
  for (const path of paths) {
    try {
      const response = await resourceApi.getResource(path);
      const states = normalizePiDigitalStates(response);
      if (states.length > 0) return states;
      const linkedStates = await loadDigitalStatesFromLink(resourceApi, response);
      if (linkedStates.length > 0) return linkedStates;
    } catch {
      // PI Web API versions differ in which Digital State Set routes they expose.
    }
  }
  return [];
}

async function loadDigitalStatesByName(
  instance: PiDataSourceApi,
  resourceApi: PiDataSourceResourceApi,
  name: string,
): Promise<PiDigitalState[]> {
  const encodedName = encodeURIComponent(name);
  const serverWebId = await getPiDataServerWebId(instance);
  const paths = [
    ...(serverWebId ? [
      `/dataservers/${encodeURIComponent(serverWebId)}/enumerationsets?nameFilter=${encodedName}`,
      // Some PI Web API versions ignore or reject nameFilter. Load the
      // collection and select the exact DigitalSetName locally as fallback.
      `/dataservers/${encodeURIComponent(serverWebId)}/enumerationsets`,
    ] : []),
    // Legacy/custom aliases retained for compatibility.
    ...(serverWebId ? [`/dataservers/${encodeURIComponent(serverWebId)}/digitalstatesets?nameFilter=${encodedName}`] : []),
    `/enumerationsets?nameFilter=${encodedName}`,
    `/digitalstatesets?nameFilter=${encodedName}`,
  ];
  for (const path of paths) {
    try {
      const response = await resourceApi.getResource(path);
      const sets = getResourceItems(response).filter((set) => {
        const setName = getUnknownString((set as Record<string, unknown>)?.Name);
        return !setName || setName.toLocaleLowerCase() === name.toLocaleLowerCase();
      });
      for (const set of sets) {
        const states = normalizePiDigitalStates(set);
        if (states.length > 0) return states;
        const linkedStates = await loadDigitalStatesFromLink(resourceApi, set);
        if (linkedStates.length > 0) return linkedStates;
        const webId = getUnknownString((set as Record<string, unknown>).WebId);
        if (webId) {
          const directStates = await loadDigitalStatesBySetWebId(resourceApi, webId);
          if (directStates.length > 0) return directStates;
        }
      }
    } catch {
      // Continue with the next route supported by this datasource/PI Web API.
    }
  }
  return [];
}

/**
 * Lists the Digital State Sets of the Data Server identified by a binding.
 * The order returned by PI Web API is preserved, except that the documented
 * SYSTEM set is placed first for DigState(s) resolution.
 */
export function getPiDigitalStateSets(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
): Promise<PiDigitalStateSet[]> {
  const cacheKey = `${binding.dataSourceUid}:${binding.serverPath}`;
  const cached = piDigitalStateSetsCache.get(cacheKey);
  if (cached) return cached;

  const request = loadPiDigitalStateSets(binding, dataSourceSrv).catch((error) => {
    piDigitalStateSetsCache.delete(cacheKey);
    throw error;
  });
  setBoundedCache(piDigitalStateSetsCache, cacheKey, request);
  return request;
}

async function loadPiDigitalStateSets(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'>,
): Promise<PiDigitalStateSet[]> {
  const dataSource = resolvePiDataSource(dataSourceSrv);
  if (!dataSource) throw new Error('PI Data Source não configurada');
  const instance = await getResolvedPiDataSource(dataSourceSrv, dataSource);
  const resourceApi = instance as PiDataSourceResourceApi;
  if (typeof resourceApi.getResource !== 'function') {
    throw new Error('DigState sem tag requer listagem de Enumeration Sets, não exposta pela Data Source PI.');
  }
  const serverWebId = await getPiDataServerWebIdForBinding(instance, binding);
  if (!serverWebId) {
    throw new Error(`DigState sem tag não pôde identificar o Data Server de "${binding.serverPath}".`);
  }

  let response: unknown;
  try {
    response = await resourceApi.getResource(`/dataservers/${encodeURIComponent(serverWebId)}/enumerationsets`);
  } catch (error) {
    const status = getPiQueryStatus(error);
    if (status === 404 || status === 405 || status === 501) {
      throw new Error('DigState sem tag não é suportado pela versão atual da Data Source PI.');
    }
    throw error;
  }
  if (!Array.isArray(response) && (!response || typeof response !== 'object' || !Array.isArray((response as Record<string, unknown>).Items))) {
    throw new Error('Resposta inválida ao listar Enumeration Sets do PI Data Server.');
  }

  const rawSets = getResourceItems(response);
  const sets = await runLimited(rawSets.map((set) => async (): Promise<PiDigitalStateSet | undefined> => {
    if (!set || typeof set !== 'object') return undefined;
    const fields = set as Record<string, unknown>;
    const name = getUnknownString(fields.Name);
    if (!name) return undefined;
    const webId = getUnknownString(fields.WebId);
    const inline = normalizePiDigitalStates(set);
    const linked = inline.length > 0 ? inline : await loadDigitalStatesFromLinkStrict(resourceApi, set);
    const states = linked.length > 0 || !webId ? linked : await loadDigitalStatesBySetWebIdStrict(resourceApi, webId);
    const isSystem = name.toLocaleUpperCase() === 'SYSTEM';
    return {
      name,
      ...(webId ? { webId } : {}),
      isSystem,
      states: states.map((state) => ({ ...state, setName: name, ...(webId ? { setWebId: webId } : {}), ...(isSystem ? { isSystem: true } : {}) })),
    };
  }), PI_POINT_METADATA_CONCURRENCY);
  const resolved = sets.filter((set): set is PiDigitalStateSet => Boolean(set));
  const systemIndex = resolved.findIndex((set) => set.isSystem);
  if (systemIndex < 0) {
    throw new Error('DigState sem tag requer o Enumeration Set SYSTEM retornado pelo PI Data Server.');
  }
  return [resolved[systemIndex], ...resolved.filter((_set, index) => index !== systemIndex)];
}

async function loadDigitalStatesBySetWebIdStrict(resourceApi: PiDataSourceResourceApi, webId: string): Promise<PiDigitalState[]> {
  const paths = [
    `/enumerationsets/${encodeURIComponent(webId)}/enumerationvalues`,
    `/enumerationsets/${encodeURIComponent(webId)}`,
    `/digitalstatesets/${encodeURIComponent(webId)}/digitalstates`,
    `/digitalstatesets/${encodeURIComponent(webId)}`,
  ];
  let lastUnsupported: unknown;
  for (const path of paths) {
    try {
      const response = await resourceApi.getResource(path);
      const states = normalizePiDigitalStates(response);
      if (states.length > 0) return states;
      const linked = await loadDigitalStatesFromLinkStrict(resourceApi, response);
      if (linked.length > 0) return linked;
      return [];
    } catch (error) {
      const status = getPiQueryStatus(error);
      if (status === 404 || status === 405 || status === 501) {
        lastUnsupported = error;
        continue;
      }
      throw error;
    }
  }
  if (lastUnsupported) throw new Error(`Enumeration Values não são suportados para o set ${webId}.`);
  return [];
}

async function loadDigitalStatesFromLinkStrict(resourceApi: PiDataSourceResourceApi, source: unknown): Promise<PiDigitalState[]> {
  if (!source || typeof source !== 'object') return [];
  const links = (source as Record<string, unknown>).Links;
  const linkRecord = links && typeof links === 'object' ? links as Record<string, unknown> : undefined;
  const path = getUnknownString(linkRecord?.EnumerationValues)
    ?? getUnknownString(linkRecord?.Values)
    ?? getUnknownString(linkRecord?.DigitalStates)
    ?? getUnknownString(linkRecord?.States);
  if (!path) return [];
  return normalizePiDigitalStates(await resourceApi.getResource(toPiResourcePath(path)));
}

async function getPiDataServerWebId(instance: PiDataSourceApi): Promise<string | undefined> {
  if (typeof instance.metricFindQuery !== 'function') return undefined;
  try {
    const servers = await instance.metricFindQuery({ type: 'dataserver' }, { isPiPoint: true });
    return getMetricField(servers[0], 'WebId') ?? getMetricField(servers[0], 'value');
  } catch {
    return undefined;
  }
}

function normalizePiDataServerPath(value: string): string {
  return value.trim().replace(/^\\+|\\+$/g, '').toLocaleLowerCase();
}

async function getPiDataServerWebIdForBinding(instance: PiDataSourceApi, binding: PiPointBinding): Promise<string | undefined> {
  if (typeof instance.metricFindQuery !== 'function') return undefined;
  try {
    const servers = await instance.metricFindQuery({ type: 'dataserver' }, { isPiPoint: true });
    const expected = normalizePiDataServerPath(binding.serverPath);
    const candidates = servers.flatMap((server) => {
      const fields = server as MetricFindValue & Record<string, unknown>;
      const webId = getMetricField(server, 'WebId') ?? getMetricField(server, 'value');
      if (!webId) return [];
      const names = [fields.Name, fields.name, fields.Path, fields.path, fields.text, fields.value]
        .filter((value): value is string => typeof value === 'string')
        .map(normalizePiDataServerPath);
      return [{ webId, matches: names.includes(expected) }];
    });
    const matches = candidates.filter((candidate) => candidate.matches);
    if (matches.length === 1) return matches[0].webId;
    return candidates.length === 1 ? candidates[0].webId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the PI Data Server WebId used by PI Web API Calculation Controller.
 * It deliberately uses the configured GPA datasource, just like the other
 * PI Web API resource helpers in this module.
 */
export async function getPiCalculationDataServerWebId(
  binding: PiPointBinding,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<string | undefined> {
  const instance = await getResolvedPiDataSource(dataSourceSrv, {
    uid: binding.dataSourceUid,
    name: '',
    type: PI_DATASOURCE_TYPE,
  });
  return getPiDataServerWebIdForBinding(instance, binding);
}

/** Resolves an unambiguous PI Data Server without manufacturing a point binding. */
export async function resolvePiCalculationDataServerContext(
  dataSourceSrv: Pick<DataSourceSrv, 'getList' | 'get'> = getDataSourceSrv(),
  dataSourceUid?: string,
): Promise<PiCalculationDataServerContext> {
  const configured = dataSourceSrv.getList({ type: PI_DATASOURCE_TYPE })
    .filter((dataSource) => !dataSourceUid || dataSource.uid === dataSourceUid);
  const identity = configured.find((dataSource) => dataSource.isDefault)
    ?? (configured.length === 1 ? configured[0] : undefined);
  if (!identity) throw new Error('Não foi possível determinar unicamente o PI Data Server para esta expressão.');
  const instance = await getResolvedPiDataSource(dataSourceSrv, toPiDataSourceIdentity(identity));
  if (typeof instance.metricFindQuery !== 'function') throw new Error('A Data Source PI não expõe pesquisa de PI Data Servers.');
  const servers = await instance.metricFindQuery({ type: 'dataserver' }, { isPiPoint: true });
  const contexts = servers.flatMap((server) => {
    const webId = getMetricField(server, 'WebId') ?? getMetricField(server, 'value');
    if (!webId) return [];
    const serverPath = getMetricField(server, 'Name') ?? getMetricField(server, 'Path') ?? getMetricField(server, 'text') ?? '';
    return [{ dataSourceUid: identity.uid, serverPath, webId }];
  });
  if (contexts.length !== 1) throw new Error('Não foi possível determinar unicamente o PI Data Server para esta expressão.');
  return contexts[0];
}

async function loadDigitalStatesFromLink(resourceApi: PiDataSourceResourceApi, source: unknown): Promise<PiDigitalState[]> {
  if (!source || typeof source !== 'object') return [];
  const links = (source as Record<string, unknown>).Links;
  const linkRecord = links && typeof links === 'object' ? links as Record<string, unknown> : undefined;
  const path = getUnknownString(linkRecord?.EnumerationValues)
    ?? getUnknownString(linkRecord?.Values)
    ?? getUnknownString(linkRecord?.DigitalStates)
    ?? getUnknownString(linkRecord?.States);
  if (!path) return [];
  try {
    return normalizePiDigitalStates(await resourceApi.getResource(toPiResourcePath(path)));
  } catch {
    return [];
  }
}

function toPiResourcePath(link: string): string {
  try {
    const parsed = new URL(link);
    return `${parsed.pathname}${parsed.search}`.replace(/^.*?(\/piwebapi\/)/i, '/');
  } catch {
    return link.startsWith('/') ? link : `/${link}`;
  }
}

async function getPiPointMetadataForBinding(
  binding: PiPointBinding,
  instance: PiDataSourceApi,
  resourceApi: PiDataSourceResourceApi,
  includeCompleteMetadata = false,
): Promise<Record<string, unknown> | undefined> {
  if (binding.webId && typeof resourceApi.getResource === 'function') {
    const pointPath = `/points/${encodeURIComponent(binding.webId)}`;
    const paths = [
      `${pointPath}?selectedFields=WebId;Id;PointID;Name;Path;Description;Descriptor;InstrumentTag;SourceTag;PointSource;PointType;Step;Zero;Span;CompDev;ExcDev;EngineeringUnits;EngUnits;DigitalSetName;Links`,
      pointPath,
    ];
    let merged: Record<string, unknown> | undefined;
    for (const path of paths) {
      try {
        const response = await resourceApi.getResource(path);
        if (hasPiPointMetadata(response)) {
          if (!includeCompleteMetadata) return response as Record<string, unknown>;
          merged = { ...merged, ...(response as Record<string, unknown>) };
        }
      } catch {
        // Try the next form supported by this PI Web API version.
      }
    }
    if (merged) return merged;
  }
  const serverWebId = await getPiDataServerWebIdForBinding(instance, binding);
  if (serverWebId && typeof resourceApi.getResource === 'function') {
    try {
      const response = await resourceApi.getResource(
        `/dataservers/${encodeURIComponent(serverWebId)}/points?nameFilter=${encodeURIComponent(binding.pointName)}&selectedFields=Items.WebId;Items.Id;Items.PointID;Items.Name;Items.Path;Items.Description;Items.Descriptor;Items.InstrumentTag;Items.SourceTag;Items.PointSource;Items.PointType;Items.Step;Items.Zero;Items.Span;Items.CompDev;Items.ExcDev;Items.EngineeringUnits;Items.EngUnits;Items.DigitalSetName;Items.Links`,
      );
      const point = getResourceItems(response).find((item) => (
        getUnknownString((item as Record<string, unknown>)?.Name)?.toLocaleLowerCase() === binding.pointName.toLocaleLowerCase()
      )) ?? getResourceItems(response)[0];
      if (hasPiPointMetadata(point)) return point as Record<string, unknown>;
    } catch {
      // metricFindQuery below remains a compatible final fallback.
    }
  }
  if (typeof instance.metricFindQuery !== 'function') return undefined;
  try {
    const points = await instance.metricFindQuery(
      { path: binding.serverPath, pointName: binding.pointName, type: 'pipoint' },
      { isPiPoint: true },
    );
    const point = points.find((candidate) => getMetricField(candidate, 'text') === binding.pointName) ?? points[0];
    return point as unknown as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

function hasPiPointMetadata(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const fields = value as Record<string, unknown>;
  return getUnknownString(fields.PointType) !== undefined
    || getUnknownString(fields.DigitalSetName) !== undefined
    || getUnknownString(fields.Name) !== undefined;
}

function getDigitalSetReference(metadata: Record<string, unknown> | undefined): { webId?: string; name?: string } {
  if (!metadata) return {};
  const nested = metadata.DigitalSet ?? metadata.DigitalStateSet;
  const nestedRecord = nested && typeof nested === 'object' ? nested as Record<string, unknown> : undefined;
  const links = metadata.Links && typeof metadata.Links === 'object' ? metadata.Links as Record<string, unknown> : undefined;
  const link = getUnknownString(links?.DigitalSet) ?? getUnknownString(links?.DigitalStateSet);
  const linkWebId = link?.match(/digitalstatesets\/([^/?]+)/i)?.[1];
  return {
    webId: getUnknownString(metadata.DigitalSetWebId)
      ?? getUnknownString(metadata.DigitalStateSetWebId)
      ?? getUnknownString(nestedRecord?.WebId)
      ?? linkWebId,
    name: getUnknownString(metadata.DigitalSetName)
      ?? getUnknownString(metadata.DigitalStateSetName)
      ?? (typeof nested === 'string' ? getUnknownString(nested) : undefined)
      ?? getUnknownString(nestedRecord?.Name),
  };
}

function normalizePiDigitalStates(response: unknown): PiDigitalState[] {
  const items = getResourceItems(response);
  const candidates = items.length > 0 ? items : Array.isArray(response) ? response : [];
  const unique = new Map<string, PiDigitalState>();
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const state = item as Record<string, unknown>;
    const name = getUnknownString(state.Name) ?? getUnknownString(state.name) ?? getUnknownString(state.Text) ?? getUnknownString(state.text);
    if (!name) continue;
    const rawValue = state.Value ?? state.value ?? state.Code ?? state.code;
    const value = typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : undefined;
    const key = value === undefined ? `name:${name.toLocaleLowerCase()}` : `value:${value}`;
    unique.set(key, { name, ...(value === undefined ? {} : { value }) });
  }
  return [...unique.values()];
}

/**
 * Decodes the documented PI Alarm State Set layout.  A regular enumeration
 * set is deliberately rejected: the terminal Nack/MaxPriority marker and the
 * condition-only states are required evidence of the alarm encoding.
 */
export function decodePiAlarmState(states: readonly PiDigitalState[], value: unknown): PiAlarmStateInfo {
  const markerName = states.find((state) => /^\s*\d+\s+\d+\s*$/.test(state.name))?.name;
  if (!markerName) {
    throw new Error('O Digital State Set não possui a estrutura de Alarm State Set reconhecível.');
  }
  const markerParts = markerName.trim().split(/\s+/).map(Number);
  const nackCount = markerParts[0];
  const maxPriority = markerParts[1];
  if (nackCount !== 3 || maxPriority < 1 || !Number.isInteger(maxPriority)) {
    throw new Error('Alarm State Set requer três estados de acknowledgement e prioridade máxima inteira.');
  }

  const numericStates = states
    .filter((state): state is PiDigitalState & { value: number } => typeof state.value === 'number')
    .sort((left, right) => left.value - right.value);
  const marker = numericStates.find((state) => state.name === markerName);
  if (!marker) throw new Error('Marcador do Alarm State Set sem código numérico.');
  const noAlarm = numericStates.find((state) => /^(----|no alarm|\.)$/i.test(state.name.trim()));
  if (!noAlarm) throw new Error('Alarm State Set sem estado estrutural de ausência de alarme.');
  const offset = (candidate: PiDigitalState & { value: number }) => candidate.value - noAlarm.value;
  if (offset(marker) <= 0) throw new Error('Alarm State Set possui marcador inválido.');

  const statesPerCondition = nackCount * maxPriority;
  const conditionOnlyCount = (offset(marker) - 1) / (statesPerCondition + 1);
  if (!Number.isInteger(conditionOnlyCount) || conditionOnlyCount < 1) {
    throw new Error('Alarm State Set sem quantidade de condições determinística.');
  }
  const conditionStates = numericStates.filter((state) => {
    const code = offset(state);
    return code > conditionOnlyCount * statesPerCondition
      && code < offset(marker);
  });
  if (conditionStates.length !== conditionOnlyCount) {
    throw new Error('Alarm State Set sem estados de condição estruturalmente válidos.');
  }

  const rawValue = value && typeof value === 'object' && 'value' in value
    ? (value as { value?: unknown }).value
    : value;
  const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  const current = numericStates.find((state) => state.value === numericValue);
  if (!current) throw new Error('O valor atual não existe no Alarm State Set resolvido.');
  const code = offset(current);
  if (code === 0) return { conditionCode: 0, conditionText: noAlarm.name, acknowledgementStatus: 0, priority: 0 };

  const activeStates = conditionOnlyCount * statesPerCondition;
  if (code > activeStates) {
    const conditionCode = code - activeStates;
    const condition = conditionStates.find((state) => offset(state) === activeStates + conditionCode);
    if (!condition) throw new Error('Estado de condição de alarme não resolvido.');
    return { conditionCode, conditionText: condition.name, acknowledgementStatus: 0, priority: 0 };
  }

  const conditionCode = Math.floor((code - 1) / statesPerCondition) + 1;
  const withinCondition = (code - 1) % statesPerCondition;
  const acknowledgementStatus = Math.floor(withinCondition / maxPriority) as 0 | 1 | 2;
  const priority = (withinCondition % maxPriority) + 1;
  const condition = conditionStates.find((state) => offset(state) === activeStates + conditionCode);
  if (!condition) throw new Error('Condição de alarme não resolvida para o estado atual.');
  return { conditionCode, conditionText: condition.name, acknowledgementStatus, priority };
}

export async function getPiPointsCurrentValues(
  bindings: readonly PiPointBinding[],
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<Record<string, PiPointValueResult>> {
  const uniqueBindings = deduplicateBindings(bindings);
  if (uniqueBindings.length === 0) {
    return {};
  }
  const grouped = groupBindingsByQuerySource(uniqueBindings);
  const results: Record<string, PiPointValueResult> = {};

  const tasks = [...grouped.values()].flatMap((group) => (
    chunkBindings(group, DATA_QUERY_CURRENT_MAX_TARGETS).map((batch) => async () => {
      const dataSourceUid = batch[0].dataSourceUid;
      const deadline = Date.now() + DATA_QUERY_CURRENT_TIMEOUT_MS;
      const now = Date.now();
      try {
        const instance = await getResolvedPiDataSource(dataSourceSrv, {
          uid: dataSourceUid,
          name: '',
          type: PI_DATASOURCE_TYPE,
        });
        if (typeof instance.query !== 'function') {
          throw new Error('A Data Source PI não expõe consulta de valores');
        }

        const response = await queryCurrentValues(instance, batch, now, deadline);
        const batchResults = normalizeCurrentValues(response, batch);
        Object.assign(results, batchResults);

        // Se alguma tag dentro do lote falhou, tenta individualmente para ela
        const failedInBatch = batch.filter((binding) => {
          const res = batchResults[getBindingKey(binding)];
          return !res || res.status === 'error';
        });

        // Alguns drivers retornam HTTP 200, mas incluem response.error e não
        // produzem frames quando uma tag do lote falha. Nessa situação todas
        // as tags precisam do retry unitário; uma resposta vazia sem erro não
        // deve multiplicar consultas desnecessariamente.
        const responseHasError = Boolean(response.error);
        if (failedInBatch.length > 0 && responseHasError && failedInBatch.length === batch.length && batch.length > 1) {
          // Quando o driver invalida o lote inteiro, a consulta unitária de
          // todas as tags fica cara. A divisão binária encontra as tags ruins
          // mantendo os grupos válidos em lote.
          const retryFailedBatch = async (failedBatch: readonly PiPointBinding[]): Promise<void> => {
            try {
              const retryResponse = await queryCurrentValues(instance, failedBatch, now, deadline);
              const retryResults = normalizeCurrentValues(retryResponse, failedBatch);
              Object.assign(results, retryResults);
              const unresolved = failedBatch.filter((binding) => retryResults[getBindingKey(binding)]?.status !== 'success');
              if (unresolved.length === 0) {
                return;
              }
              if (unresolved.length < failedBatch.length) {
                await retryFailedBatch(unresolved);
                return;
              }
            } catch (retryError) {
              if (isCurrentValueTimeout(retryError)) {
                markCurrentValueErrors(results, failedBatch, toError(retryError));
                return;
              }
              // Divide o lote abaixo para isolar a falha.
            }
            if (failedBatch.length > 1) {
              const middle = Math.ceil(failedBatch.length / 2);
              await retryFailedBatch(failedBatch.slice(0, middle));
              await retryFailedBatch(failedBatch.slice(middle));
            }
          };
          await retryFailedBatch(batch);
        } else if (failedInBatch.length > 0 && (failedInBatch.length < batch.length || responseHasError)) {
          for (const binding of failedInBatch) {
            try {
              const singleResponse = await queryCurrentValues(instance, [binding], now, deadline);
              const singleResult = normalizeCurrentValues(singleResponse, [binding]);
              if (singleResult[getBindingKey(binding)]?.status === 'success') {
                results[getBindingKey(binding)] = singleResult[getBindingKey(binding)];
              }
            } catch (singleError) {
              if (isCurrentValueTimeout(singleError)) {
                results[getBindingKey(binding)] = { status: 'error', error: toError(singleError) };
              }
              // Mantém o status original para falhas que não sejam timeout.
            }
          }
        }
      } catch (error) {
        const batchError = toError(error);
        if (isCurrentValueTimeout(batchError)) {
          markCurrentValueErrors(results, batch, batchError);
          return;
        }
        // Alguns PI Web APIs rejeitam todo o lote quando apenas uma tag possui
        // erro. Separamos o lote recursivamente para preservar as leituras
        // válidas sem depender de uma sequência longa de consultas unitárias.
        try {
          const instance = await getResolvedPiDataSource(dataSourceSrv, {
            uid: dataSourceUid,
            name: '',
            type: PI_DATASOURCE_TYPE,
          });
          const resolveFailedBatch = async (failedBatch: readonly PiPointBinding[], fallbackError: Error): Promise<void> => {
            try {
              const response = await queryCurrentValues(instance, failedBatch, now, deadline);
              const retryResults = normalizeCurrentValues(response, failedBatch);
              Object.assign(results, retryResults);
              const unresolved = failedBatch.filter((binding) => retryResults[getBindingKey(binding)]?.status !== 'success');
              if (unresolved.length === 0) {
                return;
              }
              if (unresolved.length < failedBatch.length) {
                await resolveFailedBatch(unresolved, fallbackError);
                return;
              }
            } catch (retryError) {
              const retryErrorValue = toError(retryError);
              if (isCurrentValueTimeout(retryErrorValue)) {
                markCurrentValueErrors(results, failedBatch, retryErrorValue);
                return;
              }
              fallbackError = retryErrorValue;
            }

            if (failedBatch.length === 1) {
              results[getBindingKey(failedBatch[0])] = { status: 'error', error: fallbackError };
              return;
            }
            const middle = Math.ceil(failedBatch.length / 2);
            await resolveFailedBatch(failedBatch.slice(0, middle), fallbackError);
            await resolveFailedBatch(failedBatch.slice(middle), fallbackError);
          };
          if (batch.length === 1) {
            results[getBindingKey(batch[0])] = { status: 'error', error: batchError };
          } else {
            const middle = Math.ceil(batch.length / 2);
            await resolveFailedBatch(batch.slice(0, middle), batchError);
            await resolveFailedBatch(batch.slice(middle), batchError);
          }
        } catch {
          for (const binding of batch) {
            results[getBindingKey(binding)] = { status: 'error', error: toError(error) };
          }
        }
      }
    })
  ));
  await runQueryTasks(tasks, DATA_QUERY_CURRENT_MAX_CONCURRENT_BATCHES);

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

export async function getPiTrendsPlotDataForRange(
  bindings: readonly PiPointBinding[],
  range: PiTrendTimeRange,
  dataSourceSrvOrOptions: Pick<DataSourceSrv, 'get'> | PiTrendQueryOptions = getDataSourceSrv(),
  explicitOptions: PiTrendQueryOptions = {},
): Promise<Record<string, PiTrendSeriesResult>> {
  const { dataSourceSrv, options } = resolveTrendQueryArguments(dataSourceSrvOrOptions, explicitOptions);
  const uniqueBindings = deduplicateBindings(bindings);
  const results: Record<string, PiTrendSeriesResult> = {};

  if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to) {
    return Object.fromEntries(uniqueBindings.map((binding) => [
      getBindingKey(binding),
      { status: 'error', error: new Error('Período histórico inválido') } as PiTrendSeriesResult,
    ]));
  }

  const tasks = uniqueBindings.map((binding) => async () => {
    const key = getBindingKey(binding);
    try {
      if (!binding.webId) {
        throw new Error('PlotData requer o WebID do PI Point');
      }
      const instance = await getResolvedPiDataSource(dataSourceSrv, {
        uid: binding.dataSourceUid,
        name: '',
        type: PI_DATASOURCE_TYPE,
      });
      const resourceApi = instance as PiDataSourceResourceApi;
      if (typeof resourceApi.getResource !== 'function') {
        throw new Error('A Data Source PI não expõe o recurso PlotData');
      }
      const intervals = clampTrendMaxDataPoints(options.maxDataPoints);
      const path = `/streams/${encodeURIComponent(binding.webId)}/plot?startTime=${encodeURIComponent(new Date(range.from).toISOString())}&endTime=${encodeURIComponent(new Date(range.to).toISOString())}&intervals=${intervals}`;
      const response = await withTimeout(
        resourceApi.getResource(path),
        5_000,
        `PlotData excedeu o tempo limite para ${binding.pointName}`,
      );
      results[key] = { status: 'success', series: normalizePlotDataResponse(response, binding.pointName) };
    } catch (error) {
      results[key] = { status: 'error', error: toError(error) };
    }
  });
  await runQueryTasks(tasks);

  return results;
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
  const grouped = groupBindingsByQuerySource(uniqueBindings);
  const results: Record<string, PiTrendSeriesResult> = {};

  if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to) {
    return Object.fromEntries(uniqueBindings.map((binding) => [
      getBindingKey(binding),
      { status: 'error', error: new Error('Período histórico inválido') } as PiTrendSeriesResult,
    ]));
  }

  const tasks = [...grouped.values()].flatMap((group) => (
    chunkBindings(group).map((batch) => async () => {
      const dataSourceUid = batch[0].dataSourceUid;
      try {
        const instance = await getResolvedPiDataSource(dataSourceSrv, {
          uid: dataSourceUid,
          name: '',
          type: PI_DATASOURCE_TYPE,
        });
        if (typeof instance.query !== 'function') {
          throw new Error('A Data Source PI não expõe consulta histórica');
        }

        const resolveBatch = async (selected: readonly PiPointBinding[], fallbackError: Error): Promise<void> => {
          let response: DataQueryResponse;
          const request = buildHistoricalTrendRequest(selected, range, mode, options);
          try {
            response = await runHistoricalQuery(() => withTimeout(
              resolveQueryResponse(instance.query(request)),
              DATA_QUERY_HISTORICAL_TIMEOUT_MS,
              `Consulta histórica excedeu o tempo limite para ${selected.map(({ pointName }) => pointName).join(', ')}`,
            ));
            const responseError = getHistoricalQueryResponseError(response);
            if (responseError) {
              throw responseError;
            }
          } catch (error: unknown) {
            logPiQueryError(error);

            if (mode === 'recorded' && hasRecordedBoundaryType(request)) {
              const fallbackRequest = buildHistoricalFallbackRequest(request, selected[0].dataSourceUid);
              try {
                response = await runHistoricalQuery(() => withTimeout(
                  resolveQueryResponse(instance.query(fallbackRequest)),
                  DATA_QUERY_HISTORICAL_TIMEOUT_MS,
                  'Fallback de consulta histórica excedeu o tempo limite',
                ));
                const fallbackResponseError = getHistoricalQueryResponseError(response);
                if (fallbackResponseError) {
                  throw fallbackResponseError;
                }
              } catch (fallbackQueryError: unknown) {
                logPiQueryError(fallbackQueryError);
                const queryError = toError(fallbackQueryError);
                markTrendErrors(results, selected, queryError);
                return;
              }
            } else {
              const queryError = toError(error);
              if (isHistoricalTrendTimeout(queryError) || selected.length === 1) {
                markTrendErrors(results, selected, queryError);
                return;
              }
              const middle = Math.ceil(selected.length / 2);
              await resolveBatch(selected.slice(0, middle), queryError);
              await resolveBatch(selected.slice(middle), queryError);
              return;
            }
          }

          if (mode === 'recorded' && response.data.length === 0) {
            for (const binding of selected) {
              results[getBindingKey(binding)] = { status: 'success', series: { pointName: binding.pointName, points: [] } };
            }
            return;
          }
          const batchResults = normalizeTrendResponse(response, selected, mode);
          Object.assign(results, batchResults);
          const failed = selected.filter((binding) => batchResults[getBindingKey(binding)]?.status === 'error');
          if (failed.length === 0) {
            return;
          }
          // Alguns drivers rejeitam o lote inteiro por causa de um target.
          // Reconsulta somente os targets com erro ou divide o lote quando
          // nenhuma série foi aceita, preservando as tags válidas.
          if (response.error && failed.length < selected.length) {
            const firstError = batchResults[getBindingKey(failed[0])];
            await resolveBatch(failed, firstError?.status === 'error' ? firstError.error : fallbackError);
            return;
          }
          if (response.error && selected.length > 1) {
            const middle = Math.ceil(selected.length / 2);
            await resolveBatch(selected.slice(0, middle), fallbackError);
            await resolveBatch(selected.slice(middle), fallbackError);
          }
        };

        await resolveBatch(batch, new Error('Consulta histórica sem resposta'));
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
  // Current Values use the datasource's last-value path. Keep the requested
  // range tiny so a snapshot does not make PI scan an unnecessary 24-hour
  // history before returning the value.
  const start = dateTime(now - CURRENT_VALUE_LOOKBACK_MS);

  return {
    requestId: nextDataQueryRequestId('values', bindings[0].dataSourceUid),
    interval: '1s',
    intervalMs: 1000,
    maxDataPoints: 1,
    range: { from: start, to: end, raw: { from: start.toISOString(), to: end.toISOString() } },
    scopedVars: {},
    targets: bindings.map((binding, index) => buildCurrentValueTarget(binding, index)),
    timezone: 'browser',
    app: 'app',
    startTime: now - CURRENT_VALUE_LOOKBACK_MS,
    endTime: now,
  };
}

function buildCurrentValueTarget(binding: PiPointBinding, index: number): DataQuery {
  const pointName = binding.pointName;
  const target = binding.serverPath ? `${binding.serverPath};${pointName}` : pointName;
  const segments = binding.serverPath ? [{ label: binding.serverPath, value: { value: binding.serverPath } }] : [];
  return {
    refId: refIdForIndex(index),
    target,
    attributes: [{ label: pointName, value: { value: pointName } }],
    segments,
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
    range: { from: start, to: end, raw: { from: start.toISOString(), to: end.toISOString() } },
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

function hasRecordedBoundaryType(request: DataQueryRequest<DataQuery>): boolean {
  return request.targets.some((target) => {
    const recordedValues = (target as DataQuery & { recordedValues?: { boundaryType?: unknown } }).recordedValues;
    return recordedValues?.boundaryType !== undefined;
  });
}

function buildHistoricalFallbackRequest(
  request: DataQueryRequest<DataQuery>,
  dataSourceUid: string,
): DataQueryRequest<DataQuery> {
  return {
    ...request,
    requestId: nextDataQueryRequestId('trend', dataSourceUid),
    targets: request.targets.map((target) => {
      const fallbackTarget = { ...target } as DataQuery & {
        recordedValues?: Record<string, unknown>;
        digitalStates?: Record<string, unknown>;
      };
      if (fallbackTarget.recordedValues) {
        const recordedValues = { ...fallbackTarget.recordedValues };
        // GPA 5.2.0 usa Inside por default: remover o campo não muda a fronteira no PI Web API.
        delete recordedValues.boundaryType;
        fallbackTarget.recordedValues = recordedValues;
      }
      if (fallbackTarget.digitalStates) {
        fallbackTarget.digitalStates = { ...fallbackTarget.digitalStates, enable: false };
      }
      return fallbackTarget;
    }),
  };
}

function getHistoricalQueryResponseError(response: unknown): Error | undefined {
  if (!response || typeof response !== 'object') {
    return new Error('Resposta histórica inválida: resposta ausente');
  }
  const value = response as Record<string, unknown>;
  const responseError = value.error;
  const status = getPiQueryStatus(responseError) ?? getPiQueryStatus(value);
  if (typeof status === 'number' && status >= 400) {
    return createPiQueryResponseError(status, responseError ?? value);
  }
  if (responseError) {
    return createPiQueryResponseError(status, responseError);
  }
  if (!Array.isArray(value.data)) {
    return new Error('Resposta histórica inválida: campo data ausente');
  }
  if (value.data.some((frame) => !frame || !Array.isArray(frame.fields)
    || !frame.fields.every((field: DataFrame['fields'][number]) => field && typeof field.name === 'string' && field.values != null)
    || !frame.fields.some((field: DataFrame['fields'][number]) => field.name.toLowerCase() === 'time')
    || frame.fields.length < 2)) {
    return new Error('Resposta histórica inválida: série sem campos Time/Value');
  }
  return undefined;
}

function createPiQueryResponseError(status: number | undefined, body: unknown): Error {
  const bodyRecord = body && typeof body === 'object' ? body as Record<string, unknown> : undefined;
  const responseBody = bodyRecord?.data ?? body;
  const responseBodyRecord = responseBody && typeof responseBody === 'object'
    ? responseBody as Record<string, unknown>
    : undefined;
  const message = typeof bodyRecord?.message === 'string'
    ? bodyRecord.message
    : typeof responseBodyRecord?.message === 'string' ? responseBodyRecord.message
    : typeof body === 'string' ? body : 'Falha na consulta histórica do PI';
  const error = new Error(message) as Error & { status?: number; responseBody?: unknown };
  error.status = status;
  error.responseBody = responseBody;
  return error;
}

function getPiQueryStatus(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const rawStatus = record.status ?? record.statusCode ?? (record.response && typeof record.response === 'object'
    ? (record.response as Record<string, unknown>).status
    : undefined);
  const status = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus);
  return Number.isFinite(status) ? status : undefined;
}

function logPiQueryError(error: unknown): void {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : undefined;
  const response = value?.response && typeof value.response === 'object' ? value.response as Record<string, unknown> : undefined;
  const status = getPiQueryStatus(error);
  const responseBody = value?.responseBody ?? value?.data ?? response?.data;
  const message = typeof value?.message === 'string' ? value.message : String(error);
  console.error('[PI QUERY ERROR]', { status, responseBody, message });
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
  const unit = getFieldUnit(valueField);

  const quality = normalizeQuality(frame);
  return {
    value,
    timestamp: normalizeTimestamp(timestamp),
    ...(unit ? { unit } : {}),
    ...(quality ? { quality } : {}),
  };
}

function getFieldUnit(field: DataFrame['fields'][number] | undefined): string | undefined {
  const config = field ? field.config as Record<string, unknown> : undefined;
  const unit = config?.unit;
  return typeof unit === 'string' && unit.trim().length > 0 ? unit : undefined;
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
    const frame = resolveCurrentValueFrame(frames, framesByRefId, binding.pointName, refId, index, bindings.length);
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

/**
 * Datasources normalmente devolvem um frame por target, mas nem todos
 * preservam o refId do target. Nessa situação o plugin ainda pode devolver
 * os frames na mesma ordem da consulta. Mantemos a resolução por refId e por
 * nome como prioridades, usando a posição somente como último fallback.
 */
function resolveCurrentValueFrame(
  frames: DataFrame[],
  framesByRefId: Map<string, DataFrame>,
  pointName: string,
  refId: string,
  index: number,
  bindingCount: number,
): DataFrame | undefined {
  const normalizedPointName = pointName.toLocaleLowerCase();
  return framesByRefId.get(refId)
    ?? frames.find((frame) => {
      const frameName = (frame.name ?? '').toLocaleLowerCase();
      return frameName === normalizedPointName
        || frameName.endsWith(`;${normalizedPointName}`)
        || frame.fields.some((field) => field.name.toLocaleLowerCase() === normalizedPointName);
    })
    ?? (frames.length === 1 && bindingCount === 1 ? frames[0] : undefined)
    ?? (frames.length === bindingCount ? frames[index] : undefined);
}

function normalizeTrendResponse(
  response: DataQueryResponse,
  bindings: readonly PiPointBinding[],
  mode: 'plot' | 'preview' | 'recorded' = 'plot',
): Record<string, PiTrendSeriesResult> {
  const results: Record<string, PiTrendSeriesResult> = {};
  const frames = Array.isArray(response.data) ? response.data as DataFrame[] : [];
  const framesByRefId = new Map(frames.flatMap((frame) => {
    const refId = frame.refId;
    return refId ? [[refId, frame] as const] : [];
  }));

  bindings.forEach((binding, index) => {
    const refId = refIdForIndex(index);
    const frame = resolveTrendFrame(frames, framesByRefId, binding.pointName, refId, index, bindings.length);
    const key = getBindingKey(binding);

    try {
      if (!frame) {
        results[key] = { status: 'error', error: getTrendResponseError(response, refId) };
      } else {
        results[key] = {
          status: 'success',
            // The recorded request uses boundaryType "Inside"; only that
            // contract permits treating returned values as archived events.
            series: normalizeTrendFrame(frame, binding.pointName, mode === 'recorded' ? 'recorded' : undefined),
        };
      }
    } catch (error) {
      results[key] = { status: 'error', error: toError(error) };
    }
  });

  return results;
}

/**
 * O datasource PI nem sempre preserva o refId enviado pelo target. Em lotes
 * maiores ele pode devolver apenas o nome da série ou os frames na mesma
 * ordem dos targets. Aceitamos essas formas antes de marcar a tag como BAD.
 */
function resolveTrendFrame(
  frames: DataFrame[],
  framesByRefId: Map<string, DataFrame>,
  pointName: string,
  refId: string,
  index: number,
  bindingCount: number,
): DataFrame | undefined {
  const normalizedPointName = pointName.toLocaleLowerCase();
  return framesByRefId.get(refId)
    ?? frames.find((frame) => {
      const frameName = (frame.name ?? '').toLocaleLowerCase();
      return frameName === normalizedPointName
        || frameName.endsWith(`;${normalizedPointName}`)
        || frame.fields.some((field) => field.name.toLocaleLowerCase() === normalizedPointName);
    })
    ?? (frames.length === 1 && bindingCount === 1 ? frames[0] : undefined)
    ?? (frames.length === bindingCount ? frames[index] : undefined);
}

function normalizeTrendFrame(frame: DataFrame, pointName: string, origin?: PiHistoricalOrigin): PiTrendSeries {
  const timeField = frame.fields.find((field) => field.name.toLocaleLowerCase() === 'time');
  const qualityFields = frame.fields.filter((field) => ['good', 'questionable', 'substituted', 'annotated']
    .includes(field.name.toLocaleLowerCase()));
  const valueFields = frame.fields.filter((field) => field !== timeField && !qualityFields.includes(field));
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
    return normalizeStateTrendFrame(pointName, getFieldValues(timeField), values, qualityFields, origin);
  }

  const times = getFieldValues(timeField);
  const points: TrendPoint[] = [];
  const historicalValues: PiHistoricalValue[] = [];
  const length = Math.min(times.length, values.length);
  for (let index = 0; index < length; index += 1) {
    const time = normalizeTrendTimestamp(times[index]);
    const value = values[index];
    if (time === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    points.push({ time, value });
    const quality = normalizeHistoricalQuality(qualityFields, index);
    historicalValues.push({ timestamp: time, value, ...(quality ? { quality } : {}), ...(origin ? { origin } : {}) });
  }

  points.sort((left, right) => left.time - right.time);
  historicalValues.sort((left, right) => left.timestamp - right.timestamp);
  return { pointName, points, ...(historicalValues.length > 0 ? { historicalValues } : {}) };
}

function normalizePlotDataResponse(response: unknown, pointName: string): PiTrendSeries {
  const items = response && typeof response === 'object' && Array.isArray((response as { Items?: unknown[] }).Items)
    ? (response as { Items: unknown[] }).Items
    : [];
  const values = items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const point = item as { Timestamp?: unknown; Value?: unknown };
    const time = normalizeTrendTimestamp(point.Timestamp);
    const value = point.Value;
    return time === undefined || value === null || value === undefined ? [] : [{ time, value }];
  });
  const numericPoints = values.flatMap(({ time, value }) => (
    typeof value === 'number' && Number.isFinite(value) ? [{ time, value }] : []
  ));
  if (numericPoints.length > 0) {
    return { pointName, points: numericPoints.sort((left, right) => left.time - right.time) };
  }
  return {
    pointName,
    points: [],
    states: values.map(({ time, value }) => ({ time, value: String(value) })).sort((left, right) => left.time - right.time),
  };
}

function normalizeStateTrendFrame(
  pointName: string,
  times: unknown[],
  values: unknown[],
  qualityFields: DataFrame['fields'][number][] = [],
  origin?: PiHistoricalOrigin,
): PiTrendSeries {
  const states: TrendStatePoint[] = [];
  const historicalValues: PiHistoricalValue[] = [];
  const length = Math.min(times.length, values.length);
  for (let index = 0; index < length; index += 1) {
    const time = normalizeTrendTimestamp(times[index]);
    const value = values[index];
    if (time === undefined || value === null || value === undefined) {
      continue;
    }
    states.push({ time, value: String(value) });
    const quality = normalizeHistoricalQuality(qualityFields, index);
    historicalValues.push({ timestamp: time, value: String(value), ...(quality ? { quality } : {}), ...(origin ? { origin } : {}) });
  }
  states.sort((left, right) => left.time - right.time);
  historicalValues.sort((left, right) => left.timestamp - right.timestamp);
  return { pointName, points: [], states, ...(historicalValues.length > 0 ? { historicalValues } : {}) };
}

function normalizeHistoricalQuality(
  fields: DataFrame['fields'][number][],
  index: number,
): PiRecordedRawQuality | undefined {
  const quality = fields.reduce<PiRecordedRawQuality>((result, field) => {
    const value = getFieldValues(field)[index];
    if (typeof value !== 'boolean') return result;
    const name = field.name.toLocaleLowerCase() as keyof PiRecordedRawQuality;
    result[name] = value;
    return result;
  }, {});
  return Object.keys(quality).length > 0 ? quality : undefined;
}

function getTrendResponseError(response: DataQueryResponse, refId: string): Error {
  if (response.error?.refId && response.error.refId !== refId) {
    return new Error(`Resposta histórica ausente para o target ${refId}`);
  }
  return new Error(response.error?.message ?? 'PI Point sem histórico numérico');
}

function isHistoricalTrendTimeout(error: Error): boolean {
  return error.message.startsWith('Consulta histórica excedeu o tempo limite para ');
}

function markTrendErrors(
  results: Record<string, PiTrendSeriesResult>,
  bindings: readonly PiPointBinding[],
  error: Error,
): void {
  for (const binding of bindings) {
    results[getBindingKey(binding)] = { status: 'error', error };
  }
}

function getFieldValues(field: DataFrame['fields'][number]): unknown[] {
  const values = field.values as unknown as { get?: (index: number) => unknown; toArray?: () => unknown[]; length?: number } | unknown[];
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
    const len = typeof values.length === 'number' ? values.length : undefined;
    if (len !== undefined) {
      for (let index = 0; index < len; index += 1) {
        output.push(values.get(index));
      }
      return output;
    }
    for (let index = 0; ; index += 1) {
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

/**
 * A mesma instância do datasource pode consultar mais de um PI Data Server.
 * Não misture serverPaths no mesmo request: alguns drivers rejeitam o lote
 * inteiro quando um dos servidores/targets falha, atrasando tags válidas de
 * outra origem.
 */
function groupBindingsByQuerySource(
  bindings: readonly PiPointBinding[],
): Map<string, PiPointBinding[]> {
  const groups = new Map<string, PiPointBinding[]>();
  for (const binding of bindings) {
    const key = `${binding.dataSourceUid}\u0000${binding.serverPath}`;
    const group = groups.get(key) ?? [];
    group.push(binding);
    groups.set(key, group);
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

function chunkBindings(bindings: readonly PiPointBinding[], maxTargets = DATA_QUERY_MAX_TARGETS): PiPointBinding[][] {
  const chunks: PiPointBinding[][] = [];
  for (let index = 0; index < bindings.length; index += maxTargets) {
    chunks.push(bindings.slice(index, index + maxTargets));
  }
  return chunks;
}

async function queryCurrentValues(
  instance: PiDataSourceApi,
  bindings: readonly PiPointBinding[],
  now: number,
  deadline: number,
): Promise<DataQueryResponse> {
  const remainingMs = Math.max(1, deadline - Date.now());
  return withTimeout(
    resolveQueryResponse(instance.query(buildCurrentValuesRequest(bindings, now))),
    remainingMs,
    'Consulta de valores atuais excedeu o tempo limite',
  );
}

function isCurrentValueTimeout(error: unknown): boolean {
  return error instanceof Error && (error.message.includes('Consulta de valores atuais excedeu') || error.message.includes('tempo limite'));
}

function markCurrentValueErrors(
  results: Record<string, PiPointValueResult>,
  bindings: readonly PiPointBinding[],
  error: Error,
): void {
  for (const binding of bindings) {
    results[getBindingKey(binding)] = { status: 'error', error };
  }
}

async function runQueryTasks(
  tasks: ReadonlyArray<() => Promise<void>>,
  maxConcurrent = DATA_QUERY_MAX_CONCURRENT_BATCHES,
): Promise<void> {
  let nextTask = 0;
  const workers = Array.from(
    { length: Math.min(maxConcurrent, tasks.length) },
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

function createAsyncLimiter(maxConcurrent: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function runLimited<T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active -= 1;
      }
    }
  };
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
    if (!binding.dataSourceUid || !binding.pointName) {
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
  const values = field.values as unknown as { get?: (index: number) => unknown; toArray?: () => unknown[]; length?: number } | unknown[];
  if (Array.isArray(values)) {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] !== null && values[i] !== undefined) return values[i];
    }
    return values[0];
  }
  if (typeof values.toArray === 'function') {
    const arr = values.toArray();
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i];
    }
    return arr[0];
  }
  if (typeof values.get === 'function') {
    const len = typeof values.length === 'number' ? values.length : 1000;
    for (let i = len - 1; i >= 0; i--) {
      const val = values.get(i);
      if (val !== null && val !== undefined) return val;
    }
    return values.get(0);
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

function getMetricField(value: MetricFindValue | undefined, field: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const fieldValue = (value as MetricFindValue & Record<string, unknown>)[field];
  return typeof fieldValue === 'string' && fieldValue.length > 0 ? fieldValue : undefined;
}

function getMetricNumber(value: MetricFindValue | undefined, field: string): number | undefined {
  if (!value) return undefined;
  const candidate = (value as MetricFindValue & Record<string, unknown>)[field];
  const number = typeof candidate === 'number' ? candidate : typeof candidate === 'string' ? Number(candidate) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function getResourceNumber(value: unknown, field: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  const number = typeof candidate === 'number' ? candidate : typeof candidate === 'string' ? Number(candidate) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

/** Accept only the numeric PI PointID; WebId/GUID values are not PointIDs. */
function getMetadataPointId(value: Record<string, unknown>): number | undefined {
  const raw = getMetadataScalar(value, 'PointID', 'Id');
  const pointId = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  return Number.isSafeInteger(pointId) && pointId >= 0 ? pointId : undefined;
}

function getMetadataString(value: Record<string, unknown>, ...fields: string[]): string | undefined {
  for (const field of fields) {
    const exact = getUnknownString(value[field]);
    if (exact) return exact;
    const actualField = Object.keys(value).find((key) => key.toLocaleLowerCase() === field.toLocaleLowerCase());
    const candidate = actualField ? getUnknownString(value[actualField]) : undefined;
    if (candidate) return candidate;
  }
  return undefined;
}

function getMetadataNumber(value: Record<string, unknown>, ...fields: string[]): number | undefined {
  for (const field of fields) {
    const exact = getResourceNumber(value, field);
    if (exact !== undefined) return exact;
    const actualField = Object.keys(value).find((key) => key.toLocaleLowerCase() === field.toLocaleLowerCase());
    const candidate = actualField ? getResourceNumber(value, actualField) : undefined;
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function getMetadataBoolean(value: Record<string, unknown>, ...fields: string[]): boolean | undefined {
  for (const field of fields) {
    const actualField = Object.keys(value).find((key) => key.toLocaleLowerCase() === field.toLocaleLowerCase());
    if (!actualField) continue;
    const candidate = value[actualField];
    if (typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'string' && /^(true|false)$/i.test(candidate.trim())) return candidate.trim().toLocaleLowerCase() === 'true';
  }
  return undefined;
}

function getMetadataScalar(value: Record<string, unknown>, ...fields: string[]): number | string | undefined {
  for (const field of fields) {
    const actualField = Object.keys(value).find((key) => key.toLocaleLowerCase() === field.toLocaleLowerCase());
    const raw = actualField ? value[actualField] : undefined;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      const numeric = Number(raw);
      return Number.isFinite(numeric) && raw.trim() !== '' ? numeric : raw.trim();
    }
  }
  return undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function toPiDataSourceIdentity(dataSource: DataSourceInstanceSettings): PiDataSourceIdentity {
  return {
    uid: dataSource.uid,
    name: dataSource.name,
    type: dataSource.type,
  };
}

export type PiDataSourceApi = Pick<DataSourceApi, 'uid' | 'type' | 'testDatasource' | 'metricFindQuery' | 'query'>;

interface PiDataSourceResourceApi extends PiDataSourceApi {
  getResource(path: string): Promise<unknown>;
}

/**
 * Reads a PI Web API resource through the already configured GPA datasource.
 * Credentials and transport remain owned by Grafana/the datasource plugin.
 */
export async function getPiResource<T = unknown>(
  datasourceUid: string,
  path: string,
  dataSourceSrv: Pick<DataSourceSrv, 'get'> = getDataSourceSrv(),
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new Error('O recurso PI deve ser um caminho relativo.');
  }
  const instance = await getResolvedPiDataSource(dataSourceSrv, {
    uid: datasourceUid,
    name: '',
    type: PI_DATASOURCE_TYPE,
  });
  const resourceApi = instance as PiDataSourceResourceApi;
  if (typeof resourceApi.getResource !== 'function') {
    throw new Error('A Data Source GPA não expõe recursos PI Web API.');
  }
  return resourceApi.getResource(path) as Promise<T>;
}
