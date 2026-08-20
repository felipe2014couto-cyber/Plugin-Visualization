/**
 * Converts legacy white defaults into a color that follows the active theme.
 *
 * Older displays stored the default foreground as a literal white value. That
 * works in the dark theme, but makes labels and outlines disappear in the
 * light theme. Explicit non-default colors remain untouched.
 */
export function resolveThemeForeground(color: string | undefined): string {
  const normalized = color?.trim().toLowerCase();
  return normalized === '#fff' || normalized === '#ffffff'
    ? 'var(--text-primary, #f8fafc)'
    : color || 'var(--text-primary, #f8fafc)';
}
