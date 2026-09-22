import { getBackendSrv } from '@grafana/runtime';

import { PICHAT_RESOURCE_PATH, sendChatMessage } from '../piChatApi';

jest.mock('@grafana/runtime', () => ({ getBackendSrv: jest.fn() }));

describe('piChatApi', () => {
  const backendPost = jest.fn();

  beforeEach(() => {
    backendPost.mockReset();
    (getBackendSrv as jest.Mock).mockReturnValue({ post: backendPost });
  });

  it('usa somente o resource path do Grafana', async () => {
    backendPost.mockResolvedValueOnce({ ok: true, output: 'Resposta do bot', tags_consultadas: [] });
    const result = await sendChatMessage('olá', 'user-1');
    expect(result.output).toBe('Resposta do bot');
    expect(backendPost).toHaveBeenCalledWith(PICHAT_RESOURCE_PATH, { message: 'olá', user_id: 'user-1', images: [] }, { showErrorAlert: false, hideFromInspector: true });
    expect(PICHAT_RESOURCE_PATH).toBe('/api/plugins/pims-vision-app/resources/pichat/chat');
    expect(PICHAT_RESOURCE_PATH).not.toMatch(/localhost|:\d+|http/i);
  });

  it('envia imagens sem expor um destino configurável', async () => {
    const images = [{ image_base64: 'base64', mime_type: 'image/png', file_name: 'grafico.png' }];
    backendPost.mockResolvedValueOnce({ ok: true, output: 'Imagem processada', tags_consultadas: ['TAG_01'] });
    await sendChatMessage('Analise', 'user-1', images);
    expect(backendPost).toHaveBeenCalledWith(PICHAT_RESOURCE_PATH, { message: 'Analise', user_id: 'user-1', images }, expect.anything());
  });

  it.each([
    [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [429, 'RATE_LIMITED'], [500, 'SERVER_ERROR'], [503, 'SERVICE_UNAVAILABLE'], [504, 'SERVICE_UNAVAILABLE'],
  ])('sanitiza erro HTTP %s', async (status, code) => {
    backendPost.mockRejectedValueOnce({ status, data: { detail: 'database password 10.1.2.3' } });
    const result = await sendChatMessage('olá', 'user-1');
    expect(result.errorCode).toBe(code);
    expect(result.output).not.toMatch(/10\.1\.2\.3|password|database|http/i);
  });

  it('sanitiza falha de rede', async () => {
    backendPost.mockRejectedValueOnce(new Error('Failed to fetch http://10.1.2.3:8002/chat'));
    const result = await sendChatMessage('olá', 'user-1');
    expect(result.errorCode).toBe('NETWORK_ERROR');
    expect(result.output).not.toMatch(/10\.1\.2\.3|8002|http|failed to fetch|\/chat/i);
  });

  it('trata resposta inválida e erro do agente sem repassar detalhes', async () => {
    backendPost.mockResolvedValueOnce({ ok: false, answer_generation_error: 'Traceback password token' });
    const result = await sendChatMessage('olá', 'user-1');
    expect(result.errorCode).toBe('AGENT_ERROR');
    expect(result.output).not.toMatch(/Traceback|password|token/i);
    backendPost.mockResolvedValueOnce('invalid');
    expect((await sendChatMessage('olá', 'user-1')).errorCode).toBe('INVALID_RESPONSE');
  });
});
