import { resolveThemeForeground } from '../themeColor';

describe('resolveThemeForeground', () => {
  it.each(['#fff', '#FFF', '#ffffff', '#FFFFFF'])('adapta o branco padrão ao tema (%s)', (color) => {
    expect(resolveThemeForeground(color)).toBe('var(--text-primary, #f8fafc)');
  });

  it('preserva cores personalizadas e transparência', () => {
    expect(resolveThemeForeground('#00a2e8')).toBe('#00a2e8');
    expect(resolveThemeForeground('transparent')).toBe('transparent');
  });
});
