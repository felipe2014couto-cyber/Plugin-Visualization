import { getPiChatApiBaseUrl, sendChatMessage } from '../piChatApi';

describe('piChatApi', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as any).__PIMS_PICHAT_API_BASE_URL__;
    delete (window as any).PIMS_PICHAT_API_BASE_URL;
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('deve priorizar window.__PIMS_PICHAT_API_BASE_URL__ quando definido', () => {
    (window as any).__PIMS_PICHAT_API_BASE_URL__ = 'http://custom-host:8015/';
    expect(getPiChatApiBaseUrl()).toBe('http://custom-host:8015');
  });

  it('deve resolver dinamicamente pelo hostname do Grafana', () => {
    delete (window as any).__PIMS_PICHAT_API_BASE_URL__;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        protocol: 'http:',
        hostname: 'grafana-server',
      },
    });

    expect(getPiChatApiBaseUrl()).toBe('http://grafana-server:8002');
  });

  it('deve resolver corretamente para localhost', () => {
    delete (window as any).__PIMS_PICHAT_API_BASE_URL__;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        protocol: 'http:',
        hostname: 'localhost',
      },
    });

    expect(getPiChatApiBaseUrl()).toBe('http://localhost:8002');
  });

  it('deve enviar requisição com sucesso utilizando o endpoint resolvido', async () => {
    (window as any).__PIMS_PICHAT_API_BASE_URL__ = 'http://custom-host:8015';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        output: 'Resposta do bot',
        tags_consultadas: [],
      }),
    });

    const result = await sendChatMessage('olá', 'user-1');
    expect(result.ok).toBe(true);
    expect(result.output).toBe('Resposta do bot');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://custom-host:8015/chat',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          message: 'olá',
          user_id: 'user-1',
          images: [],
        }),
      })
    );
  });

  it('deve enviar payload multimodal contendo array de imagens', async () => {
    (window as any).__PIMS_PICHAT_API_BASE_URL__ = 'http://custom-host:8015';

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        output: 'Imagem processada pelo OCR',
        tags_consultadas: ['TAG_01'],
      }),
    });

    const mockImages = [
      {
        image_base64: 'base64-fake-string',
        mime_type: 'image/png',
        file_name: 'grafico.png',
      },
    ];

    const result = await sendChatMessage('Analise este gráfico', 'user-1', mockImages);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('Imagem processada pelo OCR');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://custom-host:8015/chat',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          message: 'Analise este gráfico',
          user_id: 'user-1',
          images: mockImages,
        }),
      })
    );
  });
});
