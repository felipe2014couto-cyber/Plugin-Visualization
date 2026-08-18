import React, { FormEvent, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { searchPiPoints, type PiPointSearchResult } from './piDataSource';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from './piPointDrag';

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface PiPointSearchProps {
  enabled: boolean;
  onSelect?: (result: PiPointSearchResult) => void;
  filtersOpen?: boolean;
}

export function PiPointSearch({ enabled, onSelect, filtersOpen = false }: PiPointSearchProps) {
  const styles = useStyles2(getStyles);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PiPointSearchResult[]>([]);
  const [selected, setSelected] = useState<PiPointSearchResult | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [selectedDescriptions, setSelectedDescriptions] = useState<string[]>([]);
  const [selectedPointTypes, setSelectedPointTypes] = useState<string[]>([]);
  const [selectedEngineeringUnits, setSelectedEngineeringUnits] = useState<string[]>([]);

  const descriptions = useMemo(() => getFilterOptions(results, (result) => result.description), [results]);
  const pointTypes = useMemo(() => getFilterOptions(results, (result) => result.pointType), [results]);
  const engineeringUnits = useMemo(() => getFilterOptions(results, (result) => result.engineeringUnit), [results]);
  const filteredResults = useMemo(() => results.filter((result) => (
    matchesFilter(result.description, selectedDescriptions)
    && matchesFilter(result.pointType, selectedPointTypes)
    && matchesFilter(result.engineeringUnit, selectedEngineeringUnits)
  )), [results, selectedDescriptions, selectedPointTypes, selectedEngineeringUnits]);
  const hasActiveFilters = selectedDescriptions.length > 0 || selectedPointTypes.length > 0 || selectedEngineeringUnits.length > 0;

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
      setSelected(null);
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

      {filtersOpen && (
        <>
          <div className={styles.filters} data-testid="pi-point-search-filters">
            <div className={styles.filterHeader}>
              <span>Filtros</span>
              {hasActiveFilters && (
                <button
                  type="button"
                  className={styles.clearFilters}
                  onClick={() => {
                    setSelectedDescriptions([]);
                    setSelectedPointTypes([]);
                    setSelectedEngineeringUnits([]);
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
            <FilterGroup
              label="Descrição"
              options={descriptions}
              selectedOptions={selectedDescriptions}
              onToggle={(value) => setSelectedDescriptions((current) => toggleFilter(current, value))}
              styles={styles}
              testId="description"
            />
            <FilterGroup
              label="Tipo de dados"
              options={pointTypes}
              selectedOptions={selectedPointTypes}
              onToggle={(value) => setSelectedPointTypes((current) => toggleFilter(current, value))}
              styles={styles}
              testId="point-type"
            />
            <FilterGroup
              label="Unidade de Eng."
              options={engineeringUnits}
              selectedOptions={selectedEngineeringUnits}
              onToggle={(value) => setSelectedEngineeringUnits((current) => toggleFilter(current, value))}
              styles={styles}
              testId="engineering-unit"
            />
          </div>

          {results.length === 0 && status !== 'loading' ? (
            <p className={styles.noFilterOptions} data-testid="pi-point-filter-awaiting-search">
              Pesquise uma tag para carregar as opções de filtro.
            </p>
          ) : filteredResults.length === 0 && (
            <p className={styles.filteredEmpty} data-testid="pi-point-search-filtered-empty">
              Nenhum PI Point corresponde aos filtros.
            </p>
          )}
        </>
      )}

      {results.length > 0 && (
        <>
          <ul className={styles.results} data-testid="pi-point-search-results">
          {filteredResults.map((result) => (
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
    </section>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
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

    &:focus {
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent), 0 0 0 2px var(--focus-ring);
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
    max-height: 320px;
    margin: ${theme.spacing(1, 0, 0)};
    padding: 0;
    overflow: auto;
    list-style: none;
    border-top: 1px solid var(--border-color);
  `,
  filters: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.75)};
    margin-top: ${theme.spacing(1)};
    padding: ${theme.spacing(0.75)};
    border: 1px solid var(--border-subtle);
    background: var(--card-bg);
  `,
  filterHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 600;
  `,
  filterGroup: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
  `,
  filterLabel: css`
    color: var(--text-secondary);
    font-size: 11px;
  `,
  filterOptions: css`
    display: flex;
    flex-direction: column;
    max-height: 88px;
    overflow-y: auto;
  `,
  filterOption: css`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 2px 0;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 12px;

    input {
      margin: 0;
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  noFilterOptions: css`
    color: var(--text-disabled);
    font-size: 11px;
  `,
  clearFilters: css`
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: 11px;
  `,
  filteredEmpty: css`
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

type SearchStyles = ReturnType<typeof getStyles>;

interface FilterGroupProps {
  label: string;
  options: string[];
  selectedOptions: string[];
  onToggle: (value: string) => void;
  styles: SearchStyles;
  testId: string;
}

function FilterGroup({ label, options, selectedOptions, onToggle, styles, testId }: FilterGroupProps) {
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      {options.length > 0 ? (
        <div className={styles.filterOptions} data-testid={`pi-point-filter-${testId}`}>
          {options.map((option) => (
            <label key={option} className={styles.filterOption} title={option}>
              <input
                type="checkbox"
                checked={selectedOptions.includes(option)}
                onChange={() => onToggle(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : (
        <span className={styles.noFilterOptions}>Não informado nos resultados</span>
      )}
    </div>
  );
}

function getFilterOptions(
  results: PiPointSearchResult[],
  getValue: (result: PiPointSearchResult) => string | undefined,
): string[] {
  return [...new Set(results.map(getValue).filter((value): value is string => Boolean(value)))].sort((first, second) => (
    first.localeCompare(second, 'pt-BR', { sensitivity: 'base' })
  ));
}

function matchesFilter(value: string | undefined, selectedValues: string[]): boolean {
  return selectedValues.length === 0 || (value !== undefined && selectedValues.includes(value));
}

function toggleFilter(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 5 5" />
  </svg>;
}
