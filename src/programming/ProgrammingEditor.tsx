import React from 'react';
import { css } from '@emotion/css';
import type { ProgrammingDocument } from './ProgrammingTypes';

interface ProgrammingEditorProps {
  document: ProgrammingDocument;
  onChange: (document: ProgrammingDocument) => void;
  onApply: () => void;
  onAddToDisplay?: () => void;
}

export function ProgrammingEditor({ document, onChange, onApply, onAddToDisplay }: ProgrammingEditorProps) {
  const update = (field: keyof Pick<ProgrammingDocument, 'html' | 'css' | 'javascript'>, value: string) => {
    onChange({ ...document, [field]: value });
  };

  return (
    <div className={styles.editor}>
      <CodeField label="HTML" value={document.html} onChange={(value) => update('html', value)} testId="programming-html-editor" />
      <CodeField label="CSS" value={document.css} onChange={(value) => update('css', value)} testId="programming-css-editor" />
      <CodeField label="JavaScript" value={document.javascript} onChange={(value) => update('javascript', value)} testId="programming-javascript-editor" />
      <div className={styles.actions}>
        <button type="button" className={styles.applyButton} data-testid="programming-apply" onClick={onApply}>Aplicar</button>
        {onAddToDisplay && <button type="button" className={styles.addButton} data-testid="programming-add-to-display" onClick={onAddToDisplay}>Adicionar ao Data</button>}
      </div>
    </div>
  );
}

function CodeField({ label, value, onChange, testId }: { label: string; value: string; onChange: (value: string) => void; testId: string }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea
        className={styles.textarea}
        data-testid={testId}
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

const styles = {
  editor: css({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    overflowY: 'auto',
  }),
  field: css({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    color: 'var(--text-primary, #f1f2f5)',
    fontSize: 12,
    fontWeight: 600,
  }),
  textarea: css({
    minHeight: 70,
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    padding: 8,
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: 4,
    color: 'var(--text-primary, #f1f2f5)',
    background: 'var(--input-bg, #0d1622)',
    font: '12px/1.45 Consolas, Monaco, monospace',
  }),
  applyButton: css({
    padding: '6px 14px',
    border: '1px solid var(--accent, #b4167e)',
    borderRadius: 4,
    color: '#ffffff',
    background: 'var(--accent, #b4167e)',
    cursor: 'pointer',
    fontWeight: 600,
  }),
  actions: css({ display: 'flex', flexWrap: 'wrap', gap: 8 }),
  addButton: css({
    padding: '6px 12px',
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: 4,
    color: 'var(--text-primary, #f1f2f5)',
    background: 'var(--button-bg, #172332)',
    cursor: 'pointer',
    fontWeight: 600,
  }),
};
