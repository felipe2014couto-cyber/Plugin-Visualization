import React, { useState } from 'react';
import { css } from '@emotion/css';
import { TABLE_COLUMN_LABELS, type TableColumnId, type TableProperties } from '../../createTable';

export interface TablePropertiesPanelProps { properties: TableProperties; onChange: (patch: Partial<TableProperties>) => void; onRemoveItem: (index: number) => void; onMoveItem: (index: number, offset: -1 | 1) => void; }
export function TablePropertiesPanel({ properties, onChange, onRemoveItem, onMoveItem }: TablePropertiesPanelProps) {
  const styles = getStyles();
  const [selectedColumnId, setSelectedColumnId] = useState(properties.columns[0]?.id);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const changeColumn = (index: number, patch: Partial<TableProperties['columns'][number]>) => onChange({ columns: properties.columns.map((column, columnIndex) => columnIndex === index ? { ...column, ...patch } : column) });
  const selectedColumnIndex = Math.max(0, properties.columns.findIndex((column) => column.id === selectedColumnId));
  const selectedColumn = properties.columns[selectedColumnIndex];
  const selectedItem = properties.items[selectedItemIndex] ?? properties.items[0];
  const effectiveItemIndex = selectedItem ? properties.items.indexOf(selectedItem) : -1;
  const changeItem = (patch: Partial<TableProperties['items'][number]>) => { if (effectiveItemIndex < 0) return; onChange({ items: properties.items.map((item, index) => index === effectiveItemIndex ? { ...item, ...patch } : item) }); };
  return <aside className={styles.panel} data-testid="table-properties-panel" aria-label="Propriedades da Tabela">
    <div className={styles.header}>Tabela <span>{properties.items.length} PI Point{properties.items.length === 1 ? '' : 's'}</span></div>
    <section className={styles.section}>
      <strong>Estilo</strong>
      <div className={styles.styleChoices}>
        <StyleChoice label="Escuro" value="dark" selected={(properties.style ?? 'dark') === 'dark'} onSelect={() => onChange({ style: 'dark' })} />
        <StyleChoice label="Claro" value="light" selected={properties.style === 'light'} onSelect={() => onChange({ style: 'light' })} />
        <StyleChoice label="Listrado" value="striped" selected={properties.style === 'striped'} onSelect={() => onChange({ style: 'striped' })} />
      </div>
    </section>
    <section className={styles.section}><label>Casas decimais<select value={properties.decimals ?? ''} onChange={(event) => onChange({ decimals: event.target.value === '' ? null : Number(event.target.value) })}><option value="">Padrão</option>{[0,1,2,3,4,5,6,7,8,9,10].map((value) => <option key={value}>{value}</option>)}</select></label></section>
    <section className={styles.section}>
      <strong>Colunas</strong>
      <select className={styles.columnList} size={Math.min(13, properties.columns.length)} value={selectedColumn?.id} onChange={(event) => setSelectedColumnId(event.target.value as TableColumnId)} aria-label="Selecionar coluna">
        {properties.columns.map((column) => <option key={column.id} value={column.id} style={{ fontWeight: column.visible ? 700 : 400 }}>{TABLE_COLUMN_LABELS[column.id]}</option>)}
      </select>
      {selectedColumn && <div className={styles.columnSettings}>
        <label><input type="checkbox" checked={selectedColumn.visible} onChange={(event) => { if (!event.target.checked && properties.columns.filter((item) => item.visible).length === 1) return; changeColumn(selectedColumnIndex, { visible: event.target.checked }); }} />{TABLE_COLUMN_LABELS[selectedColumn.id]}</label>
        <select value={selectedColumn.align} onChange={(event) => changeColumn(selectedColumnIndex, { align: event.target.value as 'left' | 'center' | 'right' })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select>
        <label><input type="checkbox" checked={selectedColumn.wrapText} onChange={(event) => changeColumn(selectedColumnIndex, { wrapText: event.target.checked })} />Quebrar</label>
      </div>}
    </section>
    <section className={styles.section}><strong>Tags</strong>{properties.items.map((item, index) => <div className={`${styles.item} ${index === effectiveItemIndex ? styles.itemSelected : ''}`} key={`${item.binding.dataSourceUid}-${item.binding.pointName}-${index}`}><button type="button" className={styles.itemName} onClick={() => setSelectedItemIndex(index)} title={item.binding.pointName}>{item.binding.pointName}</button><button type="button" disabled={index === 0} onClick={() => onMoveItem(index, -1)}>↑</button><button type="button" disabled={index === properties.items.length - 1} onClick={() => onMoveItem(index, 1)}>↓</button><button type="button" disabled={properties.items.length === 1} onClick={() => onRemoveItem(index)}>Excluir</button></div>)}{selectedItem && <div className={styles.itemSettings}><label>Nome exibido<select value={selectedItem.nameMode === 'custom' ? 'custom' : 'tag'} onChange={(event) => changeItem({ nameMode: event.target.value as 'tag' | 'custom', ...(event.target.value === 'custom' && !selectedItem.customName ? { customName: selectedItem.binding.pointName } : {}) })}><option value="tag">Nome da tag</option><option value="custom">Personalizado</option></select></label>{selectedItem.nameMode === 'custom' && <label>Nome personalizado<input value={selectedItem.customName ?? selectedItem.binding.pointName} onChange={(event) => changeItem({ nameMode: 'custom', customName: event.target.value })} data-testid="table-custom-name" /></label>}</div>}</section>
  </aside>;
}
function StyleChoice({ label, value, selected, onSelect }: { label: string; value: 'dark' | 'light' | 'striped'; selected: boolean; onSelect: () => void }) {
  const colors = value === 'dark' ? ['#374151', '#1f2937', '#303b4d'] : value === 'light' ? ['#e5e7eb', '#ffffff', '#f8fafc'] : ['#3f3f46', '#d4d4d8', '#52525b'];
  return <button type="button" aria-pressed={selected} title={label} onClick={onSelect} data-testid={`table-style-${value}`} style={{ borderColor: selected ? '#6e9fff' : 'var(--border-color)' }}><span style={{ background: colors[0] }} /><span style={{ background: colors[1] }} /><span style={{ background: colors[2] }} />{label}</button>;
}
function getStyles() { return { panel: css`flex:0 0 310px;width:310px;min-width:0;overflow:auto;border-left:1px solid var(--border-color);background:var(--panel-bg);color:var(--text-primary);`, header: css`padding:12px;border-bottom:1px solid var(--border-color);font-weight:600;display:flex;justify-content:space-between; span{font-size:11px;color:var(--text-secondary);font-weight:400;}`, section: css`display:flex;flex-direction:column;gap:8px;padding:12px;border-bottom:1px solid var(--border-color);font-size:12px; label{display:flex;flex-direction:column;gap:4px;color:var(--text-secondary);} select,input{min-height:28px;background:var(--input-bg);color:var(--text-primary);border:1px solid var(--border-color);box-sizing:border-box;}`, styleChoices: css`display:flex;gap:8px;button{width:78px;padding:4px;border:2px solid;background:var(--input-bg);color:var(--text-primary);font-size:10px;display:grid;grid-template-rows:9px 9px 9px auto;gap:1px;cursor:pointer;}span{display:block;}`, columnList: css`width:100%;height:222px;padding:4px;border:1px solid var(--border-color);background:var(--input-bg);color:var(--text-primary);option{padding:2px 4px;font-size:12px;}`, columnSettings: css`display:grid;grid-template-columns:1fr 94px;gap:8px;align-items:center;padding-top:2px;label{flex-direction:row;align-items:center;gap:5px;font-size:11px;}select{width:100%;}`, item: css`display:flex;align-items:center;gap:4px;padding:2px;border:1px solid transparent;span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}button{border:1px solid var(--border-color);background:var(--input-bg);color:var(--text-primary);font-size:11px;min-height:24px;}button:disabled{opacity:.45;}`, itemSelected: css`border-color:var(--accent-color, #6e9fff);`, itemName: css`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;`, itemSettings: css`display:flex;flex-direction:column;gap:8px;padding:8px;background:rgba(110,159,255,.08);border:1px solid var(--border-color);` }; }
