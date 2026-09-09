import { css } from '@emotion/css';

export const getPiChatStyles = () => ({
  popover: css`
    position: fixed;
    left: 54px;
    bottom: 46px;
    width: 380px;
    height: 520px;
    max-width: calc(100vw - 70px);
    max-height: calc(100vh - 60px);
    z-index: 1050;
    display: flex;
    flex-direction: column;
    background: var(--surface-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.05);
    overflow: hidden;
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-primary);
    animation: pichat-popover-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);

    @keyframes pichat-popover-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `,

  popoverMinimized: css`
    height: auto !important;
    min-height: unset !important;
    max-height: none !important;
  `,

  contentHidden: css`
    display: none !important;
  `,

  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--assets-header-bg, linear-gradient(105deg, rgba(156, 31, 119, 0.95), rgba(95, 26, 79, 0.88)));
    color: var(--assets-header-text, #ffffff);
    border-bottom: 1px solid var(--assets-header-divider, rgba(255, 255, 255, 0.15));
    user-select: none;
  `,

  headerTitleArea: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,

  headerIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--assets-header-hover, rgba(255, 255, 255, 0.15));
    color: var(--assets-header-text, #ffffff);
  `,

  headerText: css`
    display: flex;
    flex-direction: column;
  `,

  headerTitle: css`
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--assets-header-text, #ffffff);
  `,

  headerSubtitle: css`
    font-size: 10px;
    color: var(--assets-header-muted, rgba(255, 255, 255, 0.75));
    line-height: 1.2;
  `,

  headerActions: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,

  minimizeButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--assets-header-text, rgba(255, 255, 255, 0.85));
    cursor: pointer;
    font-size: 14px;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: var(--assets-header-hover, rgba(255, 255, 255, 0.2));
      color: var(--assets-header-text, #ffffff);
    }

    &:focus {
      outline: 2px solid var(--assets-header-focus, rgba(255, 255, 255, 0.5));
    }
  `,

  closeButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--assets-header-text, rgba(255, 255, 255, 0.85));
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: var(--assets-header-hover, rgba(255, 255, 255, 0.2));
      color: var(--assets-header-text, #ffffff);
    }

    &:focus {
      outline: 2px solid var(--assets-header-focus, rgba(255, 255, 255, 0.5));
    }
  `,

  body: css`
    flex: 1;
    min-height: 0;
    padding: 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-secondary, var(--surface-primary));

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 3px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background: var(--accent);
    }
  `,

  welcomeCard: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 18px 14px;
    margin: auto 0;
    background: var(--card-bg, var(--surface-primary));
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: 12px;
    gap: 8px;
  `,

  welcomeIcon: css`
    color: var(--accent);
    margin-bottom: 2px;
  `,

  welcomeTitle: css`
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  `,

  messageRow: css`
    display: flex;
    flex-direction: column;
    max-width: 88%;
  `,

  messageRowUser: css`
    align-self: flex-end;
    align-items: flex-end;
  `,

  messageRowAssistant: css`
    align-self: flex-start;
    align-items: flex-start;
  `,

  bubble: css`
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.45;
    word-break: break-word;
    white-space: pre-wrap;
  `,

  bubbleUser: css`
    background: var(--accent);
    color: var(--accent-contrast, #ffffff);
    border-bottom-right-radius: 2px;
  `,

  bubbleAssistant: css`
    background: var(--card-bg, var(--surface-primary));
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-bottom-left-radius: 2px;
  `,

  bubbleError: css`
    background: rgba(248, 113, 113, 0.12);
    color: var(--danger, #f87171);
    border: 1px solid var(--danger, #f87171);
    border-bottom-left-radius: 2px;
  `,

  messageTime: css`
    font-size: 9px;
    color: var(--text-muted, var(--text-secondary));
    margin-top: 3px;
    padding: 0 2px;
  `,

  tagsBadgeList: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  `,

  tagBadge: css`
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    background: var(--selection-bg, rgba(211, 59, 145, 0.14));
    border: 1px solid var(--accent);
    color: var(--accent-hover, var(--accent));
    border-radius: 4px;
    font-size: 10px;
    font-family: monospace;
  `,

  codeBlock: css`
    display: block;
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 11px;
    overflow-x: auto;
    margin: 4px 0;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  `,

  loadingIndicator: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: var(--card-bg, var(--surface-primary));
    border: 1px solid var(--border-color);
    border-radius: 10px;
    align-self: flex-start;
    color: var(--text-secondary);
    font-size: 11px;
  `,

  dot: css`
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    animation: pichat-bounce 1.2s infinite ease-in-out both;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }
    &:nth-child(2) {
      animation-delay: -0.16s;
    }

    @keyframes pichat-bounce {
      0%,
      80%,
      100% {
        transform: scale(0);
        opacity: 0.4;
      }
      40% {
        transform: scale(1);
        opacity: 1;
      }
    }
  `,

  footer: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px 10px;
    background: var(--surface-primary);
    border-top: 1px solid var(--border-color);
  `,

  footerInputRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  `,

  attachButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--card-bg, var(--surface-primary));
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 14px;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    flex-shrink: 0;

    &:hover:not(:disabled) {
      background: var(--surface-secondary, rgba(255, 255, 255, 0.08));
      color: var(--accent);
      border-color: var(--accent);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &:focus {
      outline: 2px solid var(--focus-ring, rgba(237, 98, 173, 0.5));
    }
  `,

  previewContainer: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    background: var(--surface-secondary, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border-color);
    border-radius: 8px;
    max-height: 52px;
    animation: pichat-fade-in 0.15s ease;

    @keyframes pichat-fade-in {
      from {
        opacity: 0;
        transform: translateY(3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,

  previewContent: css`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  `,

  previewThumb: css`
    width: 38px;
    height: 38px;
    border-radius: 6px;
    object-fit: cover;
    border: 1px solid var(--border-color);
    flex-shrink: 0;
    background: #000;
  `,

  previewInfo: css`
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  `,

  previewFileName: css`
    font-size: 11px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `,

  previewFileSize: css`
    font-size: 9px;
    color: var(--text-muted, var(--text-secondary));
  `,

  previewRemoveButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    transition: background 0.15s ease, color 0.15s ease;
    flex-shrink: 0;

    &:hover {
      background: var(--danger, #f87171);
      color: #ffffff;
    }

    &:focus {
      outline: 2px solid var(--danger, #f87171);
    }
  `,

  validationAlert: css`
    font-size: 10px;
    color: var(--danger, #f87171);
    padding: 2px 4px;
    line-height: 1.3;
    animation: pichat-fade-in 0.15s ease;
  `,

  attachmentBadge: css`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-size: 10px;
    color: inherit;
    margin-bottom: 6px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,

  input: css`
    flex: 1;
    min-height: 34px;
    max-height: 80px;
    padding: 6px 10px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--input-bg, var(--surface-primary));
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
    resize: none;
    outline: none;
    box-sizing: border-box;

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--focus-ring, rgba(237, 98, 173, 0.34));
    }

    &::placeholder {
      color: var(--text-muted, var(--text-secondary));
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,

  sendButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-contrast, #ffffff);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.15s ease, opacity 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--accent-hover);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &:focus {
      outline: 2px solid var(--focus-ring, rgba(237, 98, 173, 0.5));
    }
  `,
});

