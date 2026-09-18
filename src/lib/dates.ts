// Shared by both server-rendered components (OrderCodeHeader.astro) and
// client-side scripts (ReservationCalendar.astro) — plain Date/Intl usage,
// no server-only dependency, so it works in either context unchanged.
export function formatDateDisplay(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
