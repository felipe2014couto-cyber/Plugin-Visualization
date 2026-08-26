import React, { useCallback, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { convertPiVisionDisplay, PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER, PiVisionConvertError } from '../../piVisionConverter';
import { serializeDisplay } from '../../displayTransfer';
import type { DisplayDocument } from '../../displayDocument';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PiVisionImportDialogProps {
  onImport: (document: DisplayDocument) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Utilitario de leitura de arquivo
// ---------------------------------------------------------------------------

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsText(file, 'utf-8');
  });
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PiVisionImportDialog({ onImport, onClose }: PiVisionImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dataSourceUid, setDataSourceUid] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedJson, setParsedJson] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    setError(null);
    setParsedJson(null);
    setFileName(null);

    try {
      const text = await readFileText(file);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        setError('Arquivo invalido: nao e um JSON valido.');
        return;
      }
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        setError('Arquivo invalido: o JSON do PI Vision deve ser um objeto.');
        return;
      }
      setParsedJson(json);
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ler o arquivo.');
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!parsedJson) {
      return;
    }
    setConverting(true);
    setError(null);
    try {
      const converted = convertPiVisionDisplay(parsedJson, dataSourceUid.trim() || undefined);
      // Valida a serializacao (garante que o documento e integro)
      serializeDisplay(converted);
      onImport(converted);
    } catch (err) {
      if (err instanceof PiVisionConvertError) {
        setError(`Erro de conversao: ${err.message}`);
      } else {
        setError('Falha ao converter o display. Verifique se o arquivo e um export valido do PI Vision.');
      }
    } finally {
      setConverting(false);
    }
  }, [dataSourceUid, onImport, parsedJson]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick} onKeyDown={handleKeyDown} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Importar Display do PI Vision"
        data-testid="pi-vision-import-dialog"
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>Importar do PI Vision</span>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Fechar"
            data-testid="pi-vision-import-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Instrucao */}
          <p className={styles.description}>
            Exporte o display no PI Vision como JSON e selecione o arquivo abaixo.
            O conversor ira mapear os elementos para o formato Aperam Visualization.
          </p>

          {/* Selecao de arquivo */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="piv-file-input">
              Arquivo JSON do PI Vision
            </label>
            <div className={styles.fileRow}>
              <span className={fileName ? styles.fileNameActive : styles.fileNameEmpty}>
                {fileName ?? 'Nenhum arquivo selecionado'}
              </span>
              <button
                type="button"
                className={styles.fileButton}
                data-testid="pi-vision-import-file-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Selecionar arquivo
              </button>
              <input
                id="piv-file-input"
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className={styles.hiddenInput}
                data-testid="pi-vision-import-file-input"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* DataSource UID */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="piv-ds-uid">
              UID do Datasource PI (opcional)
            </label>
            <input
              id="piv-ds-uid"
              type="text"
              className={styles.textInput}
              placeholder={PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER}
              value={dataSourceUid}
              data-testid="pi-vision-import-ds-uid"
              onChange={(e) => setDataSourceUid(e.target.value)}
            />
            <span className={styles.hint}>
              Se deixado em branco, sera usado um placeholder que pode ser corrigido no editor apos a importacao.
              O UID pode ser encontrado na configuracao do datasource no Grafana.
            </span>
          </div>

          {/* Aviso de limitacoes */}
          <div className={styles.notice} role="note">
            <strong>Limitacoes conhecidas:</strong> simbolos industriais sem equivalente local serao representados
            como retangulos. Formulas PI Performance Equations precisarao ser revisadas manualmente.
          </div>

          {/* Erro */}
          {error && (
            <div className={styles.error} role="alert" data-testid="pi-vision-import-error">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            data-testid="pi-vision-import-cancel"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.convertButton}
            data-testid="pi-vision-import-convert"
            disabled={!parsedJson || converting}
            onClick={() => void handleConvert()}
          >
            {converting ? 'Convertendo...' : 'Converter e Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const styles = {
  backdrop: css`
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
  `,
  dialog: css`
    width: 480px;
    max-width: calc(100vw - 32px);
    background: var(--surface-primary, #1a1d23);
    border: 1px solid var(--border-color, #3d3d3d);
    border-radius: 8px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color, #3d3d3d);
    background: var(--surface-secondary, #22262e);
  `,
  headerTitle: css`
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #d8d9da);
  `,
  closeButton: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary, #9fa6b2);
    cursor: pointer;
    font-size: 13px;
    &:hover {
      background: var(--button-hover, rgba(255,255,255,0.08));
      color: var(--text-primary, #d8d9da);
    }
  `,
  body: css`
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  `,
  description: css`
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, #9fa6b2);
    line-height: 1.5;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 5px;
  `,
  label: css`
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary, #d8d9da);
  `,
  fileRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  fileNameEmpty: css`
    flex: 1;
    font-size: 12px;
    color: var(--text-disabled, #6b7280);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  fileNameActive: css`
    flex: 1;
    font-size: 12px;
    color: var(--text-primary, #d8d9da);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  fileButton: css`
    flex-shrink: 0;
    padding: 5px 12px;
    border: 1px solid var(--border-color, #3d3d3d);
    border-radius: 4px;
    background: var(--button-bg, rgba(255,255,255,0.06));
    color: var(--text-primary, #d8d9da);
    font-size: 12px;
    cursor: pointer;
    &:hover {
      background: var(--button-hover, rgba(255,255,255,0.12));
    }
  `,
  hiddenInput: css`display: none;`,
  textInput: css`
    padding: 6px 10px;
    border: 1px solid var(--border-color, #3d3d3d);
    border-radius: 4px;
    background: var(--input-bg, rgba(0,0,0,0.25));
    color: var(--text-primary, #d8d9da);
    font-size: 12px;
    width: 100%;
    box-sizing: border-box;
    &::placeholder { color: var(--text-disabled, #6b7280); }
    &:focus {
      outline: none;
      border-color: var(--primary-border, #5a78d1);
    }
  `,
  hint: css`
    font-size: 11px;
    color: var(--text-secondary, #9fa6b2);
    line-height: 1.4;
  `,
  notice: css`
    padding: 8px 12px;
    border: 1px solid var(--warning-border, #6b5c00);
    border-radius: 4px;
    background: var(--warning-bg, rgba(107, 92, 0, 0.15));
    color: var(--warning-text, #d4b82a);
    font-size: 11px;
    line-height: 1.5;
  `,
  error: css`
    padding: 8px 12px;
    border: 1px solid var(--danger-border, #8b2020);
    border-radius: 4px;
    background: rgba(139, 32, 32, 0.15);
    color: var(--danger, #e05555);
    font-size: 12px;
  `,
  footer: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-color, #3d3d3d);
    background: var(--surface-secondary, #22262e);
  `,
  cancelButton: css`
    padding: 6px 16px;
    border: 1px solid var(--border-color, #3d3d3d);
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary, #9fa6b2);
    font-size: 13px;
    cursor: pointer;
    &:hover {
      background: var(--button-hover, rgba(255,255,255,0.08));
      color: var(--text-primary, #d8d9da);
    }
  `,
  convertButton: css`
    padding: 6px 18px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: var(--primary, #5a78d1);
    color: #ffffff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    &:hover:not(:disabled) {
      background: var(--primary-hover, #4965bb);
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `,
};
