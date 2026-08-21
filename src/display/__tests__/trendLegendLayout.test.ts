import {
  getEffectiveTrendLegendWidth,
  MIN_TREND_LEGEND_WIDTH,
  MIN_TREND_PLOT_WIDTH,
  truncateLegendLabel,
} from '../trendLegendLayout';

describe('trendLegendLayout', () => {
  describe('getEffectiveTrendLegendWidth', () => {
    it('usa largura padrão calculada quando não especificado', () => {
      const width = getEffectiveTrendLegendWidth(1000);
      expect(width).toBe(300); // 1000 * 0.3
    });

    it('respeita largura preferida quando dentro dos limites', () => {
      const width = getEffectiveTrendLegendWidth(1000, 250);
      expect(width).toBe(250);
    });

    it('nunca permite largura abaixo de MIN_TREND_LEGEND_WIDTH (100)', () => {
      expect(getEffectiveTrendLegendWidth(800, 50)).toBe(MIN_TREND_LEGEND_WIDTH);
      expect(getEffectiveTrendLegendWidth(800, 0)).toBe(240); // 0 or invalid falls back to default
      expect(getEffectiveTrendLegendWidth(800, -50)).toBe(240);
    });

    it('preserva MIN_TREND_PLOT_WIDTH (120) do gráfico', () => {
      // container: 500, leftMargin: 86, minPlot: 120 -> maxLegend = 500 - 86 - 120 = 294
      const width = getEffectiveTrendLegendWidth(500, 400, 86, MIN_TREND_PLOT_WIDTH);
      expect(width).toBe(294);
    });

    it('nunca retorna NaN, Infinity ou valores inválidos', () => {
      expect(getEffectiveTrendLegendWidth(Number.NaN)).toBe(MIN_TREND_LEGEND_WIDTH);
      expect(getEffectiveTrendLegendWidth(-500)).toBe(MIN_TREND_LEGEND_WIDTH);
      expect(getEffectiveTrendLegendWidth(0)).toBe(MIN_TREND_LEGEND_WIDTH);
      expect(getEffectiveTrendLegendWidth(800, Number.POSITIVE_INFINITY)).toBe(240);
      expect(getEffectiveTrendLegendWidth(800, 999999)).toBe(800 - 86 - 120);
      expect(getEffectiveTrendLegendWidth(800, Number.NaN)).toBe(240);
    });

    it('calcula corretamente para dimensões grandes de popup', () => {
      const width = getEffectiveTrendLegendWidth(2400, 500, 46, 300);
      expect(width).toBe(500);
    });
  });

  describe('truncateLegendLabel', () => {
    const longName = 'LFS_RB2_MOTOR_PAYOFF_VIB_LA';

    it('mantém nome completo quando houver espaço suficiente', () => {
      const label = truncateLegendLabel(longName, 350, 16);
      expect(label).toBe('LFS_RB2_MOTOR_PAYOFF_VIB_LA');
    });

    it('adiciona reticências quando a legenda for estreita', () => {
      const label = truncateLegendLabel(longName, 120, 16);
      expect(label.endsWith('...')).toBe(true);
      expect(label.length).toBeLessThan(longName.length);
      expect(longName.startsWith(label.replace('...', ''))).toBe(true);
    });

    it('lida com strings vazias', () => {
      expect(truncateLegendLabel('', 200)).toBe('');
    });
  });
});
