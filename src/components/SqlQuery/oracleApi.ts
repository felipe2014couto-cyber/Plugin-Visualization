export const SIP_CONNECTION_PROFILE = 'sip';
export const SIP_DEFAULT_MAX_ROWS = 200;
export const SIP_HARD_MAX_ROWS = 2000;

export interface OracleConnectParams {
  connectionProfile?: typeof SIP_CONNECTION_PROFILE;
  username: string;
  password?: string;
}

export interface OracleSession {
  connected: true;
  request_id?: string;
}

export interface OracleQueryParams {
  sql: string;
  max_rows?: number;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface OracleQueryResponse {
  rows: Array<Record<string, unknown>>;
  row_count: number;
  max_rows: number;
  truncated?: boolean;
  request_id?: string;
}

interface SipErrorEnvelope {
  detail?: string | { code?: string; request_id?: string };
  code?: string;
  request_id?: string;
}

declare global {
  interface Window {
    __PIMS_SIP_API_BASE_URL__?: string;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  SIP_AUTH_FAILED: 'Usuário ou senha inválidos.',
  SIP_SESSION_EXPIRED: 'A sessão SIP expirou. Conecte-se novamente.',
  SIP_QUERY_REJECTED: 'A consulta foi rejeitada pela política de leitura do SIP.',
  SIP_QUERY_TIMEOUT: 'A consulta excedeu o tempo máximo permitido.',
  SIP_QUERY_LIMIT: 'O limite de consultas ou resultados foi atingido.',
  SIP_DATABASE_UNAVAILABLE: 'O serviço SIP está indisponível no momento.',
  SIP_INVALID_PARAMETERS: 'Os parâmetros informados são inválidos.',
  SIP_RATE_LIMIT: 'Muitas solicitações. Aguarde e tente novamente.',
  SIP_ORIGIN_REJECTED: 'A origem desta solicitação não é permitida.',
};

export class OracleApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly requestId?: string, public readonly status?: number) {
    super(message);
    this.name = 'OracleApiError';
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__PIMS_SIP_API_BASE_URL__) {
    return window.__PIMS_SIP_API_BASE_URL__.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname;
    if (process.env.NODE_ENV === 'development' || hostname === 'localhost' || hostname === '127.0.0.1' || /^10\.|^192\.168\.|^172\./.test(hostname)) {
      return `${window.location.protocol}//${hostname}:8085`;
    }
  }
  return '/api/sip';
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function assertJsonResponse(response: Response): void {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new OracleApiError('Resposta inválida recebida do serviço SIP.', 'SIP_INVALID_RESPONSE', undefined, response.status);
  }
}

async function parseError(response: Response): Promise<OracleApiError> {
  let envelope: SipErrorEnvelope | undefined;
  if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    envelope = await response.json().catch(() => undefined) as SipErrorEnvelope | undefined;
  }
  const detail = envelope?.detail;
  const code = (typeof detail === 'object' ? detail?.code : envelope?.code) || (response.status === 401 ? 'SIP_SESSION_EXPIRED' : 'SIP_REQUEST_FAILED');
  const requestId = (typeof detail === 'object' ? detail?.request_id : envelope?.request_id) || response.headers.get('x-request-id') || undefined;
  const support = requestId ? ` Código de suporte: ${requestId}` : '';
  return new OracleApiError(`${ERROR_MESSAGES[code] || 'A operação SIP não pôde ser concluída.'}${support}`, code, requestId, response.status);
}

async function sipFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    if (!response.ok) {
      throw await parseError(response);
    }
    assertJsonResponse(response);
    return response;
  } catch (error) {
    if (error instanceof OracleApiError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new OracleApiError('A operação SIP excedeu o tempo limite.', 'SIP_REQUEST_TIMEOUT');
    }
    throw new OracleApiError('Não foi possível comunicar com o serviço SIP.', 'SIP_NETWORK_ERROR');
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export async function createOracleSession(params: OracleConnectParams, signal?: AbortSignal): Promise<OracleSession> {
  const response = await sipFetch('/connect', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      connectionProfile: SIP_CONNECTION_PROFILE,
      username: params.username,
      password: params.password || '',
    }),
  }, 15_000);
  const data = await response.json() as Partial<OracleSession>;
  if (data.connected !== true) {
    throw new OracleApiError('Resposta inválida recebida do serviço SIP.', 'SIP_INVALID_RESPONSE');
  }
  return data as OracleSession;
}

export async function closeOracleSession(signal?: AbortSignal): Promise<void> {
  await sipFetch('/disconnect', { method: 'POST', signal, body: '{}' }, 8_000).catch(() => {
    // Best-effort cleanup; the server also expires abandoned sessions.
  });
}

export async function runOracleQuery(params: OracleQueryParams): Promise<OracleQueryResponse> {
  const requestedRows = Number(params.max_rows ?? SIP_DEFAULT_MAX_ROWS);
  const maxRows = Number.isFinite(requestedRows)
    ? Math.min(SIP_HARD_MAX_ROWS, Math.max(1, Math.trunc(requestedRows)))
    : SIP_DEFAULT_MAX_ROWS;
  const response = await sipFetch('/query', {
    method: 'POST',
    signal: params.signal,
    body: JSON.stringify({ sql: params.sql, max_rows: maxRows, params: params.params || {} }),
  }, 35_000);
  const data = await response.json() as Partial<OracleQueryResponse>;
  if (!Array.isArray(data.rows) || !finiteNonNegative(data.row_count) || !finiteNonNegative(data.max_rows)) {
    throw new OracleApiError('Resposta inválida recebida do serviço SIP.', 'SIP_INVALID_RESPONSE');
  }
  if (data.rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new OracleApiError('Resposta inválida recebida do serviço SIP.', 'SIP_INVALID_RESPONSE');
  }
  return data as OracleQueryResponse;
}
