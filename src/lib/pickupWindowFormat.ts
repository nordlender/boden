// Pure (no db import) so both server components and client scripts
// (ReservationCalendar.astro) can share it — src/lib/pickupDays.ts pulls in
// the db client and can't be bundled for the browser.
export interface PickupWindowDisplay {
	startTime: string;
	endTime: string;
	where: string | null;
}

export function formatPickupWindow({ startTime, endTime, where }: PickupWindowDisplay): string {
	const time = `${startTime}–${endTime}`;
	return where ? `${time} · ${where}` : time;
}
