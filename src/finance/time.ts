type FinanceTime = { text: string; title: string; timeZone: string | null };

/** Format quote instants in their declared zone, or the browser's local zone. */
export function createFinanceTimeFormatter(locale: string, preferredTimeZone?: unknown) {
  const options: Intl.DateTimeFormatOptions = {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  };
  let short: Intl.DateTimeFormat;
  try {
    short = new Intl.DateTimeFormat(locale, {
      ...options, ...(typeof preferredTimeZone === 'string' && preferredTimeZone.trim() ? { timeZone: preferredTimeZone.trim() } : {}),
    });
  } catch {
    short = new Intl.DateTimeFormat(locale, options);
  }
  const timeZone = short.resolvedOptions().timeZone;
  const full = new Intl.DateTimeFormat(locale, { ...options, timeZone, year: 'numeric', timeZoneName: 'longOffset' });
  const calendarDate = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  return (raw?: string | null): FinanceTime | null => {
    if (!raw) return null;
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return null;
    // A NAV date is a calendar observation, not an instant to shift across zones.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      if (date.toISOString().slice(0, 10) !== raw) return null;
      const text = calendarDate.format(date);
      return { text, title: text, timeZone: null };
    }
    return { text: short.format(date), title: `${full.format(date)} (${timeZone})`, timeZone };
  };
}
