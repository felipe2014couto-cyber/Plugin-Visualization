export type PiChatRole = 'user' | 'assistant';

export interface PiChatAttachment {
  fileName: string;
  mimeType: string;
  previewUrl?: string;
}

export interface PiChatMessage {
  id: string;
  role: PiChatRole;
  content: string;
  timestamp: string;
  tags_consultadas?: string[];
  isError?: boolean;
  attachment?: PiChatAttachment;
}

export interface PiChatImagePayload {
  image_base64: string;
  mime_type: string;
  file_name?: string;
}

export interface PiChatRequestPayload {
  message: string;
  user_id: string;
  images: PiChatImagePayload[];
}

export interface PiChatResponsePayload {
  ok: boolean;
  user_id?: string | null;
  message_original?: string;
  processed_message?: string | null;
  output?: string | null;
  tags_consultadas?: string[];
  agent_trace?: unknown[];
  answer_generation_error?: string | null;
  tool_name?: string | null;
}

export interface PiChatUserIdentity {
  userId: string;
  source: 'grafana' | 'session';
}
