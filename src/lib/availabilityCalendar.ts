// Data for <AvailabilityCalendar>: how many of each of a product's variants
// are available on each of the next CALENDAR_DAYS days, from
// src/lib/availability.ts's per-day model.
import { db } from '../db/client';
import { getDailyAvailability, getStockCounts, setDailyAvailability } from './availability';
import { getSetChildrenBulk } from './sets';
import { todayIsoInOslo } from './dates';

// Four weeks, starting today.
export const CALENDAR_DAYS = 28;

export interface VariantCalendar {
	// "item-<id>" / "set-<id>" — matches VariantPicker's data-selected-variant.
	key: string;
	// Units (or whole sets) available per day, index 0 = `start`. Never negative.
	daily: number[];
	// The most that could ever be available (stockCount, or whole sets).
	total: number;
}

export function variantKey(kind: 'item' | 'set', id: number): string {
	return `${kind}-${id}`;
}

/** Calendars for every non-archived variant of a product, starting today. */
export async function getProductVariantCalendars(productId: number): Promise<{ start: string; calendars: VariantCalendar[] }> {
	const start = todayIsoInOslo();
	const [itemRows, setRows] = await Promise.all([
		db.query.items.findMany({ where: (t, { and, eq }) => and(eq(t.productId, productId), eq(t.archived, false)), columns: { id: true, stockCount: true } }),
		db.query.sets.findMany({ where: (t, { and, eq }) => and(eq(t.productId, productId), eq(t.archived, false)), columns: { id: true } }),
	]);

	const componentsBySet = await getSetChildrenBulk(setRows.map((s) => s.id));
	const allItemIds = [...itemRows.map((i) => i.id), ...[...componentsBySet.values()].flat().map((c) => c.itemId)];
	const daily = getDailyAvailability(allItemIds, start, CALENDAR_DAYS, { today: start });
	const stock = getStockCounts(allItemIds);

	const calendars: VariantCalendar[] = [
		...itemRows.map((item) => ({
			key: variantKey('item', item.id),
			daily: (daily.get(item.id) ?? []).map((n) => Math.max(0, n)),
			total: item.stockCount,
		})),
		...setRows.map((set) => {
			const components = componentsBySet.get(set.id) ?? [];
			const totalDaily = new Map(components.map((c) => [c.itemId, new Array<number>(CALENDAR_DAYS).fill(stock.get(c.itemId) ?? 0)]));
			return {
				key: variantKey('set', set.id),
				daily: setDailyAvailability(components, daily, CALENDAR_DAYS),
				total: setDailyAvailability(components, totalDaily, 1)[0],
			};
		}),
	];
	return { start, calendars };
}
