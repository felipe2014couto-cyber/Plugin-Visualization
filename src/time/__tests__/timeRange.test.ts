import {
  createDefaultTimeSelection,
  moveTimeSelectionToNow,
  parseTimeExpression,
  resolveTimeSelection,
  shiftTimeSelection,
} from '../timeRange';

describe('timeRange', () => {
  const now = Date.parse('2026-08-07T12:00:00.000Z');

  it('resolve agora, tempo relativo e data absoluta', () => {
    expect(parseTimeExpression('*', now)).toBe(now);
    expect(parseTimeExpression('*-8h', now)).toBe(now - 8 * 60 * 60 * 1000);
    expect(parseTimeExpression('*-30m', now)).toBe(now - 30 * 60 * 1000);
    expect(parseTimeExpression('2026-08-07T10:00:00.000Z', now)).toBe(Date.parse('2026-08-07T10:00:00.000Z'));
  });

  it('rejeita expressão e intervalo inválidos', () => {
    expect(parseTimeExpression('ontem talvez', now)).toBeUndefined();
    expect(resolveTimeSelection('*', '*-1h', now)).toBeUndefined();
  });

  it('navega mantendo duração e retorna para agora', () => {
    const initial = createDefaultTimeSelection(now);
    const previous = shiftTimeSelection(initial, -1);
    expect(previous.range).toEqual({
      from: now - 16 * 60 * 60 * 1000,
      to: now - 8 * 60 * 60 * 1000,
    });
    const current = moveTimeSelectionToNow(previous, now);
    expect(current.startExpression).toBe('*-8h');
    expect(current.endExpression).toBe('*');
    expect(current.range.to).toBe(now);
  });
});
