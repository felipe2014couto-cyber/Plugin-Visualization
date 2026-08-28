export interface XYHistoricalPoint { time: number; value: number; }
export interface XYPair { time: number; x: number; y: number; }
const valid = (point: XYHistoricalPoint) => Number.isFinite(point.time) && Number.isFinite(point.value);

export function pairXYByPosition(xs: readonly XYHistoricalPoint[], ys: readonly XYHistoricalPoint[]): XYPair[] {
  const pairs: XYPair[] = [];
  for (let index = 0; index < Math.min(xs.length, ys.length); index += 1) if (valid(xs[index]) && valid(ys[index])) pairs.push({ time: xs[index].time, x: xs[index].value, y: ys[index].value });
  return pairs;
}
export function pairXYByTimestamp(xs: readonly XYHistoricalPoint[], ys: readonly XYHistoricalPoint[], method: 'interpolated' | 'exact' | 'previous' | 'next' = 'interpolated'): XYPair[] {
  const sortedY = ys.filter(valid).slice().sort((a, b) => a.time - b.time); const pairs: XYPair[] = [];
  for (const x of xs.filter(valid)) { const next = sortedY.findIndex((point) => point.time >= x.time); const after = next < 0 ? undefined : sortedY[next]; const before = next <= 0 ? undefined : sortedY[next - (after?.time === x.time ? 0 : 1)]; let y: number | undefined;
    if (method === 'exact') y = after?.time === x.time ? after.value : undefined;
    else if (method === 'previous') y = after?.time === x.time ? after.value : before?.value;
    else if (method === 'next') y = after?.value;
    else if (after?.time === x.time) y = after.value;
    else if (before && after && after.time > before.time) y = before.value + ((x.time - before.time) / (after.time - before.time)) * (after.value - before.value);
    if (y !== undefined && Number.isFinite(y)) pairs.push({ time: x.time, x: x.value, y });
  } return pairs;
}
export function linearRegression(pairs: readonly XYPair[]): { slope: number; intercept: number } | undefined { const points = pairs.filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y)); if (points.length < 2) return undefined; const meanX = points.reduce((sum, item) => sum + item.x, 0) / points.length; const meanY = points.reduce((sum, item) => sum + item.y, 0) / points.length; const divisor = points.reduce((sum, item) => sum + (item.x - meanX) ** 2, 0); if (!divisor) return undefined; return { slope: points.reduce((sum, item) => sum + (item.x - meanX) * (item.y - meanY), 0) / divisor, intercept: meanY - (points.reduce((sum, item) => sum + (item.x - meanX) * (item.y - meanY), 0) / divisor) * meanX }; }
export function pearsonCorrelation(pairs: readonly XYPair[]): number | undefined { const points = pairs.filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y)); if (points.length < 2) return undefined; const mx = points.reduce((sum, item) => sum + item.x, 0) / points.length; const my = points.reduce((sum, item) => sum + item.y, 0) / points.length; const top = points.reduce((sum, item) => sum + (item.x - mx) * (item.y - my), 0); const bottom = Math.sqrt(points.reduce((sum, item) => sum + (item.x - mx) ** 2, 0) * points.reduce((sum, item) => sum + (item.y - my) ** 2, 0)); return bottom ? top / bottom : undefined; }
