import React from 'react';
import { PiChatMessage as PiChatMessageModel } from './types';
import { getPiChatStyles } from './styles';

export interface PiChatMessageProps {
  message: PiChatMessageModel;
}

function renderFormattedContent(content: string, styles: ReturnType<typeof getPiChatStyles>) {
  if (!content) {
    return null;
  }

  // Se houver blocos de código com ```
  if (content.includes('```')) {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim();
        return (
          <pre key={index} className={styles.codeBlock}>
            <code>{lines}</code>
          </pre>
        );
      }
      return <span key={index}>{renderInlineFormatted(part)}</span>;
    });
  }

  return renderInlineFormatted(content);
}

function renderInlineFormatted(text: string) {
  // Trata quebras de linha e negrito simples **texto**
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    // Processa **negrito** e `código inline`
    const tokens = line.split(/(\*\*.*?\*\*|`.*?`)/g);
    return (
      <React.Fragment key={lineIdx}>
        {tokens.map((token, tokenIdx) => {
          if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
            return <strong key={tokenIdx}>{token.slice(2, -2)}</strong>;
          }
          if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
            return (
              <code
                key={tokenIdx}
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  fontSize: '0.9em',
                  fontFamily: 'monospace',
                }}
              >
                {token.slice(1, -1)}
              </code>
            );
          }
          return token;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export const PiChatMessage: React.FC<PiChatMessageProps> = ({ message }) => {
  const styles = getPiChatStyles();
  const isUser = message.role === 'user';
  const isError = message.isError;

  return (
    <div
      className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant}`}
      data-testid={`pichat-message-${message.id}`}
    >
      <div
        className={`${styles.bubble} ${
          isUser ? styles.bubbleUser : isError ? styles.bubbleError : styles.bubbleAssistant
        }`}
      >
        {message.attachment && (
          <div className={styles.attachmentBadge} data-testid="pichat-message-attachment">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span>{message.attachment.fileName}</span>
          </div>
        )}

        {renderFormattedContent(message.content, styles)}

        {message.tags_consultadas && message.tags_consultadas.length > 0 && (
          <div className={styles.tagsBadgeList} aria-label="Tags consultadas">
            {message.tags_consultadas.map((tag) => (
              <span key={tag} className={styles.tagBadge}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className={styles.messageTime}>{message.timestamp}</span>
    </div>
  );
};

export default PiChatMessage;
