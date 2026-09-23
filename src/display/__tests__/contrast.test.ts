import { isRedBackground, isLightBackground, getSmartContrastTextColor } from '../contrast';

describe('contrast helpers', () => {
  describe('isRedBackground', () => {
    it('identifica cores vermelhas hex, nomes e rgb/rgba', () => {
      expect(isRedBackground('#ff0000')).toBe(true);
      expect(isRedBackground('red')).toBe(true);
      expect(isRedBackground('#d32f2f')).toBe(true);
      expect(isRedBackground('#f44336')).toBe(true);
      expect(isRedBackground('rgba(255, 0, 0, 1)')).toBe(true);
      expect(isRedBackground('rgb(240, 20, 20)')).toBe(true);
    });

    it('retorna false para cores nao vermelhas e transparentes', () => {
      expect(isRedBackground('#32cd32')).toBe(false);
      expect(isRedBackground('#d3d3d3')).toBe(false);
      expect(isRedBackground('#ffffff')).toBe(false);
      expect(isRedBackground('transparent')).toBe(false);
      expect(isRedBackground('none')).toBe(false);
      expect(isRedBackground(undefined)).toBe(false);
    });
  });

  describe('isLightBackground', () => {
    it('identifica cores claras (verde, cinza, branco)', () => {
      expect(isLightBackground('#ffffff')).toBe(true);
      expect(isLightBackground('white')).toBe(true);
      expect(isLightBackground('#32cd32')).toBe(true);
      expect(isLightBackground('#00ff00')).toBe(true);
      expect(isLightBackground('lime')).toBe(true);
      expect(isLightBackground('#d3d3d3')).toBe(true);
      expect(isLightBackground('#c0c0c0')).toBe(true);
      expect(isLightBackground('gray')).toBe(true);
    });

    it('retorna false para cores escuras ou transparentes', () => {
      expect(isLightBackground('#000000')).toBe(false);
      expect(isLightBackground('#181b1f')).toBe(false);
      expect(isLightBackground('transparent')).toBe(false);
      expect(isLightBackground(undefined)).toBe(false);
    });
  });

  describe('getSmartContrastTextColor', () => {
    it('retorna texto branco sobre fundo vermelho', () => {
      expect(getSmartContrastTextColor('#ff0000', '#000000')).toBe('#ffffff');
      expect(getSmartContrastTextColor('red', '#000000')).toBe('#ffffff');
    });

    it('retorna texto preto sobre fundo verde, cinza ou branco', () => {
      expect(getSmartContrastTextColor('#32cd32', '#ffffff')).toBe('#000000');
      expect(getSmartContrastTextColor('#d3d3d3', '#ffffff')).toBe('#000000');
      expect(getSmartContrastTextColor('#ffffff', '#ffffff')).toBe('#000000');
    });

    it('retorna texto branco sobre fundo preto quando o texto original era preto', () => {
      expect(getSmartContrastTextColor('#000000', '#000000')).toBe('#ffffff');
    });

    it('preserva cor ou fallback do tema para fundo transparente', () => {
      expect(getSmartContrastTextColor('transparent', '#ff9900')).toBe('#ff9900');
    });
  });
});
