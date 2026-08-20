import React, { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { PiDataLinkFunctionType } from './PiDataLinkToolbar';
import { searchPiPointsWithStatus } from '../../pi';
import { parseCellAddress, parseRangeAddresses } from './miniSheetFormula';

interface PiDataLinkFunctionDialogProps {
  embedded?: boolean;
  functionType: PiDataLinkFunctionType;
  initialTargetCell: string;
  currentSelectionAddress?: string;
  onInsert: (formula: string, targetCell: string) => void;
  onClose: () => void;
}

type SelectableField =
  | 'tag'
  | 'expression'
  | 'timestamp'
  | 'startTime'
  | 'endTime'
  | 'interval'
  | 'timestampsRange'
  | 'calcInterval'
  | 'targetCell';

export function PiDataLinkFunctionDialog({
  embedded = false,
  functionType,
  initialTargetCell,
  currentSelectionAddress,
  onInsert,
  onClose,
}: PiDataLinkFunctionDialogProps) {
  const styles = useStyles2(getStyles);

  const [tag, setTag] = useState('');
  const [targetCell, setTargetCell] = useState(initialTargetCell);
  const [startTime, setStartTime] = useState('*-8h');
  const [endTime, setEndTime] = useState('*');
  const [timestamp, setTimestamp] = useState('*-1h');
  const [interval, setInterval] = useState('5m');
  const [calcInterval, setCalcInterval] = useState('');
  const [calculation, setCalculation] = useState('Average');
  const [mode, setMode] = useState('Interpolated');
  const [timestampsRange, setTimestampsRange] = useState(currentSelectionAddress ?? 'A1:A4');
  const [expression, setExpression] = useState("'TAG' > 50");
  const [unit, setUnit] = useState('hours');
  const [maxCount, setMaxCount] = useState('500');
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [currValTimestampPosition, setCurrValTimestampPosition] = useState<'none' | 'left' | 'above'>('none');
  const [selectionField, setSelectionField] = useState<SelectableField | null>(null);
  const [selectionBaselineAddress, setSelectionBaselineAddress] = useState<string | null>(null);
  const targetCellInputRef = useRef<HTMLInputElement>(null);

  // Autocomplete state
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!tag.trim() || parseCellAddress(tag) || parseRangeAddresses(tag).length > 0 || tag.includes("'") || tag.includes('"')) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchPiPointsWithStatus({ term: tag.trim(), limit: 10 })
        .then((res) => {
          if (active) {
            setSearchResults(res.results.map((r) => r.name));
            setShowSuggestions(res.results.length > 0);
          }
        })
        .catch(() => {
          if (active) setSearchResults([]);
        })
        .finally(() => {
          if (active) setIsSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tag]);

  const activateSelectionField = (field: SelectableField) => {
    setSelectionField(field);
    setSelectionBaselineAddress(currentSelectionAddress ?? null);
  };
  const isSelectionFieldActive = (field: SelectableField) => selectionField === field;

  useEffect(() => {
    if (!selectionField || !currentSelectionAddress || currentSelectionAddress === selectionBaselineAddress) {
      return;
    }

    const selectedValue = currentSelectionAddress;

    switch (selectionField) {
      case 'tag': setTag(selectedValue); break;
      case 'expression': setExpression(selectedValue); break;
      case 'timestamp': setTimestamp(selectedValue); break;
      case 'startTime': setStartTime(selectedValue); break;
      case 'endTime': setEndTime(selectedValue); break;
      case 'interval': setInterval(selectedValue); break;
      case 'timestampsRange': setTimestampsRange(selectedValue); break;
      case 'calcInterval': setCalcInterval(selectedValue); break;
      case 'targetCell': setTargetCell(selectedValue); break;
    }
    setSelectionBaselineAddress(currentSelectionAddress);
  }, [currentSelectionAddress, selectionBaselineAddress, selectionField]);

  const formatParam = (val: string, fallback = '') => {
    const trimmed = (val || fallback).trim();
    if (!trimmed) return '""';
    if (parseCellAddress(trimmed)) {
      return trimmed;
    }
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length === 2 && parseCellAddress(parts[0]) && parseCellAddress(parts[1])) {
        return trimmed;
      }
    }
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed;
    }
    return `"${trimmed}"`;
  };

  const previewFormula = useMemo(() => {
    switch (functionType) {
      case 'PICurrVal': {
        const pTag = formatParam(tag, 'TAG');
        return currValTimestampPosition === 'none'
          ? `=PICurrVal(${pTag})`
          : `=PICurrVal(${pTag}, "${currValTimestampPosition}")`;
      }
      case 'PIArcVal': {
        const pTag = formatParam(tag, 'TAG');
        const pTime = formatParam(timestamp, '*-1h');
        const pMode = formatParam(mode, 'Interpolated');
        return `=PIArcVal(${pTag}, ${pTime}, ${pMode})`;
      }
      case 'PICompDat': {
        const pTag = formatParam(tag, 'TAG');
        const pStart = formatParam(startTime, '*-1h');
        const pEnd = formatParam(endTime, '*');
        const pMax = maxCount ? formatParam(maxCount) : '';
        const pShow = showTimestamp ? '' : ', false';
        return `=PICompDat(${pTag}, ${pStart}, ${pEnd}${pMax ? `, ${pMax}` : ''}${pShow})`;
      }
      case 'PISampDat': {
        const pTag = formatParam(tag, 'TAG');
        const pStart = formatParam(startTime, '*-8h');
        const pEnd = formatParam(endTime, '*');
        const pInt = formatParam(interval, '5m');
        const pShow = showTimestamp ? '' : ', false';
        return `=PISampDat(${pTag}, ${pStart}, ${pEnd}, ${pInt}${pShow})`;
      }
      case 'PITimeDat': {
        const pTag = formatParam(tag, 'TAG');
        const pRange = formatParam(timestampsRange, 'A1:A4');
        const pMode = mode !== 'Interpolated' ? `, ${formatParam(mode)}` : '';
        return `=PITimeDat(${pTag}, ${pRange}${pMode})`;
      }
      case 'PIAdvCalcVal': {
        const pTag = formatParam(tag, 'TAG');
        const pStart = formatParam(startTime, '*-8h');
        const pEnd = formatParam(endTime, '*');
        const pCalc = formatParam(calculation, 'Average');
        const pInt = calcInterval ? `, ${formatParam(calcInterval)}` : '';
        return `=PIAdvCalcVal(${pTag}, ${pStart}, ${pEnd}, ${pCalc}${pInt})`;
      }
      case 'PITimeFilter': {
        const pExpr = formatParam(expression, "'TAG' > 50");
        const pStart = formatParam(startTime, '*-8h');
        const pEnd = formatParam(endTime, '*');
        const pUnit = formatParam(unit, 'hours');
        return `=PITimeFilter(${pExpr}, ${pStart}, ${pEnd}, ${pUnit})`;
      }
      default:
        return '';
    }
  }, [
    calcInterval,
    calculation,
    currValTimestampPosition,
    endTime,
    expression,
    functionType,
    interval,
    maxCount,
    mode,
    showTimestamp,
    startTime,
    tag,
    timestamp,
    timestampsRange,
    unit,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInsert(previewFormula, targetCell.trim() || initialTargetCell);
  };

  const getTitle = () => {
    switch (functionType) {
      case 'PICurrVal':
        return 'Valor atual (PICurrVal)';
      case 'PIArcVal':
        return 'Valor de Archive (PIArcVal)';
      case 'PICompDat':
        return 'Dados compactados (PICompDat)';
      case 'PISampDat':
        return 'Dados de amostragem (PISampDat)';
      case 'PITimeDat':
        return 'Dados com marcação de tempo (PITimeDat)';
      case 'PIAdvCalcVal':
        return 'Dados calculados (PIAdvCalcVal)';
      case 'PITimeFilter':
        return 'Tempo Filtrado (PITimeFilter)';
    }
  };

  return (
    <div className={embedded ? styles.embeddedShell : styles.dialogBackdrop} role={embedded ? undefined : 'presentation'} onClick={embedded ? undefined : onClose}>
      <form
        className={embedded ? styles.embeddedDialog : styles.dialog}
        role={embedded ? undefined : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-labelledby="datalink-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={embedded ? styles.embeddedHeader : styles.header}>
          <h3 id="datalink-dialog-title" className={styles.title}>
            {getTitle()}
          </h3>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Fechar"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className={embedded ? styles.embeddedBody : styles.body}>
          {functionType !== 'PITimeFilter' ? (
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="datalink-tag">
                Item de dados (PI Point ou Célula)
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="datalink-tag"
                  className={`${styles.input} ${isSelectionFieldActive('tag') ? styles.inputSelectingRange : ''}`}
                  value={tag}
                  placeholder="Ex: LFS_RB2_TEMP ou A1"
                  onChange={(e) => {
                    setTag(e.target.value);
                    setSelectionField(null);
                    setSelectionBaselineAddress(null);
                  }}
                  onFocus={() => {
                    activateSelectionField('tag');
                    if (searchResults.length > 0) setShowSuggestions(true);
                  }}
                />
                {isSearching && <span className={styles.searchIndicator}>...</span>}
                {showSuggestions && searchResults.length > 0 && (
                  <ul className={styles.suggestionsList} role="listbox">
                    {searchResults.map((res) => (
                      <li
                        key={res}
                        role="option"
                        aria-selected="false"
                        className={styles.suggestionItem}
                        onClick={() => {
                          setTag(res);
                          setShowSuggestions(false);
                        }}
                      >
                        {res}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="datalink-expr">
                Expressão booleana
              </label>
              <input
                id="datalink-expr"
                className={`${styles.input} ${isSelectionFieldActive('expression') ? styles.inputSelectingRange : ''}`}
                value={expression}
                placeholder="Ex: 'LFS_RB2_TEMP' > 50"
                onFocus={() => activateSelectionField('expression')}
                onChange={(e) => {
                  setExpression(e.target.value);
                  setSelectionField(null);
                  setSelectionBaselineAddress(null);
                }}
              />
            </div>
          )}

          {functionType === 'PIArcVal' && (
            <>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="datalink-timestamp">
                  Timestamp (PI Time ou Célula)
                </label>
                <input
                  id="datalink-timestamp"
                  className={`${styles.input} ${isSelectionFieldActive('timestamp') ? styles.inputSelectingRange : ''}`}
                  value={timestamp}
                  placeholder="Ex: *-1h, 19/08/2026 12:00 ou B1"
                  onFocus={() => activateSelectionField('timestamp')}
                  onChange={(e) => {
                    setTimestamp(e.target.value);
                    setSelectionField(null);
                    setSelectionBaselineAddress(null);
                  }}
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="datalink-mode">
                  Modo de recuperação
                </label>
                <select
                  id="datalink-mode"
                  className={styles.select}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="Interpolated">Interpolated</option>
                  <option value="At or before">At or before</option>
                  <option value="At or after">At or after</option>
                  <option value="Exact">Exact</option>
                </select>
              </div>
            </>
          )}

          {functionType === 'PICurrVal' && (
            <fieldset className={styles.radioGroup}>
              <legend className={styles.radioLegend}>Timestamp</legend>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="curr-val-timestamp-position"
                  value="none"
                  checked={currValTimestampPosition === 'none'}
                  onChange={() => setCurrValTimestampPosition('none')}
                />
                <span>Sem time stamp</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="curr-val-timestamp-position"
                  value="left"
                  checked={currValTimestampPosition === 'left'}
                  onChange={() => setCurrValTimestampPosition('left')}
                />
                <span>Time stamp à esquerda</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="curr-val-timestamp-position"
                  value="above"
                  checked={currValTimestampPosition === 'above'}
                  onChange={() => setCurrValTimestampPosition('above')}
                />
                <span>Time stamp acima</span>
              </label>
            </fieldset>
          )}

          {(functionType === 'PICompDat' ||
            functionType === 'PISampDat' ||
            functionType === 'PIAdvCalcVal' ||
            functionType === 'PITimeFilter') && (
            <div className={styles.gridTwoCols}>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="datalink-start-time">
                  Tempo inicial
                </label>
                <input
                  id="datalink-start-time"
                  className={`${styles.input} ${isSelectionFieldActive('startTime') ? styles.inputSelectingRange : ''}`}
                  value={startTime}
                  placeholder="Ex: *-8h ou A2"
                  onFocus={() => activateSelectionField('startTime')}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setSelectionField(null);
                    setSelectionBaselineAddress(null);
                  }}
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="datalink-end-time">
                  Tempo final
                </label>
                <input
                  id="datalink-end-time"
                  className={`${styles.input} ${isSelectionFieldActive('endTime') ? styles.inputSelectingRange : ''}`}
                  value={endTime}
                  placeholder="Ex: * ou A3"
                  onFocus={() => activateSelectionField('endTime')}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setSelectionField(null);
                    setSelectionBaselineAddress(null);
                  }}
                />
              </div>
            </div>
          )}

          {functionType === 'PISampDat' && (
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="datalink-interval">
                Intervalo
              </label>
              <input
                id="datalink-interval"
                className={`${styles.input} ${isSelectionFieldActive('interval') ? styles.inputSelectingRange : ''}`}
                value={interval}
                placeholder="Ex: 5m, 1h ou A4"
                onFocus={() => activateSelectionField('interval')}
                onChange={(e) => {
                  setInterval(e.target.value);
                  setSelectionField(null);
                  setSelectionBaselineAddress(null);
                }}
              />
            </div>
          )}

          {functionType === 'PITimeDat' && (
            <>
              <div className={styles.formRow}>
                <div className={styles.labelWithAction}>
                  <label className={styles.label} htmlFor="datalink-range">
                    Range de timestamps
                  </label>
                  {currentSelectionAddress && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => {
                        activateSelectionField('timestampsRange');
                        setTimestampsRange(currentSelectionAddress);
                      }}
                    >
                      Usar seleção ({currentSelectionAddress})
                    </button>
                  )}
                </div>
                <input
                  id="datalink-range"
                  className={`${styles.input} ${isSelectionFieldActive('timestampsRange') ? styles.inputSelectingRange : ''}`}
                  value={timestampsRange}
                  placeholder="Ex: A1:A10"
                  onFocus={() => activateSelectionField('timestampsRange')}
                  onChange={(e) => {
                    setTimestampsRange(e.target.value);
                    setSelectionField(null);
                    setSelectionBaselineAddress(null);
                  }}
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="datalink-timed-mode">
                  Modo
                </label>
                <select
                  id="datalink-timed-mode"
                  className={styles.select}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="Interpolated">Interpolated</option>
                  <option value="Actual">Actual (Recorded)</option>
                </select>
              </div>
            </>
          )}

          {functionType === 'PIAdvCalcVal' && (
            <div className={styles.gridTwoCols}>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="datalink-calc">
                  Cálculo
                </label>
                <select
                  id="datalink-calc"
                  className={styles.select}
                  value={calculation}
                  onChange={(e) => setCalculation(e.target.value)}
                >
                  <option value="Average">Média (Average)</option>
                  <option value="Minimum">Mínimo (Minimum)</option>
                  <option value="Maximum">Máximo (Maximum)</option>
                  <option value="Total">Total</option>
                  <option value="StdDev">Desvio padrão (StdDev)</option>
                  <option value="Range">Amplitude (Range)</option>
                  <option value="Count">Contagem (Count)</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="datalink-calc-interval">
                  Intervalo (opcional)
                </label>
                <input
                  id="datalink-calc-interval"
                  className={`${styles.input} ${isSelectionFieldActive('calcInterval') ? styles.inputSelectingRange : ''}`}
                  value={calcInterval}
                  placeholder="Ex: 1h (para série) ou vazio"
                  onFocus={() => activateSelectionField('calcInterval')}
                  onChange={(e) => {
                    setCalcInterval(e.target.value);
                    setSelectionField(null);
                    setSelectionBaselineAddress(null);
                  }}
                />
              </div>
            </div>
          )}

          {functionType === 'PITimeFilter' && (
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="datalink-unit">
                Unidade de retorno
              </label>
              <select
                id="datalink-unit"
                className={styles.select}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                <option value="hours">Horas (hours)</option>
                <option value="minutes">Minutos (minutes)</option>
                <option value="seconds">Segundos (seconds)</option>
                <option value="days">Dias (days)</option>
                <option value="percent">Porcentagem (percent)</option>
              </select>
            </div>
          )}

          {functionType === 'PICompDat' && (
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="datalink-max-count">
                Máximo de valores
              </label>
              <input
                id="datalink-max-count"
                className={styles.input}
                value={maxCount}
                type="number"
                min={1}
                max={5000}
                onChange={(e) => setMaxCount(e.target.value)}
              />
            </div>
          )}

          {(functionType === 'PICompDat' || functionType === 'PISampDat') && (
            <div className={styles.checkboxRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showTimestamp}
                  onChange={(e) => setShowTimestamp(e.target.checked)}
                />
                <span>Mostrar coluna de timestamp</span>
              </label>
            </div>
          )}

          <div className={styles.formRow}>
            <div className={styles.labelWithAction}>
              <label className={styles.label} htmlFor="datalink-target-cell">
                Célula de saída
              </label>
              {currentSelectionAddress && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setTargetCell(currentSelectionAddress);
                    activateSelectionField('targetCell');
                    targetCellInputRef.current?.focus();
                  }}
                >
                  Usar seleção ({currentSelectionAddress})
                </button>
              )}
            </div>
            <input
              id="datalink-target-cell"
              ref={targetCellInputRef}
              className={`${styles.input} ${isSelectionFieldActive('targetCell') ? styles.inputSelectingRange : ''}`}
              value={targetCell}
              placeholder="Ex: B4"
              onFocus={() => activateSelectionField('targetCell')}
              onChange={(e) => {
                setTargetCell(e.target.value);
                setSelectionField(null);
                setSelectionBaselineAddress(null);
              }}
            />
          </div>

          <div className={styles.previewBox}>
            <span className={styles.previewLabel}>Fórmula gerada:</span>
            <code className={styles.previewCode} data-testid="datalink-preview-formula">
              {previewFormula}
            </code>
          </div>
        </div>

        <div className={embedded ? styles.embeddedFooter : styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            data-testid="datalink-dialog-insert"
          >
            Inserir
          </button>
        </div>
      </form>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  embeddedShell: css({
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    minHeight: 0,
    borderBottom: '1px solid var(--border-color, #2b394a)',
    background: 'var(--surface-primary, #111923)',
  }),
  embeddedDialog: css({
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    minHeight: 0,
    color: 'var(--text-primary, #f1f2f5)',
    background: 'var(--surface-primary, #111923)',
  }),
  embeddedHeader: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-subtle, #2b394a)',
    color: 'var(--text-primary, #f1f2f5)',
  }),
  embeddedBody: css({
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    gap: '6px',
    minHeight: 0,
    padding: '8px 16px',
    overflow: 'hidden',
    background: 'var(--surface-primary, #111923)',
    color: 'var(--text-primary, #f1f2f5)',
  }),
  embeddedFooter: css({
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '8px 16px',
    borderTop: '1px solid var(--border-subtle, #2b394a)',
    background: 'var(--surface-secondary, #18212d)',
  }),
  dialogBackdrop: css({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(3px)',
  }),
  dialog: css({
    background: 'var(--surface-elevated, #18212d)',
    color: 'var(--text-primary, #f1f2f5)',
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: '6px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    width: '460px',
    maxWidth: '92vw',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'fadeIn 0.15s ease-out',
  }),
  header: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--assets-header-bg, linear-gradient(105deg, rgba(156, 31, 119, 0.92), rgba(95, 26, 79, 0.8)))',
    borderBottom: '1px solid var(--border-color, #2b394a)',
    color: 'var(--assets-header-text, #ffffff)',
  }),
  title: css({
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffffff',
  }),
  closeButton: css({
    background: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.8)',
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: 1,
    padding: '4px 6px',
    borderRadius: '4px',
    '&:hover': {
      color: '#ffffff',
      background: 'rgba(255, 255, 255, 0.15)',
    },
  }),
  body: css({
    padding: '16px',
    background: 'var(--surface-primary, #111923)',
    color: 'var(--text-primary, #f1f2f5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '75vh',
    overflowY: 'auto',
  }),
  formRow: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  }),
  radioGroup: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    margin: 0,
    padding: '8px 10px',
    border: '1px solid var(--border-subtle, #2b394a)',
    borderRadius: '4px',
  }),
  radioLegend: css({
    padding: '0 4px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary, #aeb3bf)',
  }),
  radioLabel: css({
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '13px',
    color: 'var(--text-primary, #f1f2f5)',
    cursor: 'pointer',
    '& input': { margin: 0 },
  }),
  gridTwoCols: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  }),
  label: css({
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary, #aeb3bf)',
  }),
  labelWithAction: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }),
  linkButton: css({
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '11px',
    color: 'var(--accent, #d33b91)',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontWeight: 500,
    '&:hover': {
      color: 'var(--accent-hover, #ed62ad)',
    },
  }),
  inputWrapper: css({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  }),
  input: css({
    width: '100%',
    minHeight: '30px',
    padding: '4px 8px',
    fontSize: '12px',
    color: 'var(--text-primary, #f1f2f5)',
    background: 'var(--input-bg, #0c1521)',
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: '4px',
    boxSizing: 'border-box',
    outline: 'none',
    '&:focus': {
      borderColor: 'var(--accent, #d33b91)',
      boxShadow: '0 0 0 2px var(--focus-ring, rgba(237, 98, 173, 0.34))',
    },
  }),
  inputSelectingRange: css({
    borderColor: 'var(--accent, #d33b91)',
    boxShadow: '0 0 0 2px var(--focus-ring, rgba(237, 98, 173, 0.34))',
  }),
  select: css({
    width: '100%',
    minHeight: '30px',
    padding: '4px 8px',
    fontSize: '12px',
    color: 'var(--text-primary, #f1f2f5)',
    background: 'var(--input-bg, #0c1521)',
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: '4px',
    boxSizing: 'border-box',
    cursor: 'pointer',
    outline: 'none',
    '&:focus': {
      borderColor: 'var(--accent, #d33b91)',
      boxShadow: '0 0 0 2px var(--focus-ring, rgba(237, 98, 173, 0.34))',
    },
  }),
  searchIndicator: css({
    position: 'absolute',
    right: '8px',
    fontSize: '11px',
    color: 'var(--text-muted, #7f8a9a)',
  }),
  suggestionsList: css({
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: 'var(--surface-elevated, #18212d)',
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: '4px',
    marginTop: '2px',
    maxHeight: '160px',
    overflowY: 'auto',
    zIndex: 10,
    listStyle: 'none',
    padding: 0,
    margin: 0,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  }),
  suggestionItem: css({
    padding: '8px 10px',
    fontSize: '12px',
    color: 'var(--text-primary, #f1f2f5)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-subtle, #202d3c)',
    '&:last-child': {
      borderBottom: 'none',
    },
    '&:hover': {
      background: 'var(--selection-bg, rgba(211, 59, 145, 0.18))',
      color: 'var(--accent-hover, #ed62ad)',
    },
  }),
  checkboxRow: css({
    display: 'flex',
    alignItems: 'center',
    marginTop: '4px',
  }),
  checkboxLabel: css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-primary, #f1f2f5)',
    cursor: 'pointer',
  }),
  previewBox: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '7px 10px',
    background: 'var(--surface-secondary, #151e2a)',
    border: '1px solid var(--border-subtle, #202d3c)',
    borderRadius: '5px',
  }),
  previewLabel: css({
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: 'var(--text-muted, #7f8a9a)',
  }),
  previewCode: css({
    fontFamily: "'JetBrains Mono', Consolas, monospace",
    fontSize: '12px',
    color: 'var(--accent-hover, #ed62ad)',
    wordBreak: 'break-all',
  }),
  footer: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '12px 16px',
    background: 'var(--surface-secondary, #151e2a)',
    borderTop: '1px solid var(--border-color, #2b394a)',
  }),
  cancelButton: css({
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-primary, #f1f2f5)',
    background: 'var(--button-bg, #172231)',
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: '4px',
    cursor: 'pointer',
    '&:hover': {
      background: 'var(--button-hover, #223146)',
    },
  }),
  submitButton: css({
    padding: '6px 18px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--accent-contrast, #ffffff)',
    background: 'var(--accent, #d33b91)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    '&:hover': {
      background: 'var(--accent-hover, #ed62ad)',
    },
  }),
});
