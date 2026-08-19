/**
 * Time resolution helper for MiniSheets PI formulas.
 * Supports:
 *  - '*' (current time)
 *  - '*-30s', '*-15m', '*-1h', '*-8h', '*-1d', '*-7d' (and other relative offsets: s, m, h, d, w, mo)
 *  - Absolute date string parsable by Date.parse
 */

const TIME_UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parsePiTime(expression: string, now = Date.now()): number | undefined {
  if (!expression || typeof expression !== 'string') {
    return undefined;
  }

  const trimmed = expression.trim();
  if (trimmed === '*') {
    return now;
  }

  const match = /^\*([+-])(\d+(?:\.\d+)?)(s|m|h|d|w)$/i.exec(trimmed);
  if (match) {
    const sign = match[1];
    const amount = Number(match[2]);
    const unit = match[3].toLowerCase();
    const unitMs = TIME_UNITS[unit];
    if (unitMs !== undefined && Number.isFinite(amount)) {
      const delta = amount * unitMs;
      return sign === '-' ? now - delta : now + delta;
    }
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    return parsedDate;
  }

  return undefined;
}

export function parseIntervalToMs(interval: string): number | undefined {
  if (!interval || typeof interval !== 'string') {
    return undefined;
  }

  const trimmed = interval.trim();
  const match = /^(\d+(?:\.\d+)?)(s|m|h|d|w)$/i.exec(trimmed);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const unitMs = TIME_UNITS[unit];
    if (unitMs !== undefined && Number.isFinite(amount) && amount > 0) {
      return amount * unitMs;
    }
  }

  const directNum = Number(trimmed);
  if (Number.isFinite(directNum) && directNum > 0) {
    return directNum * 1_000;
  }

  return undefined;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}
