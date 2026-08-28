import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

export interface ContextMenuItem {
  id: string;
  label: string;
  testId?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
  onClick: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  'data-testid'?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
  'data-testid': testId = 'display-context-menu',
}) => {
  const styles = useStyles2(getStyles);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  useEffect(() => {
    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handlePointerDownOutside, true);
      window.addEventListener('mousedown', handlePointerDownOutside, true);
      window.addEventListener('touchstart', handlePointerDownOutside, true);
      window.addEventListener('contextmenu', handlePointerDownOutside, true);
    }, 50);

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      window.removeEventListener('mousedown', handlePointerDownOutside, true);
      window.removeEventListener('touchstart', handlePointerDownOutside, true);
      window.removeEventListener('contextmenu', handlePointerDownOutside, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  // Ensure menu stays within viewport
  const adjustedX = Math.max(8, Math.min(x, window.innerWidth - 200));
  const adjustedY = Math.max(8, Math.min(y, window.innerHeight - 200));

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      data-testid={testId}
      style={{ left: adjustedX, top: adjustedY }}
      role="menu"
    >
      {items.map((item) => {
        const hasSubmenu = Boolean(item.submenu?.length);
        const showLeft = adjustedX + 400 > window.innerWidth;
        return <div key={item.id} className={styles.itemWrapper} onMouseEnter={() => hasSubmenu && setOpenSubmenu(item.id)} onMouseLeave={() => hasSubmenu && setOpenSubmenu(null)}>
          <button type="button" role="menuitem" className={styles.menuItem} data-testid={item.testId ?? `context-menu-${item.id}`} disabled={item.disabled}
            onClick={(e) => { e.stopPropagation(); if (hasSubmenu) { setOpenSubmenu(item.id); return; } item.onClick(); onClose(); }}>
            {item.icon && <span className={styles.icon}>{item.icon}</span>}<span>{item.label}</span>{hasSubmenu && <span className={styles.chevron}>▶</span>}
          </button>
          {hasSubmenu && openSubmenu === item.id && <div className={styles.submenu} style={showLeft ? { right: '100%' } : { left: '100%' }} role="menu">
            {item.submenu!.map((child) => <button key={child.id} type="button" role="menuitem" className={styles.menuItem} disabled={child.disabled}
              onClick={(e) => { e.stopPropagation(); child.onClick(); onClose(); }}>{child.icon && <span className={styles.icon}>{child.icon}</span>}<span>{child.label}</span></button>)}
          </div>}
        </div>;
      })}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  menu: css`
    position: fixed;
    z-index: 10000;
    min-width: 180px;
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.strong};
    border-radius: ${theme.shape.borderRadius(1)};
    box-shadow: ${theme.shadows.z3};
    padding: ${theme.spacing(0.5)} 0;
    display: flex;
    flex-direction: column;
    /* Submenus are positioned outside the root menu. Do not clip them. */
    overflow: visible;
  `,
  menuItem: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    width: 100%;
    padding: ${theme.spacing(0.75, 1.5)};
    background: transparent;
    border: none;
    color: ${theme.colors.text.primary};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover:not(:disabled) {
      background: ${theme.colors.action.hover};
      color: ${theme.colors.text.maxContrast};
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
  itemWrapper: css`position: relative;`,
  submenu: css`
    position: absolute; top: -${theme.spacing(0.5)}; min-width: 190px; z-index: 1;
    background: ${theme.colors.background.primary}; border: 1px solid ${theme.colors.border.strong};
    border-radius: ${theme.shape.borderRadius(1)}; box-shadow: ${theme.shadows.z3}; padding: ${theme.spacing(0.5)} 0;
  `,
  chevron: css`margin-left: auto; font-size: 10px;`,
  icon: css`
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: ${theme.colors.text.secondary};
  `,
});
