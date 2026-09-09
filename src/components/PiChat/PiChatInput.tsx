import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getPiChatStyles } from './styles';
import { validateImage, normalizeClipboardFile } from './piChatImage';

export interface PiChatInputProps {
  onSendMessage: (message: string, file?: File | null) => void;
  isLoading: boolean;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PiChatInput: React.FC<PiChatInputProps> = ({ onSendMessage, isLoading, disabled }) => {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;

  const styles = getPiChatStyles();

  const revokePreviewSafely = (url: string | null) => {
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // noop
      }
    }
  };

  // Foco automatico ao carregar
  useEffect(() => {
    if (!isLoading && !disabled) {
      inputRef.current?.focus();
    }
  }, [isLoading, disabled]);

  // Limpeza de URL de objeto temporario
  const handleRemoveFile = useCallback(() => {
    revokePreviewSafely(previewUrlRef.current);
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Limpeza de URL ao desmontar
  useEffect(() => {
    return () => {
      revokePreviewSafely(previewUrlRef.current);
    };
  }, []);

  // Handler unico para processar qualquer arquivo (seletor ou clipboard)
  const handleSelectedFile = useCallback((file: File) => {
    const normalized = normalizeClipboardFile(file);
    const validation = validateImage(normalized);
    if (!validation.valid) {
      setValidationError(validation.error || 'Arquivo de imagem inválido.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Libera preview anterior se houver
    revokePreviewSafely(previewUrlRef.current);

    setValidationError(null);
    setSelectedFile(normalized);
    const url = URL.createObjectURL(normalized);
    setPreviewUrl(url);
  }, []);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    handleSelectedFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) {
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleSelectedFile(file);
          return;
        }
      }
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const trimmed = text.trim();
    if ((!trimmed && !selectedFile) || isLoading || disabled) {
      return;
    }

    onSendMessage(trimmed, selectedFile);
    setText('');
    handleRemoveFile();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = (Boolean(text.trim()) || Boolean(selectedFile)) && !isLoading && !disabled;

  return (
    <form className={styles.footer} onSubmit={handleSubmit} data-testid="pichat-input-form">
      {/* Alerta de validacao de arquivo */}
      {validationError && (
        <div className={styles.validationAlert} role="alert" data-testid="pichat-validation-error">
          ⚠️ {validationError}
        </div>
      )}

      {/* Card de pre-visualizacao de imagem */}
      {selectedFile && previewUrl && (
        <div className={styles.previewContainer} data-testid="pichat-image-preview">
          <div className={styles.previewContent}>
            <img src={previewUrl} alt="Prévia do anexo" className={styles.previewThumb} />
            <div className={styles.previewInfo}>
              <span className={styles.previewFileName} title={selectedFile.name}>
                {selectedFile.name}
              </span>
              <span className={styles.previewFileSize}>{formatFileSize(selectedFile.size)}</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.previewRemoveButton}
            onClick={handleRemoveFile}
            title="Remover imagem"
            aria-label="Remover imagem"
            data-testid="pichat-remove-image-button"
            disabled={isLoading || disabled}
          >
            ✕
          </button>
        </div>
      )}

      {/* Linha de entrada de texto e controles */}
      <div className={styles.footerInputRow}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          data-testid="pichat-file-input"
          disabled={isLoading || disabled}
        />

        <button
          type="button"
          className={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || disabled}
          title="Anexar imagem (PNG, JPEG, WEBP)"
          aria-label="Anexar imagem"
          data-testid="pichat-attach-button"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={
            isLoading
              ? 'PiChat está processando...'
              : selectedFile
              ? 'Adicione uma pergunta sobre a imagem ou envie direto...'
              : 'Digite sua pergunta sobre o PI...'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={isLoading || disabled}
          aria-label="Mensagem para o PiChat"
          data-testid="pichat-input-field"
        />

        <button
          type="submit"
          className={styles.sendButton}
          disabled={!canSubmit}
          title="Enviar mensagem"
          aria-label="Enviar mensagem"
          data-testid="pichat-send-button"
        >
          {isLoading ? '...' : 'Enviar'}
        </button>
      </div>
    </form>
  );
};

export default PiChatInput;

