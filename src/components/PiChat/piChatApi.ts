import { getBackendSrv } from '@grafana/runtime';

import { PiChatImagePayload, PiChatRequestPayload, PiChatResponsePayload } from './types';
import {
  formatPiChatErrorForUser,
  piChatErrorCodeForStatus,
  piChatErrorCodeFromBackend,
  type PiChatErrorCode,
} from './piChatErrors';

export const PICHAT_RESOURCE_PATH = '/api/plugins/pims-vision-app/resources/pichat/chat';

export async function sendChatMessage(message: string, userId: string, images?: PiChatImagePayload[], externalSignal?: AbortSignal): Promise<PiChatResponsePayload> {
  if (externalSignal?.aborted) return cancelledResponse();
  const payload: PiChatRequestPayload = { message: message.trim(), user_id: userId, images: Array.isArray(images) && images.length > 0 ? images : [] };

  try {
    const data = await getBackendSrv().post<unknown>(PICHAT_RESOURCE_PATH, payload, { showErrorAlert: false, hideFromInspector: true });
    if (externalSignal?.aborted) return cancelledResponse();
    if (!isPiChatResponseObject(data)) return safeErrorResponse('INVALID_RESPONSE');
    if (data.ok === false) return safeErrorResponse(piChatErrorCodeFromBackend(data.error_code ?? data.answer_generation_error));
    if (data.output !== undefined && typeof data.output !== 'string' && typeof data.answer !== 'string') return safeErrorResponse('INVALID_RESPONSE');
    return {
      ok: true,
      user_id: data.user_id ?? userId,
      message_original: data.message_original ?? message,
      processed_message: data.processed_message,
      output: data.output ?? data.answer ?? 'Sem resposta retornada pelo agente.',
      tags_consultadas: Array.isArray(data.tags_consultadas) ? data.tags_consultadas : [],
      answer_generation_error: null,
      tool_name: data.tool_name ?? null,
    };
  } catch (error: any) {
    if (externalSignal?.aborted || error?.cancelled) return cancelledResponse();
    if (error?.name === 'AbortError') return safeErrorResponse('TIMEOUT');
    const status = Number(error?.status);
    const code = Number.isFinite(status) && status > 0 ? piChatErrorCodeForStatus(status) : (typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'NETWORK_ERROR');
    return safeErrorResponse(code, Number.isFinite(status) && status > 0 ? status : undefined);
  }
}

function isPiChatResponseObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function safeErrorResponse(code: PiChatErrorCode, status?: number): PiChatResponsePayload {
  const error = formatPiChatErrorForUser(code, status);
  return { ok: false, output: error.userMessage, answer_generation_error: error.code, errorCode: error.code };
}

function cancelledResponse(): PiChatResponsePayload {
  return { ok: false, output: '', answer_generation_error: 'CANCELLED', errorCode: 'CANCELLED', cancelled: true };
}
