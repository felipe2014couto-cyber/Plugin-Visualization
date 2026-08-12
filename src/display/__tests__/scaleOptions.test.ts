import { formatScaleValue, getScaleRatio, normalizeScaleOptions } from '../scaleOptions';

describe('scaleOptions', () => {
  it('calcula a proporção e limita valores fora da escala', () => {
    expect(getScaleRatio(50, 0, 100)).toBe(0.5);
    expect(getScaleRatio(-10, 0, 100)).toBe(0);
    expect(getScaleRatio(120, 0, 100)).toBe(1);
  });

  it('trata escala inválida sem produzir proporção', () => {
    expect(getScaleRatio(50, 100, 0)).toBeUndefined();
    expect(getScaleRatio(50, 0, 0)).toBeUndefined();
    expect(getScaleRatio(Number.NaN, 0, 100)).toBeUndefined();
    expect(normalizeScaleOptions({ minimum: Number.NaN, maximum: Number.POSITIVE_INFINITY })).toEqual({
      minimum: 0,
      maximum: 100,
      showValue: true,
      showTagName: true,
      decimals: null,
      color: '#6e9fff',
    });
  });

  it('usa a cor base padrão quando ausente ou inválida', () => {
    expect(normalizeScaleOptions()).toMatchObject({ color: '#6e9fff' });
    expect(normalizeScaleOptions({ color: 'red' }).color).toBe('#6e9fff');
    expect(normalizeScaleOptions({ color: '#123456' }).color).toBe('#123456');
  });

  it('preserva cor hexadecimal válida', () => {
    expect(normalizeScaleOptions({ color: '#ff9830' })).toMatchObject({ color: '#ff9830' });
    expect(normalizeScaleOptions({ color: '#abc' })).toMatchObject({ color: '#abc' });
  });

  it('formata valor sem alterar o valor original', () => {
    expect(formatScaleValue(123.456, 2)).toBe('123.46');
    expect(formatScaleValue(123.456, null)).toBe('123.456');
  });
});
