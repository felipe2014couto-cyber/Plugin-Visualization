export type BarOrientation = 'horizontal' | 'vertical';

export interface ScaleVisualOptions {
  minimum: number;
  maximum: number;
  showValue: boolean;
  showTagName: boolean;
  decimals: number | null;
  color: string;
}

export const DEFAULT_SCALE_OPTIONS: ScaleVisualOptions = {
  minimum: 0,
  maximum: 100,
  showValue: true,
  showTagName: true,
  decimals: null,
  color: '#6e9fff',
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
    color: typeof options?.color === 'string' && isValidHexColor(options.color)
      ? options.color
      : DEFAULT_SCALE_OPTIONS.color,
  };
}

function isValidHexColor(value: string): boolean {
  return value.trim().toLowerCase() === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(value.trim());
}

export function isValidScale(minimum: number, maximum: number): boolean {
  return Number.isFinite(minimum) && Number.isFinite(maximum) && minimum !== maximum;
}

export function getScaleRatio(value: number, minimum: number, maximum: number): number | undefined {
  if (!isValidScale(minimum, maximum) || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
}

export function formatScaleValue(value: number, decimals: number | null, minimum?: number, maximum?: number): string {
  if (decimals !== null) {
    return value.toFixed(decimals);
  }
  
  const cleanValue = parseFloat(value.toPrecision(10));
  
  if (minimum !== undefined && maximum !== undefined) {
    const cleanMin = parseFloat(minimum.toPrecision(10));
    const cleanMax = parseFloat(maximum.toPrecision(10));
    const minDecimals = (String(cleanMin).split('.')[1] || '').length;
    const maxDecimals = (String(cleanMax).split('.')[1] || '').length;
    
    if (minDecimals <= 2 && maxDecimals <= 2) {
      return parseFloat(cleanValue.toFixed(2)).toString();
    }
  }
  
  return String(cleanValue);
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
