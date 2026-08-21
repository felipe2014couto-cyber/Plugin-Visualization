import React from 'react';
import { css } from '@emotion/css';
import { ColorControl } from './ColorControl';
import type { SqlTableProperties } from '../../createSqlTable';

export interface SqlTablePropertiesPanelProps {
  properties: SqlTableProperties;
  onChange: (patch: Partial<SqlTableProperties>) => void;
}

export function SqlTablePropertiesPanel({ properties, onChange }: SqlTablePropertiesPanelProps) {
  const styles = getStyles();

  return (
    <aside className={styles.panel} data-testid="sql-table-properties-panel" aria-label="Propriedades da Tabela SQL">
      <div className={styles.header}>Tabela SQL</div>
      
      <section className={styles.section}>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 5, fontWeight: 'bold' }}>
          <input 
            type="checkbox" 
            checked={properties.showTitle ?? true} 
            onChange={(event) => onChange({ showTitle: event.target.checked })} 
          />
          Mostrar Cabeçalho
        </label>
        
        {(properties.showTitle ?? true) && (
          <>
            <label>
              Título
              <input 
                type="text" 
                value={properties.title ?? ''} 
                placeholder="Resultado da consulta SIP"
                onChange={(event) => onChange({ title: event.target.value })} 
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label>
                Tamanho da Fonte
                <select 
                  value={properties.titleFontSize ?? 20} 
                  onChange={(event) => onChange({ titleFontSize: Number(event.target.value) })}
                >
                  {[12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map((value) => (
                    <option key={value} value={value}>{value}px</option>
                  ))}
                </select>
              </label>
              <label>
                Alinhamento
                <select 
                  value={properties.titleAlign ?? 'left'} 
                  onChange={(event) => onChange({ titleAlign: event.target.value as 'left' | 'center' | 'right' })}
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
              </label>
            </div>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <input 
                type="checkbox" 
                checked={properties.titleTransparent ?? false} 
                onChange={(event) => onChange({ titleTransparent: event.target.checked })} 
              />
              Fundo transparente
            </label>
          </>
        )}
      </section>

      <section className={styles.section}>
        <strong>Estilo</strong>
        <div className={styles.styleChoices}>
          <StyleChoice label="Escuro" value="dark" selected={(properties.style ?? 'dark') === 'dark'} onSelect={() => onChange({ style: 'dark' })} />
          <StyleChoice label="Claro" value="light" selected={properties.style === 'light'} onSelect={() => onChange({ style: 'light' })} />
          <StyleChoice label="Listrado" value="striped" selected={properties.style === 'striped'} onSelect={() => onChange({ style: 'striped' })} />
          <StyleChoice label="Person." value="custom" selected={properties.style === 'custom'} onSelect={() => onChange({ style: 'custom' })} />
        </div>
      </section>

      {properties.style === 'custom' && (
        <section className={styles.section}>
          <strong>Cores Personalizadas</strong>
          <ColorControl label="Cabeçalho (Fundo)" color={properties.customHeaderColor ?? ''} fallback="#1f2937" onChange={(value) => onChange({ customHeaderColor: value })} testId="sql-custom-header" />
          <ColorControl label="Linhas (Fundo)" color={properties.customRowColor ?? ''} fallback="#111827" onChange={(value) => onChange({ customRowColor: value })} testId="sql-custom-row" />
          <ColorControl label="Texto" color={properties.customTextColor ?? ''} fallback="#d1d5db" onChange={(value) => onChange({ customTextColor: value })} testId="sql-custom-text" />
          <ColorControl label="Bordas" color={properties.customBorderColor ?? ''} fallback="#374151" onChange={(value) => onChange({ customBorderColor: value })} testId="sql-custom-border" />
        </section>
      )}

      <section className={styles.section}>
        <label>
          Tamanho dos caracteres
          <select 
            value={properties.fontSize ?? ''} 
            onChange={(event) => onChange({ fontSize: event.target.value === '' ? undefined : Number(event.target.value) })}
          >
            <option value="">Padrão</option>
            {[10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32].map((value) => (
              <option key={value} value={value}>{value}px</option>
            ))}
          </select>
        </label>
      </section>
    </aside>
  );
}

function StyleChoice({ label, value, selected, onSelect }: { label: string; value: 'dark' | 'light' | 'striped' | 'custom'; selected: boolean; onSelect: () => void }) {
  const colors = value === 'dark' 
    ? ['#374151', '#1f2937', '#303b4d'] 
    : value === 'light' 
    ? ['#e5e7eb', '#ffffff', '#f8fafc'] 
    : value === 'striped' 
    ? ['#3f3f46', '#d4d4d8', '#52525b']
    : ['#8b5cf6', '#d946ef', '#f43f5e']; // Custom gradient-like representation

  return (
    <button 
      type="button" 
      aria-pressed={selected} 
      title={label} 
      onClick={onSelect} 
      data-testid={`sql-style-${value}`} 
      style={{ borderColor: selected ? 'var(--accent)' : 'var(--border-color)' }}
    >
      <span style={{ background: colors[0] }} />
      <span style={{ background: colors[1] }} />
      <span style={{ background: colors[2] }} />
      {label}
    </button>
  );
}

function getStyles() { 
  return { 
    panel: css`
      flex: 0 0 310px;
      width: 310px;
      min-width: 0;
      overflow: auto;
      border-left: 1px solid var(--border-color);
      background: var(--panel-bg);
      color: var(--text-primary);
    `, 
    header: css`
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
      font-weight: 600;
      display: flex;
      justify-content: space-between; 
    `, 
    section: css`
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px; 
      label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: var(--text-secondary);
      } 
      select, input {
        min-height: 28px;
        background: var(--input-bg);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        box-sizing: border-box;
      }
    `, 
    styleChoices: css`
      display: flex;
      gap: 4px;
      button {
        width: 68px;
        padding: 4px;
        border: 2px solid;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 10px;
        display: grid;
        grid-template-rows: 9px 9px 9px auto;
        gap: 1px;
        cursor: pointer;
      }
      span {
        display: block;
      }
    `
  }; 
}
