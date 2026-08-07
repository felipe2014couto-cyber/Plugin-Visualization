import type { TrendPoint } from '../../pi/piDataSource';

export interface TrendCursor {
  id: string;
  time: number;
}

export function resolveTrendCursorValue(
  points: readonly TrendPoint[],
  cursorTime: number,
): number | undefined {
  if (!Number.isFinite(cursorTime)) {
    return undefined;
  }

  const validPoints = points
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => left.time - right.time);
  if (validPoints.length === 0) {
    return undefined;
  }

  const uniquePoints = validPoints.filter((point, index) => (
    index === validPoints.length - 1 || point.time !== validPoints[index + 1].time
  ));
  const first = uniquePoints[0];
  const last = uniquePoints[uniquePoints.length - 1];
  if (cursorTime < first.time || cursorTime > last.time) {
    return undefined;
  }
  if (cursorTime === first.time || uniquePoints.length === 1) {
    return first.value;
  }
  if (cursorTime === last.time) {
    return last.value;
  }

  for (let index = 1; index < uniquePoints.length; index += 1) {
    const right = uniquePoints[index];
    if (cursorTime > right.time) {
      continue;
    }
    const left = uniquePoints[index - 1];
    if (cursorTime === right.time) {
      return right.value;
    }
    const fraction = (cursorTime - left.time) / (right.time - left.time);
    const value = left.value + (right.value - left.value) * fraction;
    return Number.isFinite(value) ? value : undefined;
  }

  return undefined;
}

export function clampTrendCursorTime(
  points: readonly TrendPoint[],
  time: number,
): number | undefined {
  const validTimes = points
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .map((point) => point.time)
    .sort((left, right) => left - right);
  if (validTimes.length === 0 || !Number.isFinite(time)) {
    return undefined;
  }
  return Math.max(validTimes[0], Math.min(validTimes[validTimes.length - 1], time));
}

export function isTrendCursorWithinSeries(
  points: readonly TrendPoint[],
  time: number,
): boolean {
  return resolveTrendCursorValue(points, time) !== undefined;
}
