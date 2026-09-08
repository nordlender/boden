// Calendar-day helpers anchored to the club's timezone.
//
// Every date this app stores or compares (orders.fromDate/toDate,
// pickupAvailableDays.date — all YYYY-MM-DD, see src/db/schema.ts) is a
// *calendar day at the club*, not an instant. Deriving those strings with
// `new Date().toISOString().slice(0, 10)` silently reads them in UTC, and
// bare `Date` field accessors (getFullYear/getMonth/getDate) read them in
// whatever timezone the host happens to be in — the Node process on the
// server, the visitor's device in the browser. Both are wrong: for a club in
// Norway, "today" and "is this cell an available pick-up day" flip a day
// around midnight CET/CEST (UTC+1 in winter, UTC+2 in summer), and a visitor
// abroad would otherwise see the green pick-up days shifted.
//
// Anchoring to Europe/Oslo makes these computations deterministic and
// independent of both the server process's and the browser's ambient
// timezone. It's also the right anchor going forward: pick-up *times* are
// planned to be CET-based.
//
// This module is deliberately dependency-free (no db, no node-only APIs) so
// it can be imported from .astro frontmatter, server-side lib code, and
// client `<script>` blocks alike.
export const CLUB_TIMEZONE = 'Europe/Oslo';

// `formatToParts` rather than the formatted string: it doesn't depend on a
// locale's field order or separator, so the YYYY-MM-DD shape is ours, not
// the ICU data's.
//
// Built lazily and cached: constructing an Intl.DateTimeFormat is the
// expensive part, and this module is also bundled into the reservation
// calendar's client script, which only ever calls isoDateFromUtcMidnight —
// keeping the formatter behind a function lets the bundler drop it there.
let clubDateFormatter: Intl.DateTimeFormat | undefined;

function getClubDateFormatter(): Intl.DateTimeFormat {
	clubDateFormatter ??= new Intl.DateTimeFormat('en-CA', {
		timeZone: CLUB_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	return clubDateFormatter;
}

// The calendar day, at the club, that the given instant falls on — as
// YYYY-MM-DD.
export function toIsoDateInClubTimezone(date: Date): string {
	const parts = getClubDateFormatter().formatToParts(date);
	let year = '';
	let month = '';
	let day = '';
	for (const part of parts) {
		if (part.type === 'year') year = part.value;
		else if (part.type === 'month') month = part.value;
		else if (part.type === 'day') day = part.value;
	}
	// `month`/`day` come back zero-padded from the '2-digit' options; `year`
	// is only padded past four digits by ICU, so pad it here for the (purely
	// theoretical) pre-1000 case rather than emitting a short string that
	// would compare wrong against other YYYY-MM-DD values.
	return `${year.padStart(4, '0')}-${month}-${day}`;
}

// Today's calendar day at the club, as YYYY-MM-DD.
export function todayIsoInClubTimezone(): string {
	return toIsoDateInClubTimezone(new Date());
}

// For `Date` values that are not instants at all but a *plain calendar date*
// encoded as `Date.UTC(y, m - 1, d)` — the convention cally uses for the day
// it hands `<calendar-range>`'s `getDayParts` (see its `E()` helper), and the
// one src/lib/reservation.ts's `dayAfter` does date arithmetic in. Such a
// value carries no timezone meaning, so it must be read back with UTC fields:
// converting it through *any* zone (including the club's) only happens to
// work while that zone's offset is positive and under 24h.
export function isoDateFromUtcMidnight(date: Date): string {
	const year = String(date.getUTCFullYear()).padStart(4, '0');
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
