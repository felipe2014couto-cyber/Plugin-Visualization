import React, { useEffect, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import {
  getBarChartItems,
  getBarChartVisualOptions,
  type BarChartElement,
  type BarChartLabelMode,
  type BarChartProperties,
  type BarChartScaleMode,
  type BarChartStartMode,
  type BarChartVisualOptions,
} from '../../createBarChart';
import { ColorControl } from './ColorControl';
import { TransparentColorPicker } from './TransparentColorPicker';

export interface BarChartPropertiesPanelProps {
  element: BarChartElement;
  onChange: (patch: Partial<BarChartProperties>) => void;
  onVisualChange: (patch: Partial<BarChartVisualOptions>) => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (index: number, offset: -1 | 1) => void;
}

export function BarChartPropertiesPanel({
  element,
  onChange,
  onVisualChange,
  onRemoveItem,
  onMoveItem,
}: BarChartPropertiesPanelProps) {
  const visual = getBarChartVisualOptions(element);

  const [minText, setMinText] = useState(visual.minimum?.toString() ?? '');
  const [maxText, setMaxText] = useState(visual.maximum?.toString() ?? '');
  const [barStartValueText, setBarStartValueText] = useState(visual.barStartValue?.toString() ?? '0');

  useEffect(() => {
    if (visual.minimum !== undefined && visual.minimum.toString() !== minText) {
      setMinText(visual.minimum.toString());
    }
  }, [visual.minimum]);

  useEffect(() => {
    if (visual.maximum !== undefined && visual.maximum.toString() !== maxText) {
      setMaxText(visual.maximum.toString());
    }
  }, [visual.maximum]);

  useEffect(() => {
    if (visual.barStartValue !== undefined && visual.barStartValue.toString() !== barStartValueText) {
      setBarStartValueText(visual.barStartValue.toString());
    }
  }, [visual.barStartValue]);

  const styles = useStyles2(getStyles);
  const items = getBarChartItems(element);

  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const selectedItem = items[selectedItemIndex] ?? items[0];
  const effectiveIndex = selectedItem ? items.indexOf(selectedItem) : -1;

  const changeItem = (patch: Partial<typeof items[number]>) => {
    if (effectiveIndex < 0) return;
    onChange({
      items: items.map((item, index) =>
        index === effectiveIndex ? { ...item, ...patch } : item
      ),
    });
  };
  return (
    <aside className={styles.panel} data-testid="bar-chart-properties-panel" aria-label="Opções do Gráfico de Barras">
      {/* Header */}
      <div className={styles.heading}>
        <strong>Gráfico de Barras</strong>
      </div>

      {/* Título */}
      <section className={styles.section}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={visual.showTitle}
            onChange={(e) => onVisualChange({ showTitle: e.currentTarget.checked })}
            data-testid="bar-chart-show-title"
          />
          Título
        </label>
        {visual.showTitle && (
          <input
            value={visual.title}
            onChange={(e) => onVisualChange({ title: e.currentTarget.value })}
            placeholder="Título do gráfico"
            data-testid="bar-chart-title-input"
          />
        )}
      </section>

      {/* Estilo e Cores */}
      <section className={styles.section}>
        <strong>Estilo</strong>
        <ColorControl
          label="Cor das barras"
          color={visual.barColor}
          onChange={(barColor) => onVisualChange({ barColor })}
        />
        <ColorControl
          label="Primeiro plano"
          color={visual.foregroundColor}
          onChange={(foregroundColor) => onVisualChange({ foregroundColor })}
        />
        <label>
          Plano de fundo
          <TransparentColorPicker
            color={visual.backgroundColor}
            fallbackColor="#1e2229"
            onChange={(backgroundColor) => onVisualChange({ backgroundColor })}
            testId="bar-chart-background-color"
          />
        </label>
        <ColorControl
          label="Cor do valor"
          color={visual.valueColor}
          onChange={(valueColor) => onVisualChange({ valueColor })}
        />
      </section>

      {/* Orientação */}
      <section className={styles.section}>
        <strong>Orientação</strong>
        <div className={styles.choiceGroup}>
          <button
            type="button"
            className={`${styles.choiceButton} ${visual.orientation === 'vertical' ? styles.choiceButtonActive : ''}`}
            onClick={() => onVisualChange({ orientation: 'vertical' })}
            data-testid="bar-chart-orientation-vertical"
            aria-pressed={visual.orientation === 'vertical'}
          >
            <VerticalBarIcon />
            <span>Vertical</span>
          </button>
          <button
            type="button"
            className={`${styles.choiceButton} ${visual.orientation === 'horizontal' ? styles.choiceButtonActive : ''}`}
            onClick={() => onVisualChange({ orientation: 'horizontal' })}
            data-testid="bar-chart-orientation-horizontal"
            aria-pressed={visual.orientation === 'horizontal'}
          >
            <HorizontalBarIcon />
            <span>Horizontal</span>
          </button>
        </div>
      </section>

      {/* Grade */}
      <section className={styles.section}>
        <strong>Grade</strong>
        <div className={styles.choiceGroup}>
          <button
            type="button"
            className={`${styles.choiceButton} ${visual.gridMode === 'bands' ? styles.choiceButtonActive : ''}`}
            onClick={() => onVisualChange({ gridMode: 'bands' })}
            data-testid="bar-chart-grid-bands"
            aria-pressed={visual.gridMode === 'bands'}
          >
            Bandas
          </button>
          <button
            type="button"
            className={`${styles.choiceButton} ${visual.gridMode === 'lines' ? styles.choiceButtonActive : ''}`}
            onClick={() => onVisualChange({ gridMode: 'lines' })}
            data-testid="bar-chart-grid-lines"
            aria-pressed={visual.gridMode === 'lines'}
          >
            Linhas
          </button>
          <button
            type="button"
            className={`${styles.choiceButton} ${visual.gridMode === 'plain' ? styles.choiceButtonActive : ''}`}
            onClick={() => onVisualChange({ gridMode: 'plain' })}
            data-testid="bar-chart-grid-plain"
            aria-pressed={visual.gridMode === 'plain'}
          >
            Simplificado
          </button>
        </div>
      </section>

      {/* Visibilidade */}
      <section className={styles.section}>
        <strong>Visibilidade</strong>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={visual.showLabel}
            onChange={(e) => onVisualChange({ showLabel: e.currentTarget.checked })}
            data-testid="bar-chart-show-label"
          />
          Rótulo
        </label>
        <label>
          Nome do rótulo
          <select
            value={visual.labelMode}
            onChange={(e) => onVisualChange({ labelMode: e.currentTarget.value as BarChartLabelMode })}
            data-testid="bar-chart-label-mode"
          >
            <option value="default">Nome da tag</option>
            <option value="description">Descrição</option>
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={visual.showValue}
            onChange={(e) => onVisualChange({ showValue: e.currentTarget.checked })}
            data-testid="bar-chart-show-value"
          />
          Valor
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={visual.showScale}
            onChange={(e) => onVisualChange({ showScale: e.currentTarget.checked })}
            data-testid="bar-chart-show-scale"
          />
          Mostrar escala
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={visual.showUnits}
            onChange={(e) => onVisualChange({ showUnits: e.currentTarget.checked })}
            data-testid="bar-chart-show-units"
          />
          Unidades
        </label>
      </section>

      {/* Escala */}
      <section className={styles.section}>
        <strong>Escala</strong>
        <label>
          Casas decimais
          <select
            value={visual.decimals === null || visual.decimals === undefined ? '' : String(visual.decimals)}
            onChange={(e) => onVisualChange({ decimals: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
            data-testid="bar-chart-decimals"
          >
            <option value="">Padrão</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label>
          Intervalo de escala
          <select
            value={visual.scaleMode}
            onChange={(e) => onVisualChange({ scaleMode: e.currentTarget.value as BarChartScaleMode })}
            data-testid="bar-chart-scale-mode"
          >
            <option value="custom">Limites personalizados</option>
            <option value="database">Limites do banco de dados</option>
          </select>
        </label>

        {visual.scaleMode !== 'database' && (
          <>
            {visual.orientation === 'vertical' ? (
              <>
                <label>
                  Acima
                  <input
                    type="number"
                    value={maxText}
                    onChange={(e) => {
                      setMaxText(e.currentTarget.value);
                      const val = Number(e.currentTarget.value);
                      if (e.currentTarget.value === '') {
                        onVisualChange({ maximum: undefined });
                      } else if (Number.isFinite(val)) {
                        onVisualChange({ maximum: val });
                      }
                    }}
                    data-testid="bar-chart-scale-maximum"
                  />
                </label>
                <label>
                  Abaixo
                  <input
                    type="number"
                    value={minText}
                    onChange={(e) => {
                      setMinText(e.currentTarget.value);
                      const val = Number(e.currentTarget.value);
                      if (e.currentTarget.value === '') {
                        onVisualChange({ minimum: undefined });
                      } else if (Number.isFinite(val)) {
                        onVisualChange({ minimum: val });
                      }
                    }}
                    data-testid="bar-chart-scale-minimum"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Esquerda
                  <input
                    type="number"
                    value={minText}
                    onChange={(e) => {
                      setMinText(e.currentTarget.value);
                      const val = Number(e.currentTarget.value);
                      if (e.currentTarget.value === '') {
                        onVisualChange({ minimum: undefined });
                      } else if (Number.isFinite(val)) {
                        onVisualChange({ minimum: val });
                      }
                    }}
                    data-testid="bar-chart-scale-minimum"
                  />
                </label>
                <label>
                  Direita
                  <input
                    type="number"
                    value={maxText}
                    onChange={(e) => {
                      setMaxText(e.currentTarget.value);
                      const val = Number(e.currentTarget.value);
                      if (e.currentTarget.value === '') {
                        onVisualChange({ maximum: undefined });
                      } else if (Number.isFinite(val)) {
                        onVisualChange({ maximum: val });
                      }
                    }}
                    data-testid="bar-chart-scale-maximum"
                  />
                </label>
              </>
            )}
          </>
        )}

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={visual.invertScale}
            onChange={(e) => onVisualChange({ invertScale: e.currentTarget.checked })}
            data-testid="bar-chart-invert-scale"
          />
          Inverter escala
        </label>
      </section>

      <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '10px 0' }} />

      {/* Início da Barra */}
      <section className={styles.section} style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <label>
          Início da Barra
          <select
            value={visual.barStartMode}
            onChange={(e) => onVisualChange({ barStartMode: e.currentTarget.value as BarChartStartMode })}
            data-testid="bar-chart-start-mode"
          >
            <option value="default">Padrão</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        {visual.barStartMode === 'custom' && (
          <label>
            Valor
            <input
              type="number"
              value={barStartValueText}
              onChange={(e) => {
                setBarStartValueText(e.currentTarget.value);
                const val = Number(e.currentTarget.value);
                if (e.currentTarget.value === '') {
                  onVisualChange({ barStartValue: undefined });
                } else if (Number.isFinite(val)) {
                  onVisualChange({ barStartValue: val });
                }
              }}
              data-testid="bar-chart-start-value"
            />
          </label>
        )}
      </section>

      {/* Barras / Tags */}
      <section className={styles.section}>
        <strong>Barras ({items.length})</strong>
        {items.map((item, index) => {
          const displayName = item.customName?.trim() || item.label?.trim() || item.binding.pointName;
          return (
          <div
            className={`${styles.itemRow} ${index === effectiveIndex ? styles.itemRowSelected : ''}`}
            key={`${item.binding.dataSourceUid}-${item.binding.pointName}-${index}`}
          >
            <button
              type="button"
              className={styles.itemName}
              onClick={() => setSelectedItemIndex(index)}
              title={displayName}
            >
              {displayName}
            </button>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onMoveItem(index, -1)}
              title="Mover para cima"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === items.length - 1}
              onClick={() => onMoveItem(index, 1)}
              title="Mover para baixo"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={items.length <= 1}
              onClick={() => onRemoveItem(index)}
              title="Excluir barra"
            >
              Excluir
            </button>
          </div>
        )})}

        {selectedItem && (
          <div className={styles.itemSettings}>
            <label>
              Rótulo individual
              <select
                value={selectedItem.nameMode === 'custom' ? 'custom' : 'default'}
                onChange={(e) => {
                  const mode = e.currentTarget.value as 'default' | 'custom';
                  changeItem({
                    nameMode: mode,
                    ...(mode === 'custom' && !selectedItem.customName ? { customName: selectedItem.binding.pointName } : {}),
                  });
                }}
              >
                <option value="default">Padrão</option>
                <option value="custom">Personalizado</option>
              </select>
            </label>
            {selectedItem.nameMode === 'custom' && (
              <label>
                Nome personalizado
                <input
                  value={selectedItem.customName ?? ''}
                  placeholder={selectedItem.binding.pointName}
                  onChange={(e) => changeItem({ nameMode: 'custom', customName: e.currentTarget.value })}
                  data-testid="bar-chart-item-custom-name"
                />
              </label>
            )}
          </div>
        )}


      </section>
    </aside>
  );
}

function VerticalBarIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
      <rect x="3" y="10" width="3" height="8" rx="1" />
      <rect x="8" y="4" width="3" height="14" rx="1" />
      <rect x="13" y="7" width="3" height="11" rx="1" />
    </svg>
  );
}

function HorizontalBarIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
      <rect x="2" y="3" width="8" height="3" rx="1" />
      <rect x="2" y="8" width="14" height="3" rx="1" />
      <rect x="2" y="13" width="11" height="3" rx="1" />
    </svg>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  panel: css`
    width: 300px;
    flex: 0 0 300px;
    min-height: 0;
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    box-sizing: border-box;
    color: var(--text-primary);
    background: var(--surface-primary);
    border-left: 1px solid var(--border-color);
    font-size: 11px;
  `,
  heading: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    strong {
      font-size: 14px;
    }
    button {
      width: 24px;
      height: 24px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-secondary);
      background: var(--button-bg);
      font-size: 20px;
      line-height: 18px;
      cursor: pointer;
      &:hover {
        color: var(--text-primary);
        background: var(--button-hover);
      }
    }
  `,
  section: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);

    strong {
      font-size: 12px;
      color: var(--text-primary);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      color: var(--text-secondary);
      font-size: 11px;
    }
    input,
    select {
      height: 27px;
      min-height: 27px;
      box-sizing: border-box;
      color: var(--text-primary);
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      border-radius: 2px;
      padding: 2px 6px;
    }
  `,
  check: css`
    flex-direction: row !important;
    align-items: center;
    gap: 6px !important;
    cursor: pointer;
    input {
      width: 14px;
      height: 14px;
      min-height: 14px;
      margin: 0;
    }
  `,
  choiceGroup: css`
    display: flex;
    gap: 6px;
  `,
  choiceButton: css`
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 8px;
    font-size: 11px;
    border: 1px solid var(--border-color);
    background: var(--input-bg);
    color: var(--text-primary);
    border-radius: 3px;
    cursor: pointer;
    &:hover {
      background: var(--button-hover);
    }
  `,
  choiceButtonActive: css`
    border-color: #5794f2 !important;
    background: rgba(87, 148, 242, 0.18) !important;
    color: var(--text-primary) !important;
    font-weight: 600;
  `,
  itemRow: css`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    border: 1px solid transparent;
    border-radius: 2px;
    button {
      border: 1px solid var(--border-color);
      background: var(--input-bg);
      color: var(--text-primary);
      font-size: 11px;
      min-height: 22px;
      padding: 0 5px;
      cursor: pointer;
      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }
  `,
  itemRowSelected: css`
    border-color: var(--accent);
    background: rgba(255, 255, 255, 0.03);
  `,
  itemName: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  `,
  itemSettings: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: var(--selection-bg);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    margin-top: 4px;
  `,
});
