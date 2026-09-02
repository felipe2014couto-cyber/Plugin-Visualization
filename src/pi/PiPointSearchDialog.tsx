import React, { FormEvent, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { searchPiPointsWithStatus, type PiPointSearchResult } from './piDataSource';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from './piPointDrag';

const PI_POINT_TYPES = ['*', 'Float32', 'Float64', 'Int16', 'Int32', 'Digital', 'String', 'Timestamp'];

export interface PiPointSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (result: PiPointSearchResult) => void;
  onApplyResults?: (results: PiPointSearchResult[], hasMore: boolean) => void;
  initialTerm?: string;
  initialDescription?: string;
}

const getPointKey = (point: PiPointSearchResult): string => point.webId ?? point.name;

export function PiPointSearchDialog({
  isOpen,
  onClose,
  onSelect,
  onApplyResults,
  initialTerm = '',
  initialDescription = '',
}: PiPointSearchDialogProps) {
  const styles = useStyles2(getStyles);
  const [tagMask, setTagMask] = useState(initialTerm || '*');
  const [descriptor, setDescriptor] = useState(initialDescription);
  const [pointType, setPointType] = useState('*');
  const [engUnits, setEngUnits] = useState('');
  const [pointSource, setPointSource] = useState('');

  const [results, setResults] = useState<PiPointSearchResult[]>([]);
  const [selectedPoints, setSelectedPoints] = useState<PiPointSearchResult[]>([]);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasMoreResults, setHasMoreResults] = useState(false);

  const selectedKeys = useMemo(() => new Set(selectedPoints.map(getPointKey)), [selectedPoints]);

  if (!isOpen) {
    return null;
  }

  const handleSearch = async (event?: FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    const cleanTag = tagMask.trim();
    const cleanDesc = descriptor.trim();
    const cleanType = pointType === '*' ? '' : pointType.trim();
    const cleanUnits = engUnits.trim();
    const cleanSource = pointSource.trim();

    setStatus('loading');
    setErrorMessage('');
    setSelectedPoints([]);
    setAnchorIndex(null);

    try {
      const response = await searchPiPointsWithStatus({
        term: cleanTag === '*' ? '' : cleanTag,
        description: cleanDesc,
        pointTypes: cleanType ? [cleanType] : [],
        engineeringUnits: cleanUnits ? [cleanUnits] : [],
        pointSources: cleanSource ? [cleanSource] : [],
      });
      setResults(response.results);
      setHasMoreResults(response.hasMore);
      setStatus(response.results.length > 0 ? 'success' : 'empty');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível pesquisar PI Points.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setTagMask('*');
    setDescriptor('');
    setPointType('*');
    setEngUnits('');
    setPointSource('');
    setResults([]);
    setSelectedPoints([]);
    setAnchorIndex(null);
    setStatus('idle');
    setErrorMessage('');
  };

  const handleRowClick = (point: PiPointSearchResult, index: number, event: React.MouseEvent) => {
    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;

    if (isShift && anchorIndex !== null && anchorIndex >= 0 && anchorIndex < results.length) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      const range = results.slice(start, end + 1);

      if (isCtrl) {
        const currentKeys = new Set(selectedPoints.map(getPointKey));
        const merged = [...selectedPoints];
        for (const item of range) {
          const key = getPointKey(item);
          if (!currentKeys.has(key)) {
            currentKeys.add(key);
            merged.push(item);
          }
        }
        setSelectedPoints(merged);
      } else {
        setSelectedPoints(range);
      }
    } else if (isCtrl) {
      const key = getPointKey(point);
      if (selectedKeys.has(key)) {
        setSelectedPoints(selectedPoints.filter((p) => getPointKey(p) !== key));
      } else {
        setSelectedPoints([...selectedPoints, point]);
      }
      setAnchorIndex(index);
    } else {
      setSelectedPoints([point]);
      setAnchorIndex(index);
    }
  };

  const handleConfirmSelection = (pointsToConfirm: PiPointSearchResult[]) => {
    if (pointsToConfirm.length === 0) return;
    onSelect?.(pointsToConfirm[0]);
    onApplyResults?.(pointsToConfirm, false);
    onClose();
  };

  const handleRowDoubleClick = (point: PiPointSearchResult) => {
    const isIncluded = selectedKeys.has(getPointKey(point));
    const toConfirm = isIncluded && selectedPoints.length > 0 ? selectedPoints : [point];
    handleConfirmSelection(toConfirm);
  };

  return (
    <div className={styles.backdrop} onClick={onClose} data-testid="pi-point-search-dialog-backdrop">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pi-search-dialog-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="pi-point-search-dialog"
      >
        <div className={styles.header}>
          <h2 id="pi-search-dialog-title">Pesquisa de tags (PI System)</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Fechar pesquisa de tags"
            title="Fechar"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <form className={styles.searchForm} onSubmit={handleSearch}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Máscara de tag:</span>
                <input
                  className={styles.input}
                  value={tagMask}
                  onChange={(e) => setTagMask(e.target.value)}
                  placeholder="ex: * ou ACI*"
                  data-testid="dialog-tag-mask"
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <label className={styles.field}>
                <span>Descritor:</span>
                <input
                  className={styles.input}
                  value={descriptor}
                  onChange={(e) => setDescriptor(e.target.value)}
                  placeholder="ex: *velocidade*"
                  data-testid="dialog-descriptor"
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <label className={styles.field}>
                <span>Tipo de ponto:</span>
                <select
                  className={styles.select}
                  value={pointType}
                  onChange={(e) => setPointType(e.target.value)}
                  data-testid="dialog-point-type"
                >
                  {PI_POINT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === '*' ? '* (Todos)' : type}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Unidades de Engenharia:</span>
                <input
                  className={styles.input}
                  value={engUnits}
                  onChange={(e) => setEngUnits(e.target.value)}
                  placeholder="ex: °C, bar, %"
                  data-testid="dialog-eng-units"
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <label className={styles.field}>
                <span>Origem do ponto:</span>
                <input
                  className={styles.input}
                  value={pointSource}
                  onChange={(e) => setPointSource(e.target.value)}
                  placeholder="ex: *"
                  data-testid="dialog-point-source"
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>
            </div>

            <div className={styles.actionButtons}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={status === 'loading'}
                data-testid="dialog-search-submit"
              >
                {status === 'loading' ? 'Pesquisando...' : 'Pesquisar'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleReset}
                disabled={status === 'loading'}
                data-testid="dialog-search-reset"
              >
                Reiniciar
              </button>
            </div>
          </form>

          <div className={styles.resultsContainer}>
            <div className={styles.resultsHeader}>
              <span>Resultados da pesquisa</span>
              {results.length > 0 && (
                <span className={styles.resultCount}>
                  {results.length} PI Points {hasMoreResults ? 'exibidos' : 'encontrados'}
                </span>
              )}
            </div>

            {status === 'loading' && (
              <div className={styles.statusMessage} data-testid="dialog-search-loading">
                Pesquisando PI Points no servidor...
              </div>
            )}

            {status === 'error' && (
              <div className={styles.errorMessage} data-testid="dialog-search-error">
                {errorMessage}
              </div>
            )}

            {status === 'empty' && (
              <div className={styles.statusMessage} data-testid="dialog-search-empty">
                Nenhum PI Point encontrado para os filtros informados.
              </div>
            )}

            {status === 'idle' && results.length === 0 && (
              <div className={styles.statusMessage}>
                Defina os critérios e clique em <strong>Pesquisar</strong>.
              </div>
            )}

            {results.length > 0 && (
              <div className={styles.tableWrapper}>
                <table className={styles.table} data-testid="dialog-results-table">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Descritor</th>
                      <th>Tipo</th>
                      <th>Unidade</th>
                      <th>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((point, index) => {
                      const isSelected = selectedKeys.has(getPointKey(point));
                      return (
                        <tr
                          key={point.webId ?? point.name}
                          className={isSelected ? styles.selectedRow : styles.row}
                          onClick={(e) => handleRowClick(point, index, e)}
                          onDoubleClick={() => handleRowDoubleClick(point)}
                          draggable
                          title={`Arraste ${point.name} para o display ou selecione (Ctrl/Shift para múltiplos)`}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'copy';
                            event.dataTransfer.setData(PI_POINT_DRAG_MIME, serializePiPointDragData(point));
                            event.dataTransfer.setData('text/plain', point.name);
                            if (!isSelected) {
                              setSelectedPoints([point]);
                              setAnchorIndex(index);
                            }
                          }}
                          data-testid={`dialog-row-${point.webId ?? point.name}`}
                        >
                          <td className={styles.tagNameCell}>
                            <strong>{point.name}</strong>
                          </td>
                          <td>{point.description || '-'}</td>
                          <td>{point.pointType || '-'}</td>
                          <td>{point.engineeringUnit || '-'}</td>
                          <td>{point.pointSource || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft} data-testid="dialog-selected-info">
            {selectedPoints.length === 0 && <span>Nenhuma tag selecionada</span>}
            {selectedPoints.length === 1 && (
              <span>
                Selecionado: <strong>{selectedPoints[0].name}</strong>
              </span>
            )}
            {selectedPoints.length > 1 && (
              <span>
                <strong>{selectedPoints.length}</strong> PI Points selecionados
              </span>
            )}
          </div>
          <div className={styles.footerRight}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              data-testid="dialog-cancel-button"
            >
              Cancelar
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={selectedPoints.length === 0}
              onClick={() => handleConfirmSelection(selectedPoints)}
              data-testid="dialog-ok-button"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  backdrop: css`
    position: fixed;
    z-index: 999;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(3, 8, 15, 0.76);
  `,
  dialog: css`
    display: flex;
    flex-direction: column;
    width: min(850px, 95vw);
    height: min(650px, 90vh);
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--surface-elevated, var(--panel-bg));
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding: 0 16px;
    color: var(--assets-header-text, #ffffff);
    background: var(--assets-header-bg, #111a25);
    border-bottom: 1px solid var(--border-color);

    h2 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }
  `,
  closeButton: css`
    width: 28px;
    height: 28px;
    border: 0;
    color: rgba(255, 255, 255, 0.8);
    background: transparent;
    cursor: pointer;
    font-size: 24px;
    line-height: 1;

    &:hover {
      color: #ffffff;
    }
  `,
  body: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 14px 16px;
    gap: 12px;
    overflow: hidden;
  `,
  searchForm: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--surface-secondary, rgba(0, 0, 0, 0.15));
    border: 1px solid var(--border-color);
    border-radius: 4px;
  `,
  formGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px 14px;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 4px;

    span {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-secondary);
    }
  `,
  input: css`
    width: 100%;
    height: 28px;
    box-sizing: border-box;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    background: var(--input-bg) !important;
    color: var(--text-primary) !important;
    font-size: 12px;

    &::placeholder {
      color: var(--text-secondary) !important;
      opacity: 0.9;
    }

    &:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 1px var(--accent);
    }

    &:-webkit-autofill,
    &:-webkit-autofill:hover, 
    &:-webkit-autofill:focus, 
    &:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 30px var(--input-bg) inset !important;
      -webkit-text-fill-color: var(--text-primary) !important;
    }
  `,
  select: css`
    width: 100%;
    height: 28px;
    box-sizing: border-box;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    background: var(--input-bg) !important;
    color: var(--text-primary) !important;
    font-size: 12px;

    &:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 1px var(--accent);
    }
  `,
  actionButtons: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
  `,
  primaryButton: css`
    padding: 5px 16px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--accent) !important;
    color: var(--accent-contrast, #ffffff) !important;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--accent-hover, #c42e8d) !important;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `,
  secondaryButton: css`
    padding: 5px 14px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--button-bg, transparent) !important;
    color: var(--text-secondary) !important;
    font-size: 12px;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--text-primary) !important;
      background: var(--button-hover) !important;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `,
  resultsContainer: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--surface-primary, transparent);
    overflow: hidden;
  `,
  resultsHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--border-color);
    background: var(--surface-secondary, rgba(0, 0, 0, 0.08));
    color: var(--text-primary);
  `,
  resultCount: css`
    font-size: 11px;
    font-weight: 400;
    color: var(--text-secondary);
  `,
  statusMessage: css`
    padding: 24px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
  `,
  errorMessage: css`
    padding: 16px;
    color: var(--danger, #f87171);
    font-size: 12px;
    text-align: center;
  `,
  tableWrapper: css`
    flex: 1;
    overflow-y: auto;
  `,
  table: css`
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    user-select: none;

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 6px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      color: var(--text-secondary);
      background: var(--panel-header-bg, var(--surface-secondary));
      border-bottom: 1px solid var(--border-color);
    }

    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--border-subtle);
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      max-width: 250px;
    }
  `,
  row: css`
    cursor: pointer;
    user-select: none;

    &:hover {
      background: var(--button-hover, rgba(255, 255, 255, 0.05));
    }
  `,
  selectedRow: css`
    cursor: pointer;
    user-select: none;
    background: var(--selection-bg, rgba(211, 59, 145, 0.18)) !important;
    color: var(--accent) !important;

    td {
      border-bottom-color: var(--accent);
    }
  `,
  tagNameCell: css`
    color: var(--accent);
  `,
  footer: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-top: 1px solid var(--border-color);
    background: var(--surface-secondary, rgba(0, 0, 0, 0.1));
  `,
  footerLeft: css`
    font-size: 12px;
    color: var(--text-secondary);

    strong {
      color: var(--text-primary);
    }
  `,
  footerRight: css`
    display: flex;
    gap: 8px;
  `,
});
