import React, { type ReactNode, useState } from 'react';
import { css } from '@emotion/css';
import { ProgrammingEditor } from './ProgrammingEditor';
import { ProgrammingPreview } from './ProgrammingPreview';
import { DEFAULT_PROGRAMMING_DOCUMENT, type ProgrammingDocument, type ProgrammingPiPointContext } from './ProgrammingTypes';

export interface ProgrammingPanelProps {
  variant?: 'full' | 'editor' | 'preview';
  document?: ProgrammingDocument;
  appliedDocument?: ProgrammingDocument;
  onDocumentChange?: (document: ProgrammingDocument) => void;
  onApply?: () => void;
  beforeEditor?: ReactNode;
  piPoint?: ProgrammingPiPointContext;
}

export function ProgrammingPanel({
  variant = 'full',
  document: controlledDocument,
  appliedDocument: controlledAppliedDocument,
  onDocumentChange,
  onApply: controlledOnApply,
  beforeEditor,
  piPoint,
}: ProgrammingPanelProps) {
  const [internalDraft, setInternalDraft] = useState<ProgrammingDocument>(DEFAULT_PROGRAMMING_DOCUMENT);
  const [internalApplied, setInternalApplied] = useState<ProgrammingDocument>(DEFAULT_PROGRAMMING_DOCUMENT);
  const draft = controlledDocument ?? internalDraft;
  const applied = controlledAppliedDocument ?? internalApplied;
  const setDraft = onDocumentChange ?? setInternalDraft;
  const apply = controlledOnApply ?? (() => setInternalApplied(draft));

  const editor = <>{beforeEditor}<ProgrammingEditor document={draft} onChange={setDraft} onApply={apply} /></>;
  const preview = (
    <div className={styles.previewSection}>
      <ProgrammingPreview document={applied} piPoint={piPoint} />
    </div>
  );

  return (
    <section className={styles.panel} data-testid="programming-panel" aria-label="Programming">
      {variant !== 'preview' && (
        <header className={styles.header}>
          <h2>Programming</h2>
          <span>HTML Graphics</span>
        </header>
      )}
      {(variant === 'full' || variant === 'editor') && editor}
      {(variant === 'full' || variant === 'preview') && preview}
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
