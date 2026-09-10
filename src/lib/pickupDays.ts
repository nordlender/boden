import { asc, eq, gte } from 'drizzle-orm';
import { db } from '../db/client';
import { pickupAvailableDays } from '../db/schema';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
	return DATE_FORMAT.test(value);
}

// Every pick-up day from `fromDate` onward that has a moderator confirmed
// available — used by the /reservation page to color the calendar. No upper
// bound: admins are expected to only ever add a modest number of upcoming
// dates (see /admin/pickup-days), so there's no pagination concern here.
export async function getUpcomingAvailablePickupDates(fromDate: string): Promise<string[]> {
	const rows = await db
		.select({ date: pickupAvailableDays.date })
		.from(pickupAvailableDays)
		.where(gte(pickupAvailableDays.date, fromDate))
		.orderBy(asc(pickupAvailableDays.date));
	return rows.map((row) => row.date);
}

// All dates on record, past and future — the admin page shows the full
// history rather than silently hiding rows that have already passed.
export async function listAvailablePickupDates(): Promise<string[]> {
	const rows = await db.select({ date: pickupAvailableDays.date }).from(pickupAvailableDays).orderBy(asc(pickupAvailableDays.date));
	return rows.map((row) => row.date);
}

export async function addAvailablePickupDate(date: string): Promise<void> {
	if (!isValidDateString(date)) return;
	await db.insert(pickupAvailableDays).values({ date }).onConflictDoNothing();
}

export async function removeAvailablePickupDate(date: string): Promise<void> {
	await db.delete(pickupAvailableDays).where(eq(pickupAvailableDays.date, date));
}
