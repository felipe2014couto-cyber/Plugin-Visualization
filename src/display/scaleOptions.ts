export type BarOrientation = 'horizontal' | 'vertical';

export interface ScaleVisualOptions {
  minimum: number;
  maximum: number;
  showValue: boolean;
  showTagName: boolean;
  decimals: number | null;
}

export const DEFAULT_SCALE_OPTIONS: ScaleVisualOptions = {
  minimum: 0,
  maximum: 100,
  showValue: true,
  showTagName: true,
  decimals: null,
};

export function normalizeScaleOptions(
  options?: Partial<ScaleVisualOptions> | null,
): ScaleVisualOptions {
  const decimals = options?.decimals;
  return {
    minimum: finiteOrDefault(options?.minimum, DEFAULT_SCALE_OPTIONS.minimum),
    maximum: finiteOrDefault(options?.maximum, DEFAULT_SCALE_OPTIONS.maximum),
    showValue: typeof options?.showValue === 'boolean' ? options.showValue : DEFAULT_SCALE_OPTIONS.showValue,
    showTagName: typeof options?.showTagName === 'boolean' ? options.showTagName : DEFAULT_SCALE_OPTIONS.showTagName,
    decimals: typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0 && decimals <= 10
      ? decimals
      : DEFAULT_SCALE_OPTIONS.decimals,
  };
}

export function getScaleRatio(value: number, minimum: number, maximum: number): number | undefined {
  if (![value, minimum, maximum].every(Number.isFinite) || minimum >= maximum) {
    return undefined;
  }
  return Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
}

export function formatScaleValue(value: number, decimals: number | null): string {
  return decimals === null ? String(value) : value.toFixed(decimals);
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
