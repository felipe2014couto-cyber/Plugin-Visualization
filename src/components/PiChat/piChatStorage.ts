import { PiChatMessage } from './types';

export const PICHAT_STORAGE_KEY = 'pims_pichat_history';

export function loadChatHistory(): PiChatMessage[] {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(PICHAT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item): item is PiChatMessage =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          typeof item.timestamp === 'string'
      )
      .map((item) => {
        const cleanMsg: PiChatMessage = {
          id: item.id,
          role: item.role,
          content: item.content,
          timestamp: item.timestamp,
        };
        if (Array.isArray(item.tags_consultadas)) {
          cleanMsg.tags_consultadas = item.tags_consultadas;
        }
        if (typeof item.isError === 'boolean') {
          cleanMsg.isError = item.isError;
        }
        if (item.attachment && typeof item.attachment.fileName === 'string' && typeof item.attachment.mimeType === 'string') {
          cleanMsg.attachment = {
            fileName: item.attachment.fileName,
            mimeType: item.attachment.mimeType,
          };
        }
        return cleanMsg;
      });
  } catch (err) {
    console.warn('[PiChat] Erro ao carregar histórico do sessionStorage:', err);
    return [];
  }
}

export function saveChatHistory(messages: PiChatMessage[]): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    const sanitized = messages.map((msg) => {
      const item: PiChatMessage = {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      };
      if (msg.tags_consultadas && msg.tags_consultadas.length > 0) {
        item.tags_consultadas = msg.tags_consultadas;
      }
      if (msg.isError) {
        item.isError = msg.isError;
      }
      if (msg.attachment) {
        item.attachment = {
          fileName: msg.attachment.fileName,
          mimeType: msg.attachment.mimeType,
        };
      }
      return item;
    });
    window.sessionStorage.setItem(PICHAT_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('[PiChat] Erro ao salvar histórico no sessionStorage:', err);
  }
}

export function clearChatHistory(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.removeItem(PICHAT_STORAGE_KEY);
  } catch (err) {
    console.warn('[PiChat] Erro ao limpar histórico do sessionStorage:', err);
  }
}
