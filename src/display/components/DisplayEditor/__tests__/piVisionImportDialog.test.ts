import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { getDataSourceSrv } from '@grafana/runtime';
import { fetchPiVisionDisplay, parsePiVisionUrl, PiVisionImportDialog } from '../PiVisionImportDialog';

jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: jest.fn(),
}));

function mockResponse(options: {
  ok: boolean;
  status: number;
  json?: unknown;
  contentType?: string;
}): Response {
  return {
    ok: options.ok,
    status: options.status,
    headers: {
      get: jest.fn().mockReturnValue(options.contentType ?? 'application/json'),
    },
    json: jest.fn().mockResolvedValue(options.json),
  } as unknown as Response;
}

describe('parsePiVisionUrl', () => {
  it('parseia URL padrao do PI Vision', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/48494/RB3-FORNO---GABRIEL');
    expect(result).not.toBeUndefined();
    expect(result!.displayId).toBe('48494');
    expect(result!.baseUrl).toBe('http://pimsweb/PIVision');
  });

  it('parseia URL com HTTPS', () => {
    const result = parsePiVisionUrl('https://pimsweb/PIVision/#/Displays/12345/Minha-Tela');
    expect(result!.displayId).toBe('12345');
    expect(result!.baseUrl).toBe('https://pimsweb/PIVision');
  });

  it('parseia URL sem nome da tela', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/99');
    expect(result!.displayId).toBe('99');
  });

  it('parseia URL com porta', () => {
    const result = parsePiVisionUrl('http://pimsweb:8080/PIVision/#/Displays/1001/Tela');
    expect(result!.displayId).toBe('1001');
    expect(result!.baseUrl).toBe('http://pimsweb:8080/PIVision');
  });

  it('remove trailing slash da baseUrl', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/500/Tela');
    expect(result!.baseUrl).not.toMatch(/\/$/);
  });

  it('retorna undefined para URL sem hash de display', () => {
    expect(parsePiVisionUrl('http://pimsweb/PIVision/')).toBeUndefined();
  });

  it('retorna undefined para string vazia', () => {
    expect(parsePiVisionUrl('')).toBeUndefined();
  });

  it('retorna undefined para URL sem ID numerico', () => {
    expect(parsePiVisionUrl('http://pimsweb/PIVision/#/Displays/abc/Tela')).toBeUndefined();
  });

  it('nao e case-sensitive no segmento Displays', () => {
    const result = parsePiVisionUrl('http://pimsweb/PIVision/#/displays/77/Tela');
    expect(result!.displayId).toBe('77');
  });
});

describe('fetchPiVisionDisplay', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('usa o proxy passando somente o ID do display', async () => {
    const display = { Id: 48494, Name: 'Forno', Symbols: [] };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, json: { status: 'ok' } }))
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, json: display }));
    global.fetch = fetchMock;

    await expect(fetchPiVisionDisplay('http://pimsweb/PIVision', '48494')).resolves.toEqual(display);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/pivision\?displayId=48494$/);
    expect(fetchMock.mock.calls[1][0]).not.toContain('pimsweb');
  });

  it('continua tentando rotas de leitura depois de 401 e 403 no acesso direto', async () => {
    const display = { Id: 77, Name: 'Display', Symbols: [] };
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 401 }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 403 }))
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, json: display }));
    global.fetch = fetchMock;

    await expect(fetchPiVisionDisplay('http://pimsweb/PIVision', '77')).resolves.toEqual(display);

    expect(fetchMock.mock.calls[1][0]).toBe('http://pimsweb/PIVision/api/displays/77');
    expect(fetchMock.mock.calls[2][0]).toContain('DisplayService.svc');
    expect(fetchMock.mock.calls[3][0]).toBe('http://pimsweb/PIVision/api/v1/displays/77');
  });

  it('mostra o diagnostico devolvido pelo proxy', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, json: { status: 'ok' } }))
      .mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 401,
        json: { details: 'Configure PI_VISION_DOMAIN.' },
      }))
      .mockRejectedValue(new TypeError('Failed to fetch'));
    global.fetch = fetchMock;

    await expect(fetchPiVisionDisplay('http://pimsweb/PIVision', '99'))
      .rejects.toThrow('Configure PI_VISION_DOMAIN.');
  });
});

describe('PiVisionImportDialog datasource', () => {
  it('preenche automaticamente o UID do datasource PI padrao', async () => {
    (getDataSourceSrv as jest.Mock).mockReturnValue({
      getList: jest.fn().mockReturnValue([
        {
          uid: 'pi-automatico',
          name: 'PI Principal',
          type: 'gridprotectionalliance-osisoftpi-datasource',
          isDefault: true,
        },
      ]),
    });

    render(React.createElement(PiVisionImportDialog, { onImport: jest.fn(), onClose: jest.fn() }));

    await waitFor(() => {
      expect(screen.getByTestId('pi-vision-import-ds-uid')).toHaveValue('pi-automatico');
    });
    expect(screen.getByText('Detectado automaticamente: PI Principal.')).toBeInTheDocument();
  });
});
