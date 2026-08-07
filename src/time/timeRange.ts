export interface DisplayTimeRange {
  from: number;
  to: number;
}

export interface DisplayTimeSelection {
  startExpression: string;
  endExpression: string;
  range: DisplayTimeRange;
}

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function createDefaultTimeSelection(now = Date.now()): DisplayTimeSelection {
  return {
    startExpression: '*-8h',
    endExpression: '*',
    range: { from: now - 8 * UNIT_MS.h, to: now },
  };
}

export function resolveTimeSelection(
  startExpression: string,
  endExpression: string,
  now = Date.now(),
): DisplayTimeSelection | undefined {
  const from = parseTimeExpression(startExpression, now);
  const to = parseTimeExpression(endExpression, now);
  if (from === undefined || to === undefined || from >= to) {
    return undefined;
  }
  return {
    startExpression: startExpression.trim(),
    endExpression: endExpression.trim(),
    range: { from, to },
  };
}

export function parseTimeExpression(expression: string, now = Date.now()): number | undefined {
  const normalized = expression.trim().toLocaleLowerCase();
  if (normalized === '*') {
    return now;
  }

  const relative = /^\*([+-])(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(normalized);
  if (relative) {
    const amount = Number(relative[2]);
    const delta = amount * UNIT_MS[relative[3]];
    return relative[1] === '-' ? now - delta : now + delta;
  }

  const absolute = Date.parse(expression.trim());
  return Number.isFinite(absolute) ? absolute : undefined;
}

export function shiftTimeSelection(
  selection: DisplayTimeSelection,
  direction: -1 | 1,
): DisplayTimeSelection {
  const duration = selection.range.to - selection.range.from;
  const from = selection.range.from + duration * direction;
  const to = selection.range.to + duration * direction;
  return {
    startExpression: formatAbsoluteTime(from),
    endExpression: formatAbsoluteTime(to),
    range: { from, to },
  };
}

export function moveTimeSelectionToNow(
  selection: DisplayTimeSelection,
  now = Date.now(),
): DisplayTimeSelection {
  const duration = selection.range.to - selection.range.from;
  return {
    startExpression: `*-${formatRelativeDuration(duration)}`,
    endExpression: '*',
    range: { from: now - duration, to: now },
  };
}

export function formatAbsoluteTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatRelativeDuration(duration: number): string {
  for (const unit of ['w', 'd', 'h', 'm', 's'] as const) {
    if (duration >= UNIT_MS[unit] && duration % UNIT_MS[unit] === 0) {
      return `${duration / UNIT_MS[unit]}${unit}`;
    }
  }
  return `${Math.max(1, Math.round(duration / UNIT_MS.m))}m`;
}
