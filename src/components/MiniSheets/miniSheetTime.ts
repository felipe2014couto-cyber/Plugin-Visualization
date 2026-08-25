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
  mo: 30 * 86_400_000,
  y: 365 * 86_400_000,
};

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  fev: 1,
  feb: 1,
  mar: 2,
  abr: 3,
  apr: 3,
  mai: 4,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  aug: 7,
  set: 8,
  sep: 8,
  out: 9,
  oct: 9,
  nov: 10,
  dez: 11,
  dec: 11,
};

export function parsePiTime(expression: string, now = Date.now()): number | undefined {
  if (!expression || typeof expression !== 'string') {
    return undefined;
  }

  const trimmed = expression.trim();
  if (trimmed === '*') {
    return now;
  }

  // Handle 't' / 'today' (beginning of today 00:00:00)
  const nowDate = new Date(now);
  const todayMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 0, 0, 0, 0).getTime();
  const yesterdayMidnight = todayMidnight - 86_400_000;

  if (/^(t|today)$/i.test(trimmed)) {
    return todayMidnight;
  }

  if (/^(y|yesterday)$/i.test(trimmed)) {
    return yesterdayMidnight;
  }

  // Handle relative offsets like *-8h, *+15m, t+8h, t-1d, y+8h, yesterday-2h
  const relMatch = /^(\*|t|today|y|yesterday)([+-])(\d+(?:\.\d+)?)(s|m|h|d|w|mo|y)$/i.exec(trimmed);
  if (relMatch) {
    const baseStr = relMatch[1].toLowerCase();
    const sign = relMatch[2];
    const amount = Number(relMatch[3]);
    const unit = relMatch[4].toLowerCase();
    const unitMs = TIME_UNITS[unit];

    let baseMs = now;
    if (baseStr === 't' || baseStr === 'today') {
      baseMs = todayMidnight;
    } else if (baseStr === 'y' || baseStr === 'yesterday') {
      baseMs = yesterdayMidnight;
    }

    if (unitMs !== undefined && Number.isFinite(amount)) {
      const delta = amount * unitMs;
      return sign === '-' ? baseMs - delta : baseMs + delta;
    }
  }

  // 1. Format: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (with optional HH:mm or HH:mm:ss)
  // Ex: 25/08/2026 09:00:00, 25/08/2026 09:00, 25/08/2026, 25-08-2026 09:00, 25/08/26
  const dmyMatch = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4}|\d{2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(trimmed);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    if (year < 100) {
      year += 2000;
    }
    const hour = dmyMatch[4] !== undefined ? parseInt(dmyMatch[4], 10) : 0;
    const min = dmyMatch[5] !== undefined ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] !== undefined ? parseInt(dmyMatch[6], 10) : 0;

    if (
      month >= 1 && month <= 12 &&
      day >= 1 && day <= 31 &&
      hour >= 0 && hour <= 23 &&
      min >= 0 && min <= 59 &&
      sec >= 0 && sec <= 59
    ) {
      const d = new Date(year, month - 1, day, hour, min, sec);
      if (Number.isFinite(d.getTime())) {
        return d.getTime();
      }
    }
  }

  // 2. Format: YYYY-MM-DD or YYYY/MM/DD (with optional HH:mm or HH:mm:ss or ISO format)
  // Ex: 2026-08-25 09:00:00, 2026-08-25T09:00:00, 2026-08-25
  const ymdMatch = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(trimmed);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] !== undefined ? parseInt(ymdMatch[4], 10) : 0;
    const min = ymdMatch[5] !== undefined ? parseInt(ymdMatch[5], 10) : 0;
    const sec = ymdMatch[6] !== undefined ? parseInt(ymdMatch[6], 10) : 0;

    if (
      month >= 1 && month <= 12 &&
      day >= 1 && day <= 31 &&
      hour >= 0 && hour <= 23 &&
      min >= 0 && min <= 59 &&
      sec >= 0 && sec <= 59
    ) {
      const d = new Date(year, month - 1, day, hour, min, sec);
      if (Number.isFinite(d.getTime())) {
        return d.getTime();
      }
    }
  }

  // 3. Textual month format: 25-ago-2026 09:00:00, 25-ago-26, 25-Aug-2026
  const textMonthMatch = /^(\d{1,2})[\/\-\s]+([a-zA-Záéíóúãõç]{3,})[\/\-\s]+(\d{4}|\d{2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/i.exec(trimmed);
  if (textMonthMatch) {
    const day = parseInt(textMonthMatch[1], 10);
    const monthKey = textMonthMatch[2].toLowerCase().slice(0, 3);
    const monthIdx = MONTH_MAP[monthKey];
    let year = parseInt(textMonthMatch[3], 10);
    if (year < 100) {
      year += 2000;
    }
    const hour = textMonthMatch[4] !== undefined ? parseInt(textMonthMatch[4], 10) : 0;
    const min = textMonthMatch[5] !== undefined ? parseInt(textMonthMatch[5], 10) : 0;
    const sec = textMonthMatch[6] !== undefined ? parseInt(textMonthMatch[6], 10) : 0;

    if (
      monthIdx !== undefined &&
      day >= 1 && day <= 31 &&
      hour >= 0 && hour <= 23 &&
      min >= 0 && min <= 59 &&
      sec >= 0 && sec <= 59
    ) {
      const d = new Date(year, monthIdx, day, hour, min, sec);
      if (Number.isFinite(d.getTime())) {
        return d.getTime();
      }
    }
  }

  // 4. Fallback to native Date.parse
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
