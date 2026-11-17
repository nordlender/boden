// The server's recurring jobs, and the one place they start from. To add a
// job, append it to SCHEDULED_JOBS — see scheduler.ts for the schedule
// kinds — and keep it idempotent: there is no persisted run history, so a
// job may run again after a restart.
//
// Astro (and the Node adapter) has no "server started" hook, so the
// middleware calls ensureScheduledJobsStarted() on every on-demand request;
// only the first call does anything. dailyAt jobs catch up on start, so a
// server that sleeps until its first request still runs the day's cleanup.
import { markNoShowOrders } from '../orderCleanup';
import { Scheduler, type ScheduledJob } from './scheduler';

export const SCHEDULED_JOBS: readonly ScheduledJob[] = [
	{
		// Scheduled orders nobody picked up become 'no_show' the day after
		// their pick-up day (src/lib/orderCleanup.ts).
		name: 'order-cleanup',
		schedule: { dailyAt: '00:05' },
		run: () => {
			const codes = markNoShowOrders();
			return codes.length > 0 ? `marked ${codes.length} order(s) no-show: ${codes.join(', ')}` : undefined;
		},
	},
];

// On globalThis rather than a module variable: in dev, Vite re-evaluates
// this module on HMR, and the old scheduler must be replaced, not doubled.
const SCHEDULER_KEY = Symbol.for('boden.scheduledJobs');
type SchedulerHolder = { [SCHEDULER_KEY]?: Scheduler };

// Off under test runs, and when SCHEDULED_JOBS=off (e.g. a second server
// process pointed at the same db, or debugging). Read like the other
// settings (import.meta.env: .env in dev, baked in at build), with the
// process environment as a runtime fallback.
const DEFAULT_ENV = {
	SCHEDULED_JOBS: import.meta.env.SCHEDULED_JOBS ?? process.env.SCHEDULED_JOBS,
	VITEST: process.env.VITEST,
};

export function scheduledJobsEnabled(env: Record<string, string | undefined> = DEFAULT_ENV): boolean {
	return env.SCHEDULED_JOBS !== 'off' && !env.VITEST;
}

export function ensureScheduledJobsStarted(): void {
	if (!scheduledJobsEnabled()) return;
	const holder = globalThis as SchedulerHolder;
	const current = holder[SCHEDULER_KEY];
	if (current?.jobs === SCHEDULED_JOBS) return;
	current?.stop();
	const scheduler = new Scheduler(SCHEDULED_JOBS);
	holder[SCHEDULER_KEY] = scheduler;
	scheduler.start();
}
