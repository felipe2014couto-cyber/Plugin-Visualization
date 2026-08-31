import { closeOracleSession, createOracleSession, getApiBaseUrl, runOracleQuery } from './oracleApi';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'request-123' }),
    json: async () => body,
  } as Response;
}

describe('oracleApi security contract', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('uses the same-origin production endpoint or local fallback without exposing Oracle topology', () => {
    window.__PIMS_SIP_API_BASE_URL__ = '/api/sip';
    expect(getApiBaseUrl()).toBe('/api/sip');
    delete window.__PIMS_SIP_API_BASE_URL__;
  });

  it('connects by registered profile and never sends a DSN', async () => {
    window.__PIMS_SIP_API_BASE_URL__ = '/api/sip';
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ connected: true }));
    await createOracleSession({ username: 'TEST_USER', password: 'TEST_PASSWORD' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/sip/connect');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ connectionProfile: 'sip', username: 'TEST_USER', password: 'TEST_PASSWORD' });
    expect(init.body).not.toContain('dsn');
    delete window.__PIMS_SIP_API_BASE_URL__;
  });

  it('does not place a session token in query or disconnect URLs', async () => {
    window.__PIMS_SIP_API_BASE_URL__ = '/api/sip';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ rows: [], row_count: 0, max_rows: 200 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
    await runOracleQuery({ sql: 'SELECT 1 FROM DUAL', max_rows: 999999 });
    await closeOracleSession();
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/sip/query');
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/sip/disconnect');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      sql: 'SELECT 1 FROM DUAL', max_rows: 2000, params: {},
    });
    delete window.__PIMS_SIP_API_BASE_URL__;
  });

  it('rejects malformed query responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ rows: 'not-an-array', row_count: -1, max_rows: 200 }));
    await expect(runOracleQuery({ sql: 'SELECT 1 FROM DUAL' })).rejects.toMatchObject({ code: 'SIP_INVALID_RESPONSE' });
  });
});
