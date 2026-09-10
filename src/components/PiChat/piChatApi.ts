import { PiChatImagePayload, PiChatRequestPayload, PiChatResponsePayload } from './types';

declare global {
  interface Window {
    __PIMS_PICHAT_API_BASE_URL__?: string;
  }
}

declare const __PIMS_PICHAT_API_BASE_URL_FROM_ENV__: string | undefined;

export function getPiChatApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const win = window as any;
    if (win.__PIMS_PICHAT_API_BASE_URL__) {
      return String(win.__PIMS_PICHAT_API_BASE_URL__).replace(/\/$/, '');
    }
    if (win.PIMS_PICHAT_API_BASE_URL) {
      return String(win.PIMS_PICHAT_API_BASE_URL).replace(/\/$/, '');
    }
  }

  let envUrl: string | undefined;
  try {
    if (typeof __PIMS_PICHAT_API_BASE_URL_FROM_ENV__ !== 'undefined' && __PIMS_PICHAT_API_BASE_URL_FROM_ENV__) {
      envUrl = __PIMS_PICHAT_API_BASE_URL_FROM_ENV__;
    }
  } catch {
    // Ignore ReferenceError if undefined
  }

  if (!envUrl && typeof process !== 'undefined' && process.env?.PIMS_PICHAT_API_BASE_URL) {
    envUrl = process.env.PIMS_PICHAT_API_BASE_URL;
  }

  if (envUrl && envUrl.trim()) {
    return String(envUrl).trim().replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const win = window as any;
    if (win.location?.hostname) {
      const protocol = win.location.protocol || 'http:';
      const hostname = win.location.hostname;
      return `${protocol}//${hostname}:8002`;
    }
  }

  return 'http://localhost:8002';
}

export async function sendChatMessage(
  message: string,
  userId: string,
  images?: PiChatImagePayload[],
  externalSignal?: AbortSignal
): Promise<PiChatResponsePayload> {
  const baseUrl = getPiChatApiBaseUrl();
  const url = `${baseUrl}/chat`;

  const controller = new AbortController();
  const timeoutMs = 120_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => {
      controller.abort();
    });
  }

  const payload: PiChatRequestPayload = {
    message: message.trim(),
    user_id: userId,
    images: Array.isArray(images) && images.length > 0 ? images : [],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMsg = `Erro ${response.status} ao comunicar com o PiChat Agent.`;
      try {
        const errJson = JSON.parse(errorText);
        if (errJson.detail) {
          errorMsg = errJson.detail;
        }
      } catch {
        // Ignora erro de parse
      }
      return {
        ok: false,
        output: errorMsg,
        answer_generation_error: errorMsg,
      };
    }

    const data = await response.json();
    return {
      ok: Boolean(data.ok ?? true),
      user_id: data.user_id ?? userId,
      message_original: data.message_original ?? message,
      processed_message: data.processed_message,
      output: data.output ?? data.answer ?? 'Sem resposta retornada pelo agente.',
      tags_consultadas: Array.isArray(data.tags_consultadas) ? data.tags_consultadas : [],
      agent_trace: Array.isArray(data.agent_trace) ? data.agent_trace : [],
      answer_generation_error: data.answer_generation_error ?? null,
      tool_name: data.tool_name ?? null,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError' || controller.signal.aborted) {
      return {
        ok: false,
        output: 'Tempo limite esgotado (120s). O Agent Bot demorou para responder.',
        answer_generation_error: 'TIMEOUT',
      };
    }

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const msg = isOffline
      ? 'Você está offline. Verifique sua conexão de rede.'
      : `Não foi possível conectar ao PiChat Agent Bot (${baseUrl}). Verifique se o serviço está em execução.`;

    return {
      ok: false,
      output: msg,
      answer_generation_error: err.message ?? 'NETWORK_ERROR',
    };
  }
}
