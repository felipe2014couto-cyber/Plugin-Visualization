import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  INDUSTRIAL_SYMBOL_CATEGORIES,
  filterIndustrialSymbols,
  getIndustrialSymbolAssetUrl,
  type IndustrialSymbolCategory,
} from '../../library';
import { LIBRARY_SYMBOL_DRAG_MIME, serializeLibrarySymbolDragData } from '../../library/librarySymbolDrag';

export function LibraryPanel() {
  const styles = useStyles2(getStyles);
  const [term, setTerm] = useState('');
  const [expanded, setExpanded] = useState<IndustrialSymbolCategory[]>(['Instrumentação']);
  const filteredSymbols = useMemo(() => filterIndustrialSymbols(term), [term]);
  const symbolsByCategory = useMemo(() => new Map(
    INDUSTRIAL_SYMBOL_CATEGORIES.map((category) => [
      category,
      filteredSymbols.filter((symbol) => symbol.category === category),
    ]),
  ), [filteredSymbols]);

  const toggleCategory = (category: IndustrialSymbolCategory) => {
    setExpanded((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category]);
  };

  return (
    <section className={styles.container} data-testid="library-panel" aria-label="Library">
      <form className={styles.searchForm} onSubmit={(event) => event.preventDefault()}>
        <label className={styles.visuallyHidden} htmlFor="library-symbol-search">Pesquisar símbolos</label>
        <div className={styles.searchRow}>
          <input
            id="library-symbol-search"
            className={styles.searchInput}
            data-testid="library-symbol-search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Pesquisar símbolos..."
          />
          <span className={styles.searchButton} aria-hidden="true"><SearchIcon /></span>
        </div>
      </form>
      <div className={styles.catalog} data-testid="library-symbol-catalog">
        {INDUSTRIAL_SYMBOL_CATEGORIES.map((category) => {
          const symbols = symbolsByCategory.get(category) ?? [];
          const isExpanded = expanded.includes(category);
          return (
            <section key={category} className={styles.category} data-testid={`library-category-${category}`}>
              <button
                type="button"
                className={styles.categoryButton}
                aria-expanded={isExpanded}
                onClick={() => toggleCategory(category)}
              >
                <ChevronIcon expanded={isExpanded} />
                <span>{category}</span>
                <span className={styles.categoryCount}>{symbols.length}</span>
              </button>
              {isExpanded && (
                symbols.length > 0 ? (
                  <div className={styles.cards}>
                    {symbols.map((symbol) => (
                      <button
                        key={symbol.id}
                        type="button"
                        className={styles.card}
                        draggable
                        title={`Arraste ${symbol.name} (${symbol.library || symbol.source}) para o display`}
                        data-testid={`library-symbol-${symbol.id}`}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData(LIBRARY_SYMBOL_DRAG_MIME, serializeLibrarySymbolDragData(symbol));
                          event.dataTransfer.setData('text/plain', symbol.name);
                        }}
                      >
                        <span className={styles.symbolPreview}>
                          <img className={symbol.source === 'openclipart' || symbol.source === 'pims-vision' ? styles.coloredImage : styles.technicalImage} src={getIndustrialSymbolAssetUrl(symbol)} alt="" draggable={false} />
                        </span>
                        <span className={styles.cardName}>{symbol.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyCategory}>
                    {term.trim() ? 'Nenhum símbolo encontrado.' : 'Nenhum símbolo incorporado nesta categoria.'}
                  </p>
                )
              )}
            </section>
          );
        })}
        {filteredSymbols.length === 0 && <p className={styles.noResults} data-testid="library-symbols-empty">Nenhum símbolo encontrado.</p>}
        <p className={styles.sourceNote}>Símbolos locais; motores Openclipart em domínio público.</p>
      </div>
    </section>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: hidden;`,
  searchForm: css`flex: 0 0 auto; padding: ${theme.spacing(1.25, 1.5)} 0 ${theme.spacing(1)};`,
  searchRow: css`display: flex; min-width: 0; height: 38px; margin: 0 ${theme.spacing(1.5)}; border: 1px solid var(--border-color); border-radius: 7px; background: var(--input-bg);`,
  searchInput: css`flex: 1; min-width: 0; width: 100%; padding: 0 12px; border: 0; outline: 0; color: var(--text-primary); background: transparent; font-size: 14px; &::placeholder { color: var(--text-muted); } &:focus { box-shadow: inset 0 0 0 1px var(--accent); }`,
  searchButton: css`display: inline-flex; align-items: center; justify-content: center; flex: 0 0 40px; color: var(--text-secondary);`,
  catalog: css`flex: 1; min-height: 0; padding: 0 ${theme.spacing(1.5)} ${theme.spacing(1.5)}; overflow-x: hidden; overflow-y: auto; scrollbar-color: var(--border-color) transparent;`,
  category: css`border-bottom: 1px solid var(--border-subtle);`,
  categoryButton: css`display: flex; align-items: center; width: 100%; min-height: 42px; gap: 8px; padding: 5px 0; border: 0; color: var(--text-primary); background: transparent; cursor: pointer; text-align: left; font-size: 15px; font-weight: 600; &:hover { color: var(--accent-hover); }`,
  categoryCount: css`margin-left: auto; color: var(--text-muted); font-size: 11px; font-weight: 500;`,
  cards: css`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 2px 0 12px;`,
  card: css`display: flex; flex-direction: column; align-items: center; min-width: 0; min-height: 128px; padding: 8px 6px 7px; border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-primary); background: linear-gradient(145deg, var(--surface-secondary), var(--surface-primary)); cursor: grab; text-align: center; &:hover { border-color: var(--accent); background: var(--selection-bg); } &:active { cursor: grabbing; }`,
  symbolPreview: css`display: flex; align-items: center; justify-content: center; width: 100%; height: 86px; margin-bottom: 4px; img { max-width: 76px; max-height: 76px; width: auto; height: auto; }`,
  coloredImage: css`filter: none;`,
  technicalImage: css`filter: invert(1);`,
  cardName: css`max-width: 100%; overflow-wrap: anywhere; color: var(--text-primary); font-size: 12px; line-height: 1.25;`,
  emptyCategory: css`margin: 0; padding: 0 0 12px 26px; color: var(--text-muted); font-size: 11px;`,
  noResults: css`margin: 18px 0; color: var(--text-secondary); font-size: 12px; text-align: center;`,
  sourceNote: css`margin: 16px 0 0; color: var(--text-muted); font-size: 10px; line-height: 1.4;`,
  visuallyHidden: css`position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;`,
});

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={expanded ? 'm5 15 7-7 7 7' : 'm5 9 7 7 7-7'} /></svg>;
}
