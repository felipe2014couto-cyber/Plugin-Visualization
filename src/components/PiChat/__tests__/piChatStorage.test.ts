import { loadChatHistory, saveChatHistory, clearChatHistory, PICHAT_STORAGE_KEY } from '../piChatStorage';
import { PiChatMessage } from '../types';

describe('piChatStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('deve retornar array vazio quando o sessionStorage estiver limpo', () => {
    const history = loadChatHistory();
    expect(history).toEqual([]);
  });

  it('deve salvar e carregar histórico de mensagens corretamente', () => {
    const mockMessages: PiChatMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Qual o valor da tag SINUSOID?',
        timestamp: '10:00',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'O valor atual é 52.4 °C',
        timestamp: '10:01',
        tags_consultadas: ['SINUSOID'],
      },
    ];

    saveChatHistory(mockMessages);

    const loaded = loadChatHistory();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].content).toBe('Qual o valor da tag SINUSOID?');
    expect(loaded[1].tags_consultadas).toEqual(['SINUSOID']);
  });

  it('deve tratar dados corrompidos no sessionStorage sem lançar exceção', () => {
    window.sessionStorage.setItem(PICHAT_STORAGE_KEY, '{"invalido": true}');
    const loaded = loadChatHistory();
    expect(loaded).toEqual([]);
  });

  it('deve salvar e carregar mensagens com metadados de anexo corretamente', () => {
    const mockMessages: PiChatMessage[] = [
      {
        id: 'msg-img-1',
        role: 'user',
        content: 'Analise esta imagem',
        timestamp: '10:05',
        attachment: {
          fileName: 'grafico_pims.png',
          mimeType: 'image/png',
        },
      },
    ];

    saveChatHistory(mockMessages);

    const loaded = loadChatHistory();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].attachment).toBeDefined();
    expect(loaded[0].attachment?.fileName).toBe('grafico_pims.png');
    expect(loaded[0].attachment?.mimeType).toBe('image/png');
  });

  it('deve limpar o histórico com clearChatHistory', () => {
    saveChatHistory([
      {
        id: 'msg-1',
        role: 'user',
        content: 'teste',
        timestamp: '10:00',
      },
    ]);
    expect(loadChatHistory()).toHaveLength(1);

    clearChatHistory();
    expect(loadChatHistory()).toEqual([]);
  });

  it('sanitiza erro técnico legado antes de carregar e salvar no sessionStorage', () => {
    saveChatHistory([{
      id: 'msg-error',
      role: 'assistant',
      content: 'Não foi possível conectar em http://10.247.140.156:8002/chat: password invalid',
      timestamp: '10:10',
      isError: true,
      errorCode: 'NETWORK_ERROR',
    }]);

    const loaded = loadChatHistory();
    expect(loaded[0].content).toBe('Não foi possível concluir sua solicitação. Tente novamente.');
    expect(loaded[0].content).not.toMatch(/10\.247|8002|http|password|\/chat/i);
    expect(window.sessionStorage.getItem(PICHAT_STORAGE_KEY)).not.toMatch(/10\.247|8002|password|\/chat/i);
  });
});
