import React, { useState } from 'react';
import { css } from '@emotion/css';
import { ProgrammingEditor } from './ProgrammingEditor';
import { ProgrammingPreview } from './ProgrammingPreview';
import { DEFAULT_PROGRAMMING_DOCUMENT, type ProgrammingDocument } from './ProgrammingTypes';

export function ProgrammingPanel() {
  const [draft, setDraft] = useState<ProgrammingDocument>(DEFAULT_PROGRAMMING_DOCUMENT);
  const [applied, setApplied] = useState<ProgrammingDocument>(DEFAULT_PROGRAMMING_DOCUMENT);

  return (
    <section className={styles.panel} data-testid="programming-panel" aria-label="Programming">
      <header className={styles.header}>
        <h2>Programming</h2>
        <span>HTML Graphics</span>
      </header>
      <ProgrammingEditor document={draft} onChange={setDraft} onApply={() => setApplied(draft)} />
      <div className={styles.previewSection}>
        <h3>Preview</h3>
        <ProgrammingPreview document={applied} />
      </div>
    </section>
  );
}

const styles = {
  panel: css({
    display: 'flex',
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
    overflow: 'hidden',
    color: 'var(--text-primary, #f1f2f5)',
    background: 'var(--panel-bg, #111923)',
  }),
  header: css({
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: '12px 14px 8px',
    borderBottom: '1px solid var(--border-color, #2b394a)',
    h2: { margin: 0, fontSize: 15 },
    span: { color: 'var(--text-secondary, #aeb3bf)', fontSize: 11 },
  }),
  previewSection: css({
    display: 'flex',
    flex: '1 1 260px',
    minHeight: 220,
    flexDirection: 'column',
    gap: 6,
    padding: '0 10px 10px',
    h3: { margin: 0, color: 'var(--text-secondary, #aeb3bf)', fontSize: 12 },
  }),
};
