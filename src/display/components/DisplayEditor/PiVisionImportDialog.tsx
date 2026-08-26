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
// Utilitarios
// ---------------------------------------------------------------------------

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Extrai o ID do Display e a URL base do PI Vision a partir de um link.
 *
 * Formatos suportados:
 *   http://pimsweb/PIVision/#/Displays/48494/Nome
 *   https://pimsweb/PIVision/#/Displays/48494
 */
export function parsePiVisionUrl(url: string): { baseUrl: string; displayId: string } | undefined {
  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }

  // Extrai o display ID do fragmento hash: #/Displays/<ID>
  const hashMatch = trimmed.match(/#\/Displays\/(\d+)/i);
  if (!hashMatch) {
    return undefined;
  }
  const displayId = hashMatch[1];

  // A URL base e tudo antes do #
  const hashIndex = trimmed.indexOf('#');
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;

  // Remove trailing slash
  const baseUrl = beforeHash.replace(/\/+$/, '');
  if (!baseUrl) {
    return undefined;
  }

  return { baseUrl, displayId };
}

const PIVISION_PROXY_PORT = 3001;
const PIVISION_PROXY_BASE = `http://localhost:${PIVISION_PROXY_PORT}/pivision`;

/**
 * Verifica se o proxy local esta rodando.
 */
async function isProxyRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch(`http://localhost:${PIVISION_PROXY_PORT}/health`, { signal: controller.signal });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * Tenta buscar a definicao do Display na API do PI Vision.
 * Estrategia:
 *  1. Tenta via proxy local (pi-vision-proxy.js) — sem CORS, autenticacao server-side
 *  2. Se proxy nao estiver rodando, tenta fetch direto com credenciais do navegador
 */
async function fetchPiVisionDisplay(baseUrl: string, displayId: string): Promise<unknown> {
  const apiEndpoints = [
    `${baseUrl}/api/displays/${displayId}`,
    `${baseUrl}/Utility/Services/DisplayService.svc/displays/${displayId}`,
    `${baseUrl}/api/v1/displays/${displayId}`,
  ];

  // Tenta via proxy local primeiro
  const proxyAvailable = await isProxyRunning();
  if (proxyAvailable) {
    for (const endpoint of apiEndpoints) {
      try {
        const proxyController = new AbortController();
        const proxyTimer = setTimeout(() => proxyController.abort(), 15000);
        try {
          const proxyUrl = `${PIVISION_PROXY_BASE}?url=${encodeURIComponent(endpoint)}`;
          const response = await fetch(proxyUrl, { signal: proxyController.signal });
          if (response.ok) {
            return await response.json() as unknown;
          }
          if (response.status === 404) {
            continue;
          }
          if (response.status === 401 || response.status === 403) {
            throw new Error('Acesso negado (401/403) via proxy. O servidor PI Vision pode exigir autenticacao Windows.');
          }
        } finally {
          clearTimeout(proxyTimer);
        }
      } catch (err) {
        if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
          throw err;
        }
      }
    }
  }

  // Tenta fetch direto com credenciais do navegador (pode falhar por CORS)
  let lastError: Error = new Error('Nenhum endpoint respondeu.');
  for (const endpoint of apiEndpoints) {
    const directController = new AbortController();
    const directTimer = setTimeout(() => directController.abort(), 10000);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: directController.signal,
      });
      if (response.ok) {
        clearTimeout(directTimer);
        return await response.json() as unknown;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('Acesso negado (401/403). Verifique se voce esta autenticado no PI Vision neste navegador.');
      }
      if (response.status === 404) {
        lastError = new Error(`Display #${displayId} nao encontrado no PI Vision.`);
        continue;
      }
      lastError = new Error(`Erro HTTP ${response.status} ao acessar o PI Vision.`);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('403') || err.message.includes('404'))) {
        lastError = err;
      } else {
        lastError = new Error(
          proxyAvailable
            ? `Nao foi possivel obter o display. Verifique se a URL esta correta.`
            : `CORS bloqueou a requisicao. Inicie o proxy local:\n\ncd /PIMS/Plugin_grafana && node pi-vision-proxy.js\n\nDepois tente novamente.`,
        );
      }
    } finally {
      clearTimeout(directTimer);
    }
  }


  throw lastError;
}


// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

type Tab = 'link' | 'file';

export function PiVisionImportDialog({ onImport, onClose }: PiVisionImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('link');
  const [dataSourceUid, setDataSourceUid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Aba Link ---
  const [linkUrl, setLinkUrl] = useState('');

  // --- Aba Arquivo ---
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedJson, setParsedJson] = useState<unknown>(null);

  // ---------------------------------------------------------------------------
  // Handlers — Aba Link
  // ---------------------------------------------------------------------------

  const handleConvertLink = useCallback(async () => {
    const parsed = parsePiVisionUrl(linkUrl);
    if (!parsed) {
      setError('Link invalido. Use o formato: http://pimsweb/PIVision/#/Displays/48494/Nome');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const json = await fetchPiVisionDisplay(parsed.baseUrl, parsed.displayId);
      const converted = convertPiVisionDisplay(json, dataSourceUid.trim() || undefined);
      serializeDisplay(converted);
      onImport(converted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao converter o display.');
    } finally {
      setLoading(false);
    }
  }, [dataSourceUid, linkUrl, onImport]);

  // ---------------------------------------------------------------------------
  // Handlers — Aba Arquivo
  // ---------------------------------------------------------------------------

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

  const handleConvertFile = useCallback(async () => {
    if (!parsedJson) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const converted = convertPiVisionDisplay(parsedJson, dataSourceUid.trim() || undefined);
      serializeDisplay(converted);
      onImport(converted);
    } catch (err) {
      if (err instanceof PiVisionConvertError) {
        setError(`Erro de conversao: ${err.message}`);
      } else {
        setError('Falha ao converter o display. Verifique se o arquivo e um export valido do PI Vision.');
      }
    } finally {
      setLoading(false);
    }
  }, [dataSourceUid, onImport, parsedJson]);

  // ---------------------------------------------------------------------------
  // Teclado e backdrop
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const canConvert = tab === 'link'
    ? Boolean(linkUrl.trim()) && !loading
    : Boolean(parsedJson) && !loading;

  const handleConvert = tab === 'link' ? () => void handleConvertLink() : () => void handleConvertFile();

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

        {/* Abas */}
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'link'}
            className={tab === 'link' ? styles.tabActive : styles.tab}
            data-testid="pi-vision-tab-link"
            onClick={() => { setTab('link'); setError(null); }}
          >
            Colar Link
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'file'}
            className={tab === 'file' ? styles.tabActive : styles.tab}
            data-testid="pi-vision-tab-file"
            onClick={() => { setTab('file'); setError(null); }}
          >
            Upload de Arquivo
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* Aba: Link */}
          {tab === 'link' && (
            <>
              <p className={styles.description}>
                Cole o link de um Display do PI Vision. O conversor ira buscar a definicao
                diretamente no servidor usando suas credenciais ja ativas no navegador.
              </p>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="piv-link-input">
                  Link do Display PI Vision
                </label>
                <input
                  id="piv-link-input"
                  type="text"
                  className={styles.textInput}
                  placeholder="http://pimsweb/PIVision/#/Displays/48494/Nome-Da-Tela"
                  value={linkUrl}
                  data-testid="pi-vision-import-link"
                  onChange={(e) => { setLinkUrl(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canConvert) { handleConvert(); } }}
                />
              </div>
              <div className={styles.notice} role="note">
                <strong>Requisito:</strong> voce precisa estar autenticado no PI Vision neste mesmo
                navegador. Se o servidor bloquear a requisicao (CORS), use a aba{' '}
                <button type="button" className={styles.noticeLink} onClick={() => setTab('file')}>
                  Upload de Arquivo
                </button>.
              </div>
            </>
          )}

          {/* Aba: Arquivo */}
          {tab === 'file' && (
            <>
              <p className={styles.description}>
                Exporte o display no PI Vision como JSON e selecione o arquivo abaixo.
              </p>
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
            </>
          )}

          {/* DataSource UID — compartilhado entre as abas */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="piv-ds-uid">
              UID do Datasource PI no Grafana <span className={styles.optional}>(opcional)</span>
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
              Encontrado em: Grafana → Connections → Data sources → PI System → Settings → UID.
              Se omitido, pode ser corrigido no editor apos a importacao.
            </span>
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
            disabled={!canConvert}
            onClick={handleConvert}
          >
            {loading
              ? (tab === 'link' ? 'Buscando e convertendo...' : 'Convertendo...')
              : 'Converter e Importar'}
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
    width: 500px;
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
  tabs: css`
    display: flex;
    border-bottom: 1px solid var(--border-color, #3d3d3d);
    background: var(--surface-secondary, #22262e);
  `,
  tab: css`
    padding: 10px 18px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-secondary, #9fa6b2);
    font-size: 13px;
    cursor: pointer;
    &:hover {
      color: var(--text-primary, #d8d9da);
    }
  `,
  tabActive: css`
    padding: 10px 18px;
    border: none;
    border-bottom: 2px solid var(--primary, #5a78d1);
    background: transparent;
    color: var(--text-primary, #d8d9da);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
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
  optional: css`
    font-weight: 400;
    color: var(--text-secondary, #9fa6b2);
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
  noticeLink: css`
    background: none;
    border: none;
    color: var(--primary, #5a78d1);
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    text-decoration: underline;
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
