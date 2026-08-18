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
}

export interface PiPointSearchResponse {
  results: PiPointSearchResult[];
  hasMore: boolean;
}

export const PI_POINT_SEARCH_MAX_RESULTS = 1000;
const PI_POINT_SEARCH_DEFAULT_LIMIT = PI_POINT_SEARCH_MAX_RESULTS;
const PI_POINT_METADATA_CONCURRENCY = 8;
const piPointMetadataCache = new Map<string, PiPointSearchResult>();

export interface PiPointValue {
  value: unknown;
  timestamp?: string;
  unit?: string;
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

  if (!request.term) {
    if (request.description) {
      throw new Error('A pesquisa por descrição não é suportada por esta versão do PI Web API.');
    }
    throw new Error('A pesquisa por metadados não é suportada por esta versão do PI Web API.');
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

function normalizePiPointSearchRequest(value: string | PiPointSearchRequest): Required<Pick<PiPointSearchRequest, 'term' | 'description' | 'pointTypes' | 'engineeringUnits' | 'pointSources' | 'limit'>> {
  const request = typeof value === 'string' ? { term: value } : value;
  return {
    term: request.term?.trim() ?? '',
    description: request.description?.trim() ?? '',
    pointTypes: normalizeSearchValues(request.pointTypes),
    engineeringUnits: normalizeSearchValues(request.engineeringUnits),
    pointSources: normalizeSearchValues(request.pointSources),
    limit: Math.min(PI_POINT_SEARCH_MAX_RESULTS, Math.max(1, request.limit ?? PI_POINT_SEARCH_DEFAULT_LIMIT)),
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
  let startIndex = 0;
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
    if (knownTotal !== undefined && startIndex >= knownTotal) break;
    // Protege contra adaptadores antigos que ignoram startIndex e repetem a página.
    if (added === 0) break;
  }

  let hasMore = knownTotal !== undefined && knownTotal > request.limit;
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
    criteria.push(`Tag:=${escapePiSearchValue(term)}`);
  }
  if (request.description) criteria.push(`Descriptor:=*${escapePiSearchValue(request.description)}*`);
  if (request.pointTypes.length) {
    criteria.push(`(${request.pointTypes.map((type) => `PointType:=${escapePiSearchValue(type)}`).join(' OR ')})`);
  }
  if (request.engineeringUnits.length) {
    criteria.push(`(${request.engineeringUnits.map((unit) => `EngineeringUnits:=${escapePiSearchValue(unit)}`).join(' OR ')})`);
  }
  if (request.pointSources.length) {
    criteria.push(`(${request.pointSources.map((source) => `PointSource:=${escapePiSearchValue(source)}`).join(' OR ')})`);
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
        piPointMetadataCache.set(cacheKey, metadata);
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
  const total = typeof fields.TotalCount === 'number'
    ? fields.TotalCount
    : typeof fields.Total === 'number' ? fields.Total : undefined;
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
    && matchesAny(result.engineeringUnit, request.engineeringUnits)
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
  return !expected || Boolean(value && value.toLocaleLowerCase().includes(expected.toLocaleLowerCase()));
}

function matchesAny(value: string | undefined, expected: string[]): boolean {
  return expected.length === 0 || Boolean(value && expected.some((item) => item.localeCompare(value, undefined, { sensitivity: 'accent' }) === 0));
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

        const response = await withTimeout(
          resolveQueryResponse(instance.query(buildHistoricalTrendRequest(batch, range, mode, options))),
          8_000,
          `Consulta histórica excedeu o tempo limite para ${batch.map(({ pointName }) => pointName).join(', ')}`,
        );
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
