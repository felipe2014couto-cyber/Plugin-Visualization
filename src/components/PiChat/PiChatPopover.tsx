import React, { useState, useEffect, useRef } from 'react';
import { PiChatMessage as PiChatMessageModel, PiChatImagePayload, PiChatAttachment } from './types';
import { loadChatHistory, saveChatHistory } from './piChatStorage';
import { getPiChatUserId } from './piChatUser';
import { sendChatMessage } from './piChatApi';
import { fileToBase64 } from './piChatImage';
import { PiChatMessage } from './PiChatMessage';
import { PiChatInput } from './PiChatInput';
import { PiChatIcon } from './PiChatIcon';
import { getPiChatStyles } from './styles';

export interface PiChatPopoverProps {
  open: boolean;
  onClose: () => void;
}

function formatCurrentTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const PiChatPopover: React.FC<PiChatPopoverProps> = ({ open, onClose }) => {
  const [messages, setMessages] = useState<PiChatMessageModel[]>(() => loadChatHistory());
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const styles = getPiChatStyles();

  // Salva no sessionStorage sempre que a lista de mensagens for alterada
  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  // Reinicia para o modo expandido sempre que o popover for fechado
  useEffect(() => {
    if (!open) {
      setIsMinimized(false);
    }
  }, [open]);

  // Auto-scroll para a última mensagem quando aberto e expandido
  useEffect(() => {
    if (open && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, open, isMinimized]);

  if (!open) {
    return null;
  }

  const handleSendMessage = async (text: string, file?: File | null) => {
    let images: PiChatImagePayload[] | undefined;
    let attachment: PiChatAttachment | undefined;

    if (file) {
      try {
        const base64Str = await fileToBase64(file);
        images = [
          {
            image_base64: base64Str,
            mime_type: file.type || 'image/png',
            file_name: file.name,
          },
        ];
        attachment = {
          fileName: file.name,
          mimeType: file.type || 'image/png',
        };
      } catch (err) {
        console.error('[PiChat] Erro ao processar imagem para envio:', err);
      }
    }

    const userMsg: PiChatMessageModel = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: formatCurrentTime(),
      ...(attachment ? { attachment } : {}),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const identity = getPiChatUserId();
    const response = images
      ? await sendChatMessage(text, identity.userId, images)
      : await sendChatMessage(text, identity.userId);

    setIsLoading(false);

    const botMsg: PiChatMessageModel = {
      id: `msg_bot_${Date.now()}`,
      role: 'assistant',
      content: response.output || 'Sem resposta do agente.',
      timestamp: formatCurrentTime(),
      tags_consultadas: response.tags_consultadas,
      isError: !response.ok,
    };

    setMessages((prev) => [...prev, botMsg]);
  };

  return (
    <div
      className={`${styles.popover} ${isMinimized ? styles.popoverMinimized : ''}`}
      data-testid="pichat-popover"
      role="dialog"
      aria-label="PiChat Agent"
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleArea}>
          <div className={styles.headerIcon}>
            <PiChatIcon size={18} />
          </div>
          <div className={styles.headerText}>
            <span className={styles.headerTitle}>PiChat</span>
            <span className={styles.headerSubtitle}>PIMS Agent Bot</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.minimizeButton}
            onClick={() => setIsMinimized((prev) => !prev)}
            title={isMinimized ? 'Restaurar PiChat' : 'Minimizar PiChat'}
            aria-label={isMinimized ? 'Restaurar PiChat' : 'Minimizar PiChat'}
            data-testid="pichat-minimize-button"
          >
            {isMinimized ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="10" height="10" rx="1" />
              </svg>
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title="Fechar PiChat"
            aria-label="Fechar PiChat"
            data-testid="pichat-close-button"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        className={isMinimized ? styles.contentHidden : undefined}
        style={{ display: isMinimized ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
      >
        {/* Body / Message List */}
        <div className={styles.body} data-testid="pichat-message-list">
          {messages.length === 0 && (
            <div className={styles.welcomeCard} data-testid="pichat-welcome-card">
              <div className={styles.welcomeIcon}>
                <PiChatIcon size={32} />
              </div>
              <div className={styles.welcomeTitle}>Olá! Sou o PiChat</div>
              <div>
                Seu assistente inteligente para consultas ao PI System e telemetria industrial. Como posso ajudar você hoje?
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <PiChatMessage key={msg.id} message={msg} />
          ))}

          {isLoading && (
            <div className={styles.loadingIndicator} data-testid="pichat-loading-indicator">
              <span>PiChat pensando</span>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer / Input */}
        <PiChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default PiChatPopover;
