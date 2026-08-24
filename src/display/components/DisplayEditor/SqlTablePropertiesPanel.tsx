import React, { useState } from 'react';
import { css } from '@emotion/css';
import { Input, Switch, Icon } from '@grafana/ui';
import type { SqlTableProperties } from '../../createSqlTable';

export interface SqlTablePropertiesPanelProps {
  properties: SqlTableProperties;
  onChange: (patch: Partial<SqlTableProperties>) => void;
}

const COLOR_PALETTE = [
  '#b4167e', // Magenta Aperam
  '#3274D9', // Azul Grafana
  '#22c55e', // Verde
  '#eab308', // Amarelo
  '#ef4444', // Vermelho
  '#8b5cf6', // Roxo
  '#06b6d4', // Ciano
  '#f97316', // Laranja
  '#ec4899', // Rosa
  '#64748b', // Cinza Slate
  '#ffffff', // Branco
  '#1e293b', // Escuro
];

const STYLE_OPTIONS = [
  { label: 'Automático', value: 'auto' },
  { label: 'Claro', value: 'light' },
  { label: 'Escuro', value: 'dark' },
  { label: 'Listrado', value: 'striped' },
  { label: 'Custom', value: 'custom' },
];

const ALIGN_OPTIONS = [
  { label: 'Esquerda', value: 'left' },
  { label: 'Centro', value: 'center' },
  { label: 'Direita', value: 'right' },
];

export function SqlTablePropertiesPanel({ properties, onChange }: SqlTablePropertiesPanelProps) {
  const styles = getStyles();
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const activeColor = properties.barColor || properties.customHeaderColor || '#b4167e';
  const activeStyle = properties.style ?? 'auto';
  const activeAlign = properties.titleAlign ?? 'left';

  return (
    <aside className={styles.panel} data-testid="sql-table-properties-panel" aria-label="Propriedades do Gráfico">
      <div className={styles.header}>
        <span>Propriedades do Gráfico / Tabela</span>
      </div>

      {/* Seção 1: Configuração do Título */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Título do Objeto</div>
        
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Exibir Título</span>
          <Switch 
            value={properties.showTitle ?? true} 
            onChange={(e) => onChange({ showTitle: e.currentTarget.checked })} 
          />
        </div>

        {(properties.showTitle ?? true) && (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Texto do Título</span>
              <Input 
                value={properties.title || ''} 
                onChange={(e) => onChange({ title: e.currentTarget.value })} 
                placeholder="Resultado da consulta SIP"
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Tamanho da Fonte do Título (px)</span>
              <Input 
                type="number" 
                value={properties.titleFontSize ?? 18} 
                onChange={(e) => onChange({ titleFontSize: Number(e.currentTarget.value) })} 
                min={10}
                max={60}
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Alinhamento do Título</span>
              <div className={styles.segmentGroup}>
                {ALIGN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={activeAlign === opt.value ? styles.segmentButtonActive : styles.segmentButton}
                    onClick={() => onChange({ titleAlign: opt.value as any })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Fundo Transparente no Título</span>
              <Switch 
                value={properties.titleTransparent ?? false} 
                onChange={(e) => onChange({ titleTransparent: e.currentTarget.checked })} 
              />
            </div>
          </>
        )}
      </section>

      {/* Seção 2: Aparência, Eixos e Cores */}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Aparência e Cores</div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Tema / Estilo</span>
          <div className={styles.segmentGroup}>
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={activeStyle === opt.value ? styles.segmentButtonActive : styles.segmentButton}
                onClick={() => onChange({ style: opt.value as any })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Cor do Gráfico</span>
          <span className={styles.fieldDescription}>Cor das barras, linhas de tendência ou pontos</span>
          <div style={{ position: 'relative' }}>
            <div className={styles.colorPickerRow}>
              <button
                type="button"
                className={styles.colorButton}
                onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
              >
                <span className={styles.colorSwatchPreview} style={{ backgroundColor: activeColor }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{activeColor}</span>
                <Icon name="angle-down" />
              </button>
            </div>

            {isColorPickerOpen && (
              <div className={styles.colorDropdown}>
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={styles.colorSwatch}
                    style={{ backgroundColor: c, border: activeColor === c ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
                    onClick={() => {
                      onChange({ barColor: c, customHeaderColor: c });
                      setIsColorPickerOpen(false);
                    }}
                    title={c}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Tamanho dos Dados de Todos os Eixos (px)</span>
          <span className={styles.fieldDescription}>Aumenta o tamanho dos textos nos eixos X/Y, marcas e valores</span>
          <Input 
            type="number" 
            value={properties.fontSize ?? 13} 
            onChange={(e) => onChange({ fontSize: Number(e.currentTarget.value) })} 
            min={8}
            max={48}
          />
        </div>
      </section>
    </aside>
  );
}

function getStyles() { 
  return { 
    panel: css`
      flex: 0 0 310px;
      width: 310px;
      min-width: 0;
      overflow-y: auto;
      overflow-x: hidden;
      border-left: 1px solid var(--border-color);
      background: var(--panel-bg, var(--surface-primary));
      color: var(--text-primary);
      box-sizing: border-box;
    `, 
    header: css`
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between; 
      background: var(--panel-header-bg, var(--surface-secondary));
      color: var(--text-primary);
    `, 
    section: css`
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color);
    `,
    sectionTitle: css`
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-primary);
      opacity: 0.9;
      margin-bottom: 2px;
    `,
    field: css`
      display: flex;
      flex-direction: column;
      gap: 4px;
      input {
        min-height: 32px;
        background: var(--input-bg);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        box-sizing: border-box;
        border-radius: 6px;
      }
    `,
    fieldRow: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    `,
    fieldLabel: css`
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    `,
    fieldDescription: css`
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.3;
      margin-bottom: 2px;
    `,
    segmentGroup: css`
      display: flex;
      background: var(--input-bg, #0c1521);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
      overflow-x: auto;
    `,
    segmentButton: css`
      flex: 1;
      min-width: 0;
      padding: 5px 6px;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      text-align: center;
      transition: all 0.15s ease;

      &:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.06);
      }
    `,
    segmentButtonActive: css`
      flex: 1;
      min-width: 0;
      padding: 5px 6px;
      font-size: 11px;
      font-weight: 600;
      color: #ffffff;
      background: var(--accent, #b4167e);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      text-align: center;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    `,
    colorPickerRow: css`
      display: flex;
      align-items: center;
      gap: 8px;
    `,
    colorButton: css`
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 5px 12px;
      height: 34px;
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      cursor: pointer;
      width: 100%;
      justify-content: space-between;

      &:hover {
        border-color: var(--accent, #b4167e);
      }
    `,
    colorSwatchPreview: css`
      width: 24px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    `,
    colorDropdown: css`
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 6px;
      background: var(--surface-elevated, var(--card-bg, #1e293b));
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      z-index: 100;
      box-shadow: var(--shadow, 0 6px 18px rgba(0, 0, 0, 0.3));
    `,
    colorSwatch: css`
      width: 100%;
      height: 28px;
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
      transition: transform 0.15s, box-shadow 0.15s;

      &:hover {
        transform: scale(1.1);
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
      }
    `,
  }; 
}
