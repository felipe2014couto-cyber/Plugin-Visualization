import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PiChatPopover } from '../PiChatPopover';
import { sendChatMessage } from '../piChatApi';

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// Mock URL methods for jsdom
if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-preview');
}
if (typeof window.URL.revokeObjectURL === 'undefined') {
  window.URL.revokeObjectURL = jest.fn();
}

jest.mock('../piChatApi', () => ({
  sendChatMessage: jest.fn(),
  getPiChatApiBaseUrl: jest.fn(() => 'http://localhost:8002'),
}));

describe('PiChatPopover', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    jest.clearAllMocks();
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-preview');
    window.URL.revokeObjectURL = jest.fn();
  });


  it('não deve renderizar nada quando open for false', () => {
    const { container } = render(<PiChatPopover open={false} onClose={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('deve renderizar o popover com card de boas-vindas quando aberto e vazio', () => {
    render(<PiChatPopover open={true} onClose={jest.fn()} />);
    expect(screen.getByTestId('pichat-popover')).toBeInTheDocument();
    expect(screen.getByTestId('pichat-welcome-card')).toBeInTheDocument();
    expect(screen.getByText('PiChat')).toBeInTheDocument();
    expect(screen.getByText('PIMS Agent Bot')).toBeInTheDocument();
  });

  it('deve chamar onClose ao clicar no botão de fechar X', () => {
    const handleClose = jest.fn();
    render(<PiChatPopover open={true} onClose={handleClose} />);

    const closeBtn = screen.getByTestId('pichat-close-button');
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('deve enviar mensagem do usuário e renderizar resposta do agente', async () => {
    const mockedSendChatMessage = sendChatMessage as jest.MockedFunction<typeof sendChatMessage>;
    mockedSendChatMessage.mockResolvedValueOnce({
      ok: true,
      user_id: 'test_user',
      output: 'A temperatura da tag **TIC_101** é 75.3 °C',
      tags_consultadas: ['TIC_101'],
    });

    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const input = screen.getByTestId('pichat-input-field');
    const sendButton = screen.getByTestId('pichat-send-button');

    fireEvent.change(input, { target: { value: 'Qual o valor da tag TIC_101?' } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    // Mensagem do usuário deve aparecer imediatamente
    expect(screen.getByText('Qual o valor da tag TIC_101?')).toBeInTheDocument();

    // Aguarda a resposta do agente com o texto da medição e as tags
    await waitFor(() => {
      expect(screen.getByText(/75\.3 °C/)).toBeInTheDocument();
      expect(screen.getAllByText('TIC_101')).toHaveLength(2);
    });

    expect(mockedSendChatMessage).toHaveBeenCalledWith(
      'Qual o valor da tag TIC_101?',
      expect.any(String)
    );
  });

  it('deve preservar mensagens e cabecalho durante re-renderizacao (troca de tema)', async () => {
    const mockedSendChatMessage = sendChatMessage as jest.MockedFunction<typeof sendChatMessage>;
    mockedSendChatMessage.mockResolvedValueOnce({
      ok: true,
      user_id: 'test_user',
      output: 'Resposta preservada',
      tags_consultadas: [],
    });

    const handleClose = jest.fn();
    const { rerender } = render(<PiChatPopover open={true} onClose={handleClose} />);

    const input = screen.getByTestId('pichat-input-field');
    const sendButton = screen.getByTestId('pichat-send-button');

    fireEvent.change(input, { target: { value: 'Mensagem original' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Resposta preservada')).toBeInTheDocument();
    });

    // Digita rascunho parcial
    fireEvent.change(screen.getByTestId('pichat-input-field'), {
      target: { value: 'Rascunho parcial' },
    });

    // Re-renderiza (simula re-render causado por troca de tema no pai)
    rerender(<PiChatPopover open={true} onClose={handleClose} />);

    // Cabecalho preservado
    expect(screen.getByText('PiChat')).toBeInTheDocument();
    expect(screen.getByText('PIMS Agent Bot')).toBeInTheDocument();

    // Mensagens preservadas
    expect(screen.getByText('Mensagem original')).toBeInTheDocument();
    expect(screen.getByText('Resposta preservada')).toBeInTheDocument();

    // Rascunho preservado
    expect(screen.getByTestId('pichat-input-field')).toHaveValue('Rascunho parcial');

    // Nenhuma chamada adicional a API
    expect(mockedSendChatMessage).toHaveBeenCalledTimes(1);

    // Botao de fechar continua funcional
    fireEvent.click(screen.getByTestId('pichat-close-button'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('deve renderizar o botao de anexo e permitir selecao e remocao de imagem', async () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-preview');
    window.URL.revokeObjectURL = jest.fn();

    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    // Botao de anexo visivel
    const attachBtn = screen.getByTestId('pichat-attach-button');
    expect(attachBtn).toBeInTheDocument();

    const fileInput = screen.getByTestId('pichat-file-input');
    const mockFile = new File(['mock-bytes'], 'diagrama.png', { type: 'image/png' });

    // Simula selecao de arquivo
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    // Preview deve aparecer
    expect(screen.getByTestId('pichat-image-preview')).toBeInTheDocument();
    expect(screen.getByText('diagrama.png')).toBeInTheDocument();

    // Botao de envio habilitado mesmo sem texto
    const sendButton = screen.getByTestId('pichat-send-button');
    expect(sendButton).not.toBeDisabled();

    // Clica para remover anexo
    const removeBtn = screen.getByTestId('pichat-remove-image-button');
    fireEvent.click(removeBtn);

    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-preview');
    expect(screen.queryByTestId('pichat-image-preview')).not.toBeInTheDocument();

    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('deve enviar mensagem acompanhada de anexo de imagem', async () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-preview');
    window.URL.revokeObjectURL = jest.fn();

    const mockedSendChatMessage = sendChatMessage as jest.MockedFunction<typeof sendChatMessage>;
    mockedSendChatMessage.mockResolvedValueOnce({
      ok: true,
      user_id: 'test_user',
      output: 'Imagem analisada com sucesso pelo OCR.',
      tags_consultadas: [],
    });

    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const fileInput = screen.getByTestId('pichat-file-input');
    const mockFile = new File(['fake-img-content'], 'esquema.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    const input = screen.getByTestId('pichat-input-field');
    fireEvent.change(input, { target: { value: 'O que está nesta imagem?' } });

    const sendButton = screen.getByTestId('pichat-send-button');
    fireEvent.click(sendButton);

    // Mensagem e badge de anexo aparecem no chat
    await waitFor(() => {
      expect(screen.getByText('O que está nesta imagem?')).toBeInTheDocument();
      expect(screen.getByTestId('pichat-message-attachment')).toBeInTheDocument();
      expect(screen.getByText('esquema.png')).toBeInTheDocument();
    });

    // Aguarda resposta do assistente
    await waitFor(() => {
      expect(screen.getByText('Imagem analisada com sucesso pelo OCR.')).toBeInTheDocument();
    });

    expect(mockedSendChatMessage).toHaveBeenCalledWith(
      'O que está nesta imagem?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          mime_type: 'image/png',
          file_name: 'esquema.png',
        }),
      ])
    );

    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('deve anexar imagem colada via Ctrl+V (paste) e permitir envio multimodal', async () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-pasted-preview');
    window.URL.revokeObjectURL = jest.fn();

    const mockedSendChatMessage = sendChatMessage as jest.MockedFunction<typeof sendChatMessage>;
    mockedSendChatMessage.mockResolvedValueOnce({
      ok: true,
      user_id: 'test_user',
      output: 'Screenshot analisado.',
      tags_consultadas: [],
    });

    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const input = screen.getByTestId('pichat-input-field');
    const pastedFile = new File(['screenshot-bytes'], 'image.png', { type: 'image/png' });

    // Simula evento de paste com imagem
    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => pastedFile,
          },
        ],
      },
    });

    // Preview deve aparecer com nome normalizado
    expect(screen.getByTestId('pichat-image-preview')).toBeInTheDocument();
    expect(screen.getByText(/clipboard-image-\d{8}-\d{6}\.png/)).toBeInTheDocument();

    // Digita texto adicional e envia
    fireEvent.change(input, { target: { value: 'Analise este print' } });
    const sendButton = screen.getByTestId('pichat-send-button');
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Analise este print')).toBeInTheDocument();
      expect(screen.getByTestId('pichat-message-attachment')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Screenshot analisado.')).toBeInTheDocument();
    });

    expect(mockedSendChatMessage).toHaveBeenCalledWith(
      'Analise este print',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          mime_type: 'image/png',
        }),
      ])
    );

    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('não deve criar anexo ao colar texto comum via paste', () => {
    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const input = screen.getByTestId('pichat-input-field');

    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      },
    });

    expect(screen.queryByTestId('pichat-image-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pichat-validation-error')).not.toBeInTheDocument();
  });

  it('deve exibir erro de validação ao colar imagem com formato não suportado (ex: image/gif)', () => {
    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const input = screen.getByTestId('pichat-input-field');
    const gifFile = new File(['gif-bytes'], 'anim.gif', { type: 'image/gif' });

    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: 'image/gif',
            getAsFile: () => gifFile,
          },
        ],
      },
    });

    expect(screen.getByTestId('pichat-validation-error')).toBeInTheDocument();
    expect(screen.getByText(/Formato de imagem não suportado/)).toBeInTheDocument();
    expect(screen.queryByTestId('pichat-image-preview')).not.toBeInTheDocument();
  });

  it('deve exibir erro ao colar imagem maior que 5 MB', () => {
    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const input = screen.getByTestId('pichat-input-field');
    const hugeFile = new File(['huge-bytes'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(hugeFile, 'size', { value: 6 * 1024 * 1024 }); // 6 MB

    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => hugeFile,
          },
        ],
      },
    });

    expect(screen.getByTestId('pichat-validation-error')).toBeInTheDocument();
    expect(screen.getByText(/excede o limite máximo permitido de 5 MB/)).toBeInTheDocument();
    expect(screen.queryByTestId('pichat-image-preview')).not.toBeInTheDocument();
  });

  it('deve substituir anexo anterior e revogar URL ao colar nova imagem', () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = jest
      .fn()
      .mockReturnValueOnce('blob:http://localhost/preview-1')
      .mockReturnValueOnce('blob:http://localhost/preview-2');
    window.URL.revokeObjectURL = jest.fn();

    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    // 1. Seleciona primeira imagem pelo file input
    const fileInput = screen.getByTestId('pichat-file-input');
    const file1 = new File(['file1'], 'primeira.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file1] } });

    expect(screen.getByText('primeira.png')).toBeInTheDocument();

    // 2. Cola segunda imagem via Ctrl+V
    const input = screen.getByTestId('pichat-input-field');
    const file2 = new File(['file2'], 'segunda.jpg', { type: 'image/jpeg' });
    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: 'image/jpeg',
            getAsFile: () => file2,
          },
        ],
      },
    });

    // Deve revogar a primeira URL
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/preview-1');
    // Deve exibir o novo anexo
    expect(screen.getByText('segunda.jpg')).toBeInTheDocument();
    expect(screen.queryByText('primeira.png')).not.toBeInTheDocument();

    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('deve renderizar o botao de minimizar com atributos de acessibilidade corretos', () => {
    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const minimizeBtn = screen.getByTestId('pichat-minimize-button');
    expect(minimizeBtn).toBeInTheDocument();
    expect(minimizeBtn).toHaveAttribute('title', 'Minimizar PiChat');
    expect(minimizeBtn).toHaveAttribute('aria-label', 'Minimizar PiChat');
  });

  it('deve alternar para minimizado e restaurado ao clicar no botao', () => {
    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const minimizeBtn = screen.getByTestId('pichat-minimize-button');
    const messageList = screen.getByTestId('pichat-message-list');
    const inputField = screen.getByTestId('pichat-input-field');

    // Inicialmente visíveis
    expect(messageList).toBeVisible();
    expect(inputField).toBeVisible();

    // Clica para minimizar
    fireEvent.click(minimizeBtn);

    expect(minimizeBtn).toHaveAttribute('title', 'Restaurar PiChat');
    expect(minimizeBtn).toHaveAttribute('aria-label', 'Restaurar PiChat');
    expect(messageList.parentElement).toHaveStyle({ display: 'none' });

    // Clica para restaurar
    fireEvent.click(minimizeBtn);

    expect(minimizeBtn).toHaveAttribute('title', 'Minimizar PiChat');
    expect(minimizeBtn).toHaveAttribute('aria-label', 'Minimizar PiChat');
    expect(messageList.parentElement).toHaveStyle({ display: 'flex' });
  });

  it('deve preservar texto digitado e anexo de imagem ao minimizar e restaurar', () => {
    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const input = screen.getByTestId('pichat-input-field');
    const fileInput = screen.getByTestId('pichat-file-input');
    const minimizeBtn = screen.getByTestId('pichat-minimize-button');

    // 1. Digita texto
    fireEvent.change(input, { target: { value: 'Texto de teste não enviado' } });

    // 2. Anexa imagem
    const testFile = new File(['mock content'], 'tela_op.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(screen.getByText('tela_op.png')).toBeInTheDocument();
    expect(input).toHaveValue('Texto de teste não enviado');

    // 3. Minimiza
    fireEvent.click(minimizeBtn);
    expect(screen.getByText('PiChat')).toBeInTheDocument();

    // 4. Restaura
    fireEvent.click(minimizeBtn);

    // O texto e anexo devem permanecer idênticos
    expect(screen.getByTestId('pichat-input-field')).toHaveValue('Texto de teste não enviado');
    expect(screen.getByText('tela_op.png')).toBeInTheDocument();
  });

  it('deve processar resposta da API mesmo se minimizado durante a requisicao', async () => {
    const mockedSendChatMessage = sendChatMessage as jest.MockedFunction<typeof sendChatMessage>;
    let resolvePromise!: (val: any) => void;
    mockedSendChatMessage.mockReturnValueOnce(
      new Promise((res) => {
        resolvePromise = res;
      })
    );

    render(<PiChatPopover open={true} onClose={jest.fn()} />);

    const input = screen.getByTestId('pichat-input-field');
    const sendButton = screen.getByTestId('pichat-send-button');
    const minimizeBtn = screen.getByTestId('pichat-minimize-button');

    fireEvent.change(input, { target: { value: 'Consultando tag em background' } });
    fireEvent.click(sendButton);

    // Mensagem enviada e carregamento ativo
    expect(screen.getByText('Consultando tag em background')).toBeInTheDocument();

    // Minimiza o chat enquanto a resposta é processada
    fireEvent.click(minimizeBtn);

    // Resolve a resposta da API em background
    resolvePromise({
      ok: true,
      user_id: 'test_user',
      output: 'Resposta recebida em segundo plano!',
      tags_consultadas: ['TAG_BG_01'],
    });

    // Restaura o chat
    fireEvent.click(minimizeBtn);

    await waitFor(() => {
      expect(screen.getByText('Resposta recebida em segundo plano!')).toBeInTheDocument();
      expect(screen.getByText('TAG_BG_01')).toBeInTheDocument();
    });
  });

  it('deve acionar onClose ao clicar no botao fechar X quando minimizado', () => {
    const handleClose = jest.fn();
    render(<PiChatPopover open={true} onClose={handleClose} />);

    const minimizeBtn = screen.getByTestId('pichat-minimize-button');
    fireEvent.click(minimizeBtn);

    const closeBtn = screen.getByTestId('pichat-close-button');
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('deve resetar para o modo expandido ao fechar e reabrir o popover', () => {
    const handleClose = jest.fn();
    const { rerender } = render(<PiChatPopover open={true} onClose={handleClose} />);

    const minimizeBtn = screen.getByTestId('pichat-minimize-button');
    // Minimiza
    fireEvent.click(minimizeBtn);
    expect(screen.getByTestId('pichat-message-list').parentElement).toHaveStyle({ display: 'none' });

    // Fecha o modal
    rerender(<PiChatPopover open={false} onClose={handleClose} />);

    // Reabre o modal
    rerender(<PiChatPopover open={true} onClose={handleClose} />);

    // Deve estar no modo expandido
    expect(screen.getByTestId('pichat-message-list').parentElement).toHaveStyle({ display: 'flex' });
    expect(screen.getByTestId('pichat-minimize-button')).toHaveAttribute('title', 'Minimizar PiChat');
  });
});

