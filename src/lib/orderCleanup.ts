// Daily order housekeeping, run by the 'order-cleanup' scheduled job
// (src/lib/scheduledJobs/index.ts). Each step is idempotent: running it
// twice, or late, changes nothing more than running it once on time.
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { orders } from '../db/schema';
import { todayIsoInOslo } from './dates';

// A scheduled order whose pick-up day (fromDate) is over without a
// moderator handing it out (confirmRetrieval) was a no-show: from the next
// Oslo day on it moves to 'no_show'. That frees its stock
// (RESERVING_STATUSES) and its confirmed windows (PICKUP/
// RETURN_WINDOW_HOLDING_STATUSES), so it no longer blocks deleting them
// (#369). The window references themselves stay, as a record. Returns the
// moved orders' codes.
export function markNoShowOrders(today: string = todayIsoInOslo(), executor: Pick<typeof db, 'update'> = db): string[] {
	const moved = executor
		.update(orders)
		.set({ status: 'no_show' })
		.where(and(eq(orders.status, 'scheduled'), lt(orders.fromDate, today)))
		.returning({ orderCode: orders.orderCode })
		.all();
	return moved.map((row) => row.orderCode).sort((a, b) => a.localeCompare(b));
}
