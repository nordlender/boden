// Shared by both server-rendered components (OrderCodeHeader.astro) and
// client-side scripts (ReservationCalendar.astro) — plain Date/Intl usage,
// no server-only dependency, so it works in either context unchanged.
//
// Display helpers use a fixed locale (Norwegian site; the UI text stays English)
const DISPLAY_LOCALE = 'nb-NO';
const SHOP_TIME_ZONE = 'Europe/Oslo';

const ISO_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

// True for a real calendar date in YYYY-MM-DD form. The round-trip check
// rejects impossible dates (2026-02-31) that Date would silently roll over.
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_FORMAT.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Adds `days` (may be negative) to a YYYY-MM-DD date. Pure UTC calendar
// arithmetic on a bare date, not a "what day is it now" read, so there is no
// viewer/server timezone to get wrong.
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Inclusive day count between two YYYY-MM-DD dates (same day = 1, not 0).
export function daysInclusive(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
}

export function formatDateDisplay(value: string, options: { weekday?: boolean } = {}): string {
  // A bare calendar date: parse and format on the UTC calendar so it can't
  // shift across midnight in any timezone.
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(DISPLAY_LOCALE, {
    timeZone: 'UTC',
    ...(options.weekday ? { weekday: 'short' as const } : {}),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// `Date#toISOString()` always renders UTC — using it to derive a "what day
// is it" string shifts by a day for any viewer/server whose local time is
// past midnight UTC but not yet past midnight in their own timezone (e.g.
// Oslo is UTC+1/+2, so between 00:00 and 01:00/02:00 local time,
// toISOString() still reports the *previous* day). The reservation flow
// (pick-up date validation, calendar "today" cutoff, pickup-days admin) is
// scoped to a physical shop in Oslo, so "today" must always mean today in
// Europe/Oslo regardless of the viewer's device timezone or the server's
// host timezone — hence deriving it via Intl instead of toISOString().
// Built with formatToParts() rather than relying on a locale's format()
// output happening to be YYYY-MM-DD: ECMA-402 leaves locale date patterns to
// CLDR data, not spec, so a future ICU update could change separators/field
// order out from under us (this has happened to other locales across Node
// minor versions). Extracting named parts sidesteps that entirely.
const OSLO_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Formats `date` as a YYYY-MM-DD string using the wall-clock date in
// Europe/Oslo at that instant — not UTC, not the caller's local timezone.
export function dateToIsoInOslo(date: Date): string {
  const parts = Object.fromEntries(
    OSLO_DATE_PARTS_FORMATTER.formatToParts(date).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Today's date (YYYY-MM-DD) as it currently reads on a clock in Oslo.
export function todayIsoInOslo(): string {
  return dateToIsoInOslo(new Date());
}

// dd/mm — used by the pickup-days tables (src/components/pickup-days/),
// where rows are dense and the year is implied by "upcoming". Parsed as
// UTC (not local midnight): unlike todayIsoInOslo() above, this formats an
// already-fixed YYYY-MM-DD calendar date rather than deriving "today", so
// there's no real-world "now" to get an Oslo-vs-UTC answer for — UTC
// parsing just avoids the date shifting a day in either direction depending
// on the viewer's own device timezone, same reasoning as
// ReservationCalendar.astro's addDaysIso.
export function formatDateShort(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

// Weekday name for a bare YYYY-MM-DD date — see formatDateShort re: UTC parsing.
export function formatWeekdayName(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

// Same as formatDateDisplay but for a real Date (e.g. a message's
// createdAt) rather than a YYYY-MM-DD string — includes the time since
// same-day posts are common on the message board.
export function formatDateTimeDisplay(value: Date): string {
  return value.toLocaleString(DISPLAY_LOCALE, {
    timeZone: SHOP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
