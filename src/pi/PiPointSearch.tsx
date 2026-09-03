import React, { FormEvent, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { searchPiPointsWithStatus, type PiPointSearchResult } from './piDataSource';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from './piPointDrag';
import { PiPointSearchDialog } from './PiPointSearchDialog';

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface PiPointSearchProps {
  enabled: boolean;
  onSelect?: (result: PiPointSearchResult) => void;
  filtersOpen?: boolean;
  onCloseFilters?: () => void;
  onSearchInteraction?: () => void;
}

export function PiPointSearch({
  enabled,
  onSelect,
  filtersOpen = false,
  onCloseFilters,
  onSearchInteraction,
}: PiPointSearchProps) {
  const styles = useStyles2(getStyles);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PiPointSearchResult[]>([]);
  const [selected, setSelected] = useState<PiPointSearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const requestSequence = useRef(0);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    onSearchInteraction?.();
    const normalizedTerm = term.trim();

    if (!enabled || !normalizedTerm) {
      setStatus(normalizedTerm ? 'error' : 'idle');
      return;
    }

    const requestId = ++requestSequence.current;
    setStatus('loading');
    setErrorMessage('');
    try {
      const response = await searchPiPointsWithStatus({
        term: normalizedTerm,
      });
      if (requestId !== requestSequence.current) return;
      const nextResults = response.results;
      setResults(nextResults);
      setHasMoreResults(response.hasMore);
      setSelected(null);
      setStatus(nextResults.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível pesquisar PI Points.');
      setStatus('error');
    }
  };

  const handleApplyDialogResults = (dialogResults: PiPointSearchResult[], hasMore: boolean) => {
    setResults(dialogResults);
    setHasMoreResults(hasMore);
    setSelected(null);
    setStatus(dialogResults.length > 0 ? 'success' : 'empty');
  };

  return (
    <section className={styles.container} data-testid="pi-point-search">
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="pi-point-search-input">
          Pesquisar no PI System
        </label>
        <div className={styles.inputRow}>
          <input
            id="pi-point-search-input"
            className={styles.input}
            data-testid="pi-point-search-input"
            value={term}
            onFocus={onSearchInteraction}
            onChange={(event) => {
              onSearchInteraction?.();
              setTerm(event.target.value);
            }}
            placeholder="Nome da tag..."
            disabled={!enabled || status === 'loading'}
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="submit"
            className={styles.button}
            data-testid="pi-point-search-submit"
            aria-label="Pesquisar"
            title="Pesquisar"
            disabled={!enabled || status === 'loading' || !term.trim()}
          >
            <SearchIcon />
          </button>
        </div>
      </form>

      {status === 'loading' && <p data-testid="pi-point-search-loading">Pesquisando...</p>}
      {status === 'empty' && (
        <p className={styles.filteredEmpty} data-testid="pi-point-search-empty">
          Nenhum PI Point encontrado.
        </p>
      )}
      {status === 'error' && <p data-testid="pi-point-search-error">{errorMessage || 'Não foi possível pesquisar PI Points.'}</p>}
      {!enabled && <p data-testid="pi-point-search-disabled">Pesquisa PI indisponível.</p>}

      {results.length > 0 && (
        <>
          <p className={styles.resultCount} data-testid="pi-point-search-count">
            {results.length} PI Points {hasMoreResults ? 'exibidos' : 'encontrados'}
          </p>
          <ul className={styles.results} data-testid="pi-point-search-results">
            {results.map((result) => (
              <li key={result.webId ?? `${result.name}-${result.path ?? ''}`}>
                <button
                  type="button"
                  className={selected?.webId === result.webId ? styles.resultSelected : styles.result}
                  data-testid={`pi-point-result-${result.webId ?? result.name}`}
                  draggable
                  title={`Arraste ${result.name} para o display`}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData(PI_POINT_DRAG_MIME, serializePiPointDragData(result));
                    event.dataTransfer.setData('text/plain', result.name);
                    const dragImage = document.createElement('span');
                    dragImage.style.position = 'fixed';
                    dragImage.style.width = '1px';
                    dragImage.style.height = '1px';
                    dragImage.style.opacity = '0';
                    dragImage.style.pointerEvents = 'none';
                    document.body.appendChild(dragImage);
                    if (typeof event.dataTransfer.setDragImage === 'function') {
                      event.dataTransfer.setDragImage(dragImage, 0, 0);
                    } else {
                      dragImage.remove();
                    }
                    requestAnimationFrame(() => dragImage.remove());
                    setSelected(result);
                    onSelect?.(result);
                  }}
                  onClick={() => {
                    setSelected(result);
                    onSelect?.(result);
                  }}
                >
                  <span className={styles.resultName}>{result.name}</span>
                  {(result.description || result.pointType || result.engineeringUnit) && (
                    <span className={styles.resultMetadata}>
                      {[result.description, result.pointType, result.engineeringUnit].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selected && (
        <p data-testid="pi-point-selected">
          Tag selecionada: {selected.name}
        </p>
      )}

      {filtersOpen && (
        <PiPointSearchDialog
          isOpen={filtersOpen}
          onClose={onCloseFilters ?? (() => {})}
          onSelect={onSelect}
          onApplyResults={handleApplyDialogResults}
          initialTerm={term}
        />
      )}
    </section>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: ${theme.spacing(0.75, 1.5, 1.5)};
    color: var(--text-secondary);
  `,
  form: css`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  `,
  label: css`
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `,
  inputRow: css`
    display: flex;
    min-width: 0;
    height: 30px;
  `,
  input: css`
    min-width: 0;
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    padding: ${theme.spacing(0.5, 0.75)};
    border: 1px solid var(--border-color);
    border-right: 0;
    border-radius: 0;
    outline: none;
    background: var(--input-bg) !important;
    color: var(--text-primary) !important;

    &::placeholder {
      color: var(--text-secondary) !important;
      opacity: 1 !important;
    }

    &:focus {
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent), 0 0 0 2px var(--focus-ring);
    }

    &:-webkit-autofill,
    &:-webkit-autofill:hover, 
    &:-webkit-autofill:focus, 
    &:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 30px var(--input-bg) inset !important;
      -webkit-text-fill-color: var(--text-primary) !important;
    }
  `,
  button: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    flex: 0 0 34px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 0;
    background: var(--button-bg) !important;
    color: var(--text-secondary) !important;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--text-primary);
      background: var(--button-hover);
    }

    &:disabled {
      cursor: default;
      opacity: 0.55;
    }
  `,
  results: css`
    flex: 0 1 auto;
    max-height: 280px;
    min-height: 0;
    margin: ${theme.spacing(1, 0, 0)};
    padding: 0;
    overflow-y: auto;
    list-style: none;
    border-top: 1px solid var(--border-color);
  `,
  filteredEmpty: css`
    margin: ${theme.spacing(1, 0, 0)};
    color: var(--text-secondary);
    font-size: 12px;
  `,
  resultCount: css`
    margin: ${theme.spacing(1, 0, 0)};
    color: var(--text-secondary);
    font-size: 12px;
  `,
  result: css`
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    border-radius: 0;
    background: transparent;
    color: var(--accent);
    text-align: left;
    cursor: grab;

    display: flex;
    flex-direction: column;
    gap: 2px;

    &:hover {
      background: var(--button-hover);
    }
  `,
  resultSelected: css`
    width: 100%;
    padding: 7px 8px;
    border: 1px solid var(--accent);
    border-radius: 0;
    background: var(--selection-bg);
    color: var(--accent);
    text-align: left;
    cursor: grab;

    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  resultName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  resultMetadata: css`
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
});

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </svg>
  );
}
