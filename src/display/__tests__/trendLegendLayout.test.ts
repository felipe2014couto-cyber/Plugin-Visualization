import {
  getEffectiveTrendLegendWidth,
  getTrendSeriesOpacity,
  MIN_TREND_LEGEND_WIDTH,
  MIN_TREND_PLOT_WIDTH,
  pruneTrendSeriesSelection,
  truncateLegendLabel,
  updateTrendSeriesSelection,
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

  describe('updateTrendSeriesSelection', () => {
    it('seleciona série em clique simples quando nada selecionado: {} + click A -> {A}', () => {
      const result = updateTrendSeriesSelection(new Set(), 'A', false);
      expect(Array.from(result)).toEqual(['A']);
    });

    it('desmarca tudo ao clicar sem Ctrl em série já selecionada: {A} + click A -> {}', () => {
      const result = updateTrendSeriesSelection(new Set(['A']), 'A', false);
      expect(result.size).toBe(0);
    });

    it('limpa toda a seleção ao clicar sem Ctrl em série selecionada em multi-seleção: {A, B} + click A -> {}', () => {
      const result = updateTrendSeriesSelection(new Set(['A', 'B']), 'A', false);
      expect(result.size).toBe(0);
    });

    it('substitui seleção ao clicar sem Ctrl em terceira série não selecionada: {A, B} + click C -> {C}', () => {
      const result = updateTrendSeriesSelection(new Set(['A', 'B']), 'C', false);
      expect(Array.from(result)).toEqual(['C']);
    });

    it('adiciona série à seleção com Ctrl: {A} + Ctrl click B -> {A, B}', () => {
      const result = updateTrendSeriesSelection(new Set(['A']), 'B', true);
      expect(Array.from(result).sort()).toEqual(['A', 'B']);
    });

    it('adiciona terceira série à seleção com Ctrl: {A, B} + Ctrl click C -> {A, B, C}', () => {
      const result = updateTrendSeriesSelection(new Set(['A', 'B']), 'C', true);
      expect(Array.from(result).sort()).toEqual(['A', 'B', 'C']);
    });

    it('remove apenas a série clicada com Ctrl: {A, B} + Ctrl click A -> {B}', () => {
      const result = updateTrendSeriesSelection(new Set(['A', 'B']), 'A', true);
      expect(Array.from(result)).toEqual(['B']);
    });

    it('remove última série com Ctrl: {A} + Ctrl click A -> {}', () => {
      const result = updateTrendSeriesSelection(new Set(['A']), 'A', true);
      expect(result.size).toBe(0);
    });
  });

  describe('getTrendSeriesOpacity', () => {
    it('retorna 1 quando nenhuma série está selecionada', () => {
      expect(getTrendSeriesOpacity('A', new Set())).toBe(1);
      expect(getTrendSeriesOpacity('B', new Set())).toBe(1);
    });

    it('retorna 1 para série selecionada e 0.2 para série não selecionada', () => {
      const selected = new Set(['A']);
      expect(getTrendSeriesOpacity('A', selected)).toBe(1);
      expect(getTrendSeriesOpacity('B', selected)).toBe(0.2);
    });

    it('retorna 1 para múltiplas séries selecionadas e 0.2 para as restantes', () => {
      const selected = new Set(['A', 'C']);
      expect(getTrendSeriesOpacity('A', selected)).toBe(1);
      expect(getTrendSeriesOpacity('C', selected)).toBe(1);
      expect(getTrendSeriesOpacity('B', selected)).toBe(0.2);
      expect(getTrendSeriesOpacity('D', selected)).toBe(0.2);
    });
  });

  describe('pruneTrendSeriesSelection', () => {
    it('preserva apenas keys existentes', () => {
      const current = new Set(['A', 'B', 'C']);
      const available = ['A', 'C', 'D'];
      const result = pruneTrendSeriesSelection(current, available);
      expect(Array.from(result).sort()).toEqual(['A', 'C']);
    });
  });
});

