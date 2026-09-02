import type { PiPointValue, PiTrendSeries, PiTrendTimeRange } from './piDataSource';

export function canAppendTrendSnapshot(
  previous: PiTrendTimeRange,
  next: PiTrendTimeRange,
): boolean {
  const previousDuration = previous.to - previous.from;
  const nextDuration = next.to - next.from;
  return next.to >= previous.to
    && previous.to >= next.from
    && Math.abs(previousDuration - nextDuration) <= 1;
}

export function appendTrendSnapshot(
  series: PiTrendSeries,
  snapshot: PiPointValue | undefined,
  range: PiTrendTimeRange,
): PiTrendSeries {
  const points = series.points.filter(({ time }) => time >= range.from && time <= range.to);
  const states = series.states?.filter(({ time }) => time >= range.from && time <= range.to);
  const value = snapshot?.value;

  if (typeof value === 'number' && Number.isFinite(value) && series.states === undefined) {
    const withoutCurrentTimestamp = points.filter(({ time }) => time !== range.to);
    withoutCurrentTimestamp.push({ time: range.to, value });
    withoutCurrentTimestamp.sort((left, right) => left.time - right.time);
    return { pointName: series.pointName, points: withoutCurrentTimestamp };
  }

  if (series.states !== undefined && value !== undefined && value !== null) {
    const nextStates = (states ?? []).filter(({ time }) => time !== range.to);
    nextStates.push({ time: range.to, value: String(value) });
    nextStates.sort((left, right) => left.time - right.time);
    return { pointName: series.pointName, points, states: nextStates };
  }

  return {
    pointName: series.pointName,
    points,
    ...(states ? { states } : {}),
  };
}
