export interface Timestamp { seconds: number; fraction: string }

/** Calendar datetimes with an explicit ISO 8601 UTC offset; never infer a local zone. */
export function parseTimestamp(value: unknown): Timestamp | undefined {
  if (typeof value !== 'string') return undefined;
  // ISO permits basic or extended calendar/time forms, omitted seconds, fractional
  // seconds, and offsets written as +hh, +hhmm, or +hh:mm. Do not impose RFC 3339.
  const match = /^(\d{4})(-?)(\d{2})\2(\d{2})T(\d{2})(:?)(\d{2})(?:\6(\d{2})(?:[.,](\d+))?)?(Z|[+-](\d{2})(?::?(\d{2}))?)$/.exec(value);
  if (!match) return undefined;
  const [, yearText, , monthText, dayText, hourText, , minuteText, secondText, fraction, offset, offsetHour, offsetMinute] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText ?? 0);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const valid = month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0)
    && hour <= 24 && minute <= 59 && second <= 60
    && (hour !== 24 || (minute === 0 && second === 0 && !/[1-9]/.test(fraction ?? '')))
    && Number(offsetHour ?? 0) <= 23 && Number(offsetMinute ?? 0) <= 59;
  if (!valid) return undefined;
  // Avoid Date.parse's narrower syntax and Date.UTC's special case for years 0–99.
  // The POSIX clock has no leap seconds: accepted second 60 rolls into the next
  // minute, and hour 24 rolls into the next day. Fractions are kept exactly.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  const offsetSeconds = (Number(offsetHour ?? 0) * 60 + Number(offsetMinute ?? 0)) * 60;
  return { seconds: date.getTime() / 1000 - (offset?.startsWith('-') ? -offsetSeconds : offsetSeconds), fraction: (fraction ?? '').replace(/0+$/, '') };
}

/** Compare exact decimal fractions without rounding an untrusted deadline. */
export function atOrAfter(now: Timestamp, deadline: Timestamp): boolean {
  if (now.seconds !== deadline.seconds) return now.seconds > deadline.seconds;
  const length = Math.max(now.fraction.length, deadline.fraction.length);
  return now.fraction.padEnd(length, '0') >= deadline.fraction.padEnd(length, '0');
}
