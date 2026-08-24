import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { css } from '@emotion/css';
import type { SqlTableElement } from '../createSqlTable';
import { SqlResultTable } from '../../components/SqlQuery/SqlResultTable';

export interface SqlFullscreenPopupProps {
  element: SqlTableElement;
  onClose: () => void;
}

export function SqlFullscreenPopup({ element, onClose }: SqlFullscreenPopupProps) {
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevDocOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevDocOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const title = element.properties?.title || 'Pop-up de tendência';

  const content = (
    <section className={styles.popup} role="dialog" aria-modal="true" aria-label="Pop-up de tendência">
      <header className={styles.topHeader}>
        <span
          className={styles.brand}
          role="img"
          aria-label="Aperam Visualization"
        />
        <div className={styles.topActions}>
          <button type="button" className={styles.newDisplayButton}><span>+</span> Novo display</button>
          <button type="button" className={styles.headerIconButton} aria-label="Mais opções">⋮</button>
          <button type="button" className={styles.headerIconButton} aria-label="Ajuda">?</button>
        </div>
      </header>

      <div className={styles.titleBar}>
        <span className={styles.title}>{title}</span>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar pop-up">
          <span>Fechar</span>
          <span className={styles.closeIcon}>×</span>
        </button>
      </div>

      <div className={styles.chartPanel}>
        <div className={styles.chartArea}>
          <SqlResultTable
            result={element.properties?.result ?? null}
            isLoading={false}
            properties={{
              ...element.properties,
              fontSize: Math.max(14, (Number(element.properties?.fontSize) || 12) + 2),
              paginationSize: Number(element.properties?.xyRowsPerPage || element.properties?.paginationSize) || 200,
            }}
          />
        </div>
      </div>
    </section>
  );

  return typeof document !== 'undefined' ? ReactDOM.createPortal(content, document.body) : content;
}

const styles = {
  popup: css`
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    padding: 0 8px 8px;
    background:
      radial-gradient(circle at 55% 38%, var(--canvas-glow, rgba(180, 22, 126, 0.08)), transparent 48%),
      var(--canvas-bg, #0b0f19);
    color: var(--text-primary, #f3f4f6);
    width: 100vw;
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
  `,
  topHeader: css`
    height: 64px;
    flex: 0 0 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    background: transparent;
  `,
  brand: css`
    display: block;
    width: 150px;
    height: 56px;
    background-image: var(--brand-logo);
    background-repeat: no-repeat;
    background-position: center left;
    background-size: contain;
  `,
  topActions: css`
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
  `,
  newDisplayButton: css`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    padding: 0 16px;
    border: 1px solid var(--border-color, #1f293d);
    border-radius: 14px;
    color: var(--text-primary, #f3f4f6);
    background: var(--surface-primary, #111827);
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;

    span { color: var(--accent, #b4167e); font-size: 20px; font-weight: 300; }
  `,
  headerIconButton: css`
    width: 40px;
    height: 40px;
    border: 1px solid var(--border-color, #1f293d);
    border-radius: 50%;
    color: var(--text-primary, #f3f4f6);
    background: var(--surface-primary, #111827);
    cursor: pointer;
    font-size: 16px;
  `,
  titleBar: css`
    position: relative;
    height: 58px;
    flex: 0 0 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border: 1px solid var(--border-color, #1f293d);
    border-radius: 12px;
    background: linear-gradient(100deg, var(--surface-primary, #111827), var(--surface-secondary, #1a2234));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    margin-bottom: 6px;
  `,
  title: css`
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary, #f3f4f6);
    letter-spacing: 0.2px;
  `,
  closeButton: css`
    position: absolute;
    right: 14px;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    border: 1px solid var(--border-color, #334155);
    border-radius: 12px;
    padding: 0 16px 0 18px;
    color: var(--text-primary, #f3f4f6);
    background: var(--button-bg, #1e293b);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.2s, border-color 0.2s, color 0.2s;

    &:hover {
      background: var(--surface-secondary, #334155);
      border-color: var(--accent, #b4167e);
      color: #ffffff;
    }
  `,
  closeIcon: css`
    font-size: 20px;
    line-height: 1;
    font-weight: 200;
  `,
  chartPanel: css`
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
    border: 1px solid var(--border-color, #1f293d);
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(110deg, var(--surface-primary, #111827), var(--canvas-bg, #0b0f19));
    padding: 12px;
    box-sizing: border-box;
  `,
  chartArea: css`
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    height: 100%;
    background: transparent;
  `,
};
