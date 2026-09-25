// Shared by both server-rendered components (OrderCodeHeader.astro) and
// client-side scripts (ReservationCalendar.astro) — plain Date/Intl usage,
// no server-only dependency, so it works in either context unchanged.
export function formatDateDisplay(value: string, options: { weekday?: boolean } = {}): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
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
