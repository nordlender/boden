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

// Same as formatDateDisplay but for a real Date (e.g. a message's
// createdAt) rather than a YYYY-MM-DD string — includes the time since
// same-day posts are common on the message board.
export function formatDateTimeDisplay(value: Date): string {
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
