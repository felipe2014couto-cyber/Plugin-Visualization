export interface OracleConnectParams {
  dsn: string;
  username: string;
  password?: string;
}

export interface OracleSession {
  session_id: string;
}

export interface OracleQueryParams {
  session_id: string;
  sql: string;
  max_rows?: number;
  params?: Record<string, any>;
}

export interface OracleQueryResponse {
  rows: Array<Record<string, any>>;
  row_count: number;
  max_rows: number;
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8085`;
  }
  return 'http://localhost:8085';
}

const API_BASE_URL = getApiBaseUrl();

export async function createOracleSession(params: OracleConnectParams): Promise<OracleSession> {
  const response = await fetch(`${API_BASE_URL}/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dsn: params.dsn,
      username: params.username,
      password: params.password || '',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Erro na conexão: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function closeOracleSession(session_id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/disconnect?session_id=${encodeURIComponent(session_id)}`, {
    method: 'POST',
  }).catch(() => {
    // Ignore errors on disconnect, since it's just cleanup
  });
}

export async function runOracleQuery(params: OracleQueryParams): Promise<OracleQueryResponse> {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Erro na consulta: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
