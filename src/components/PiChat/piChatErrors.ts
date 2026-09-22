export type PiChatErrorCode =
  | 'OFFLINE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'SERVER_ERROR'
  | 'AGENT_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface PiChatError {
  code: PiChatErrorCode;
  userMessage: string;
  httpStatus?: number;
  requestId?: string;
}

export const PICHAT_IMAGE_PROCESSING_ERROR = 'Não foi possível processar a imagem selecionada. Escolha outro arquivo e tente novamente.';

const USER_MESSAGES: Record<PiChatErrorCode, string> = {
  OFFLINE: 'Você está sem conexão de rede. Verifique sua conexão e tente novamente.',
  NETWORK_ERROR: 'Não foi possível acessar o PiChat no momento. Verifique sua conexão e tente novamente.',
  TIMEOUT: 'O PiChat demorou mais que o esperado para responder. Tente novamente.',
  UNAUTHORIZED: 'Sua sessão não permite acessar o PiChat. Atualize a página e entre novamente.',
  FORBIDDEN: 'Você não possui permissão para realizar esta operação no PiChat.',
  RATE_LIMITED: 'O PiChat recebeu muitas solicitações. Aguarde alguns instantes e tente novamente.',
  INVALID_REQUEST: 'Não foi possível processar essa solicitação. Revise a mensagem e tente novamente.',
  PAYLOAD_TOO_LARGE: 'O arquivo enviado é maior que o limite permitido.',
  UNSUPPORTED_FILE: 'Este tipo de arquivo não é suportado.',
  SERVICE_UNAVAILABLE: 'O PiChat está temporariamente indisponível. Tente novamente em alguns instantes.',
  INVALID_RESPONSE: 'O PiChat retornou uma resposta inválida. Tente novamente.',
  SERVER_ERROR: 'O PiChat encontrou um problema ao processar sua solicitação. Tente novamente.',
  AGENT_ERROR: 'O PiChat não conseguiu processar sua solicitação. Tente reformular a pergunta ou tente novamente.',
  CANCELLED: '',
  UNKNOWN: 'Não foi possível concluir sua solicitação. Tente novamente.',
};

export function formatPiChatErrorForUser(code: PiChatErrorCode, httpStatus?: number, requestId?: string): PiChatError {
  return {
    code,
    userMessage: USER_MESSAGES[code],
    ...(Number.isFinite(httpStatus) ? { httpStatus } : {}),
    ...(isSafeRequestId(requestId) ? { requestId } : {}),
  };
}

export function piChatErrorCodeForStatus(status: number): PiChatErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'INVALID_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_FILE';
    case 429:
      return 'RATE_LIMITED';
    case 500:
      return 'SERVER_ERROR';
    case 502:
    case 503:
    case 504:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN';
  }
}

export function piChatErrorCodeFromBackend(value: unknown): PiChatErrorCode {
  if (typeof value !== 'string') {
    return 'AGENT_ERROR';
  }
  const code = value.trim().toUpperCase();
  const knownCodes: PiChatErrorCode[] = [
    'OFFLINE', 'NETWORK_ERROR', 'TIMEOUT', 'UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMITED',
    'INVALID_REQUEST', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_FILE', 'SERVICE_UNAVAILABLE',
    'INVALID_RESPONSE', 'SERVER_ERROR', 'AGENT_ERROR', 'UNKNOWN',
  ];
  return knownCodes.includes(code as PiChatErrorCode) ? code as PiChatErrorCode : 'AGENT_ERROR';
}

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export function safeStoredPiChatErrorMessage(content: string, isError?: boolean): string {
  if (!isError) {
    return content;
  }
  const looksTechnical = /(?:https?:\/\/|\/chat|ECONNREFUSED|ERR_CONNECTION|Failed to fetch|Traceback|stack|password|token|\b\d{1,3}(?:\.\d{1,3}){3}\b|:\d{2,5}\b)/i.test(content);
  return looksTechnical ? USER_MESSAGES.UNKNOWN : content;
}
