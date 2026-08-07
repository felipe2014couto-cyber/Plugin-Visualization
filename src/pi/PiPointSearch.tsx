import React, { FormEvent, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { searchPiPoints, type PiPointSearchResult } from './piDataSource';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from './piPointDrag';

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface PiPointSearchProps {
  enabled: boolean;
  onSelect?: (result: PiPointSearchResult) => void;
}

export function PiPointSearch({ enabled, onSelect }: PiPointSearchProps) {
  const styles = useStyles2(getStyles);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PiPointSearchResult[]>([]);
  const [selected, setSelected] = useState<PiPointSearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTerm = term.trim();
    if (!enabled || !normalizedTerm) {
      setStatus(normalizedTerm ? 'error' : 'idle');
      return;
    }

    setStatus('loading');
    try {
      const nextResults = await searchPiPoints(normalizedTerm);
      setResults(nextResults);
      setStatus(nextResults.length > 0 ? 'success' : 'empty');
    } catch {
      setStatus('error');
    }
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
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Pesquisar tag..."
            disabled={!enabled || status === 'loading'}
          />
          <button
            type="submit"
            className={styles.button}
            data-testid="pi-point-search-submit"
            aria-label="Pesquisar"
            title="Pesquisar"
            disabled={!enabled || status === 'loading' || term.trim().length === 0}
          >
            <SearchIcon />
          </button>
        </div>
      </form>

      {status === 'loading' && <p data-testid="pi-point-search-loading">Pesquisando...</p>}
      {status === 'empty' && <p data-testid="pi-point-search-empty">Nenhum PI Point encontrado.</p>}
      {status === 'error' && <p data-testid="pi-point-search-error">Não foi possível pesquisar PI Points.</p>}
      {!enabled && <p data-testid="pi-point-search-disabled">Pesquisa PI indisponível.</p>}

      {results.length > 0 && (
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
                {result.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <p data-testid="pi-point-selected">
          Tag selecionada: {selected.name}
        </p>
      )}
    </section>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: ${theme.spacing(0.75, 1.5, 1.5)};
  `,
  form: css`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  `,
  label: css`
    color: #50657c;
    font-size: 11px;
    font-weight: ${theme.typography.fontWeightMedium};
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
    border: 1px solid #a8b2be;
    border-right: 0;
    border-radius: 0;
    outline: none;
    background: #f4f5f6;
    color: #21364d;

    &:focus {
      border-color: #3978aa;
      box-shadow: inset 0 0 0 1px #3978aa;
    }
  `,
  button: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    flex: 0 0 34px;
    padding: 0;
    border: 1px solid #a8b2be;
    border-radius: 0;
    background: #c6ccd4;
    color: #294762;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: #b5c0cc;
    }

    &:disabled {
      cursor: default;
      opacity: 0.55;
    }
  `,
  results: css`
    max-height: 320px;
    margin: ${theme.spacing(1, 0, 0)};
    padding: 0;
    overflow: auto;
    list-style: none;
    border-top: 1px solid #c4cad1;
  `,
  result: css`
    width: 100%;
    padding: 7px 8px;
    border: 0;
    border-bottom: 1px solid #cbd0d7;
    border-radius: 0;
    background: transparent;
    color: #1d5aa6;
    text-align: left;
    cursor: grab;

    &:hover {
      background: #d2e3f6;
    }
  `,
  resultSelected: css`
    width: 100%;
    padding: 7px 8px;
    border: 1px solid #4d8ce0;
    border-radius: 0;
    background: #b8d2fb;
    color: #173c70;
    text-align: left;
    cursor: grab;
  `,
});

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 5 5" />
  </svg>;
}
