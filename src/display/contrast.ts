import { resolveThemeForeground } from './themeColor';

/**
 * Verifica se uma cor de fundo corresponde a uma tonalidade de vermelho (ex: cartao de alarme no PI Vision).
 */
export function isRedBackground(color: string | undefined): boolean {
  if (!color || color === 'transparent' || color === 'none') {
    return false;
  }
  const lower = color.trim().toLowerCase();
  if (['#ff0000', 'red', '#d32f2f', '#f44336', '#e53935', '#b71c1c', '#c62828'].includes(lower)) {
    return true;
  }
  if (lower.startsWith('rgba') || lower.startsWith('rgb')) {
    const match = lower.match(/\d+(?:\.\d+)?/g);
    if (match && match.length >= 3) {
      const r = Number(match[0]);
      const g = Number(match[1]);
      const b = Number(match[2]);
      const a = match.length >= 4 ? Number(match[3]) : 1;
      if (a >= 0.4 && r > 150 && g < 100 && b < 100) {
        return true;
      }
    }
  }
  if (/^#[0-9a-f]{6}$/i.test(lower)) {
    const r = parseInt(lower.slice(1, 3), 16);
    const g = parseInt(lower.slice(3, 5), 16);
    const b = parseInt(lower.slice(5, 7), 16);
    if (r > 150 && g < 100 && b < 100) {
      return true;
    }
  }
  return false;
}

/**
 * Verifica se uma cor de fundo e clara (verde, cinza, branco, etc).
 */
export function isLightBackground(color: string | undefined): boolean {
  if (!color || color === 'transparent' || color === 'none') {
    return false;
  }
  const lower = color.trim().toLowerCase();
  if (['#ffffff', '#fff', 'white', '#32cd32', '#00ff00', 'green', 'lime', '#d3d3d3', '#c0c0c0', '#808080', 'gray', 'grey'].includes(lower)) {
    return true;
  }
  if (lower.startsWith('rgba') || lower.startsWith('rgb')) {
    const match = lower.match(/\d+(?:\.\d+)?/g);
    if (match && match.length >= 3) {
      const r = Number(match[0]);
      const g = Number(match[1]);
      const b = Number(match[2]);
      const a = match.length >= 4 ? Number(match[3]) : 1;
      if (a < 0.4) return false;
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.48;
    }
  }
  if (/^#[0-9a-f]{6}$/i.test(lower)) {
    const r = parseInt(lower.slice(1, 3), 16);
    const g = parseInt(lower.slice(3, 5), 16);
    const b = parseInt(lower.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.48;
  }
  return false;
}

/**
 * Aplica contraste inteligente entre o texto e o fundo do cartao / superficie:
 * - Fundo vermelho (#ff0000 / red): texto em branco (#ffffff).
 * - Fundo verde (#32cd32), cinza (#d3d3d3) ou branco: texto em preto (#000000).
 * - Fundo escuro/preto com texto preto: texto em branco (#ffffff).
 */
export function getSmartContrastTextColor(
  effectiveBg: string | undefined,
  textColor: string | undefined,
): string {
  if (!effectiveBg || effectiveBg === 'transparent' || effectiveBg === 'none') {
    return resolveThemeForeground(textColor);
  }
  if (isRedBackground(effectiveBg)) {
    return '#ffffff';
  }
  if (isLightBackground(effectiveBg)) {
    return '#000000';
  }
  // Fundo escuro (ex: #000000)
  const isDarkText = !textColor || textColor === '#000000' || textColor === '#000' || textColor === 'black' || textColor === 'rgba(0,0,0,1)';
  if (isDarkText) {
    return '#ffffff';
  }
  return resolveThemeForeground(textColor);
}
