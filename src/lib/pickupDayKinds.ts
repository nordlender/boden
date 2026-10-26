// Pure (no db import) so both PickupDaysCalendar.astro's frontmatter and its
// client script can use it.
import { dateToIsoInOslo } from './dates';

export type PickupDayCalendarKind = 'recurring' | 'mine' | 'other';

export interface PickupDayKindRow {
	date: string;
	kind: 'single' | 'recurring';
	userId: string;
}

// One kind per date. When several rows share a date, the highest precedence
// wins: a recurring training day comes first, then "is this mine".
const PRECEDENCE: Record<PickupDayCalendarKind, number> = { recurring: 2, mine: 1, other: 0 };

export function buildPickupDayKinds(rows: PickupDayKindRow[], currentUserId: string): Record<string, PickupDayCalendarKind> {
	const kindByDate: Record<string, PickupDayCalendarKind> = {};
	for (const row of rows) {
		const kind: PickupDayCalendarKind = row.kind === 'recurring' ? 'recurring' : row.userId === currentUserId ? 'mine' : 'other';
		const existing = kindByDate[row.date];
		if (!existing || PRECEDENCE[kind] > PRECEDENCE[existing]) {
			kindByDate[row.date] = kind;
		}
	}
	return kindByDate;
}

// Cally's getDayParts callback. Cally passes each cell as a UTC-midnight Date.
// Read in Oslo (UTC+1/+2) that is still the same calendar day, so the key
// matches the server's YYYY-MM-DD dates.
export function pickupDayPartsFor(dayKinds: Record<string, PickupDayCalendarKind>): (date: Date) => string {
	return (date) => dayKinds[dateToIsoInOslo(date)] ?? '';
}
