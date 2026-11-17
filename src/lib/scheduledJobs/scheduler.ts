// A small in-process scheduler for recurring server jobs (order cleanup and
// whatever comes later). One timer ticks every minute and runs each job
// whose schedule says it's due; there is no persisted job state, so jobs
// must be idempotent — they may run again after a restart. See
// src/lib/scheduledJobs/index.ts for the job list and how it starts.
import { timeNowOslo } from '../dates';

export type JobSchedule =
	// Every `minutes` minutes; the first run is on the first tick after start.
	| { everyMinutes: number }
	// Once per Oslo calendar day, on the first tick at or after `at` (HH:MM,
	// Europe/Oslo wall clock, so DST needs no special handling). A server
	// that starts after `at` runs that day's job right away, catching up on
	// a run it missed while it was down.
	| { dailyAt: string };

export interface ScheduledJob {
	// Unique; used in log lines.
	name: string;
	schedule: JobSchedule;
	// May be async. A returned string is logged as the run's summary.
	run: () => string | void | Promise<string | void>;
}

export interface JobState {
	lastRunAt?: Date;
	// Oslo date (YYYY-MM-DD) of the last successful run — what dailyAt keys on.
	lastRunDate?: string;
	lastFailedAt?: Date;
}

const MINUTE_MS = 60_000;
// A failed job is retried on its next due tick, but no sooner than this.
export const RETRY_AFTER_MS = 15 * MINUTE_MS;

// Whether `schedule` wants a run at `now`, given what has already happened.
// Pure, so the timing rules are unit-tested without timers.
export function isJobDue(schedule: JobSchedule, state: JobState, now: Date): boolean {
	if (state.lastFailedAt && now.getTime() - state.lastFailedAt.getTime() < RETRY_AFTER_MS) return false;
	if ('everyMinutes' in schedule) {
		return !state.lastRunAt || now.getTime() - state.lastRunAt.getTime() >= schedule.everyMinutes * MINUTE_MS;
	}
	const oslo = timeNowOslo(now);
	return oslo.time >= schedule.dailyAt && state.lastRunDate !== oslo.date;
}

export interface SchedulerOptions {
	tickMs?: number;
	now?: () => Date;
	log?: Pick<Console, 'info' | 'error'>;
}

export class Scheduler {
	private readonly states = new Map<string, JobState & { running: boolean }>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private readonly tickMs: number;
	private readonly now: () => Date;
	private readonly log: Pick<Console, 'info' | 'error'>;

	constructor(
		readonly jobs: readonly ScheduledJob[],
		options: SchedulerOptions = {},
	) {
		for (const job of jobs) {
			if (this.states.has(job.name)) throw new Error(`Duplicate scheduled job name: ${job.name}`);
			this.states.set(job.name, { running: false });
		}
		this.tickMs = options.tickMs ?? MINUTE_MS;
		this.now = options.now ?? (() => new Date());
		this.log = options.log ?? console;
	}

	// Ticks once right away, then every tickMs. The timer is unref'd, so it
	// never keeps a process (a build, a test run) alive on its own.
	start(): void {
		if (this.timer) return;
		void this.tick();
		this.timer = setInterval(() => void this.tick(), this.tickMs);
		this.timer.unref?.();
	}

	stop(): void {
		clearInterval(this.timer);
		this.timer = undefined;
	}

	// Runs every due job. A job still running from an earlier tick is
	// skipped, so a slow run never overlaps itself.
	async tick(): Promise<void> {
		await Promise.all(this.jobs.map((job) => this.runIfDue(job)));
	}

	getState(name: string): JobState | undefined {
		const state = this.states.get(name);
		return state && { lastRunAt: state.lastRunAt, lastRunDate: state.lastRunDate, lastFailedAt: state.lastFailedAt };
	}

	private async runIfDue(job: ScheduledJob): Promise<void> {
		const state = this.states.get(job.name)!;
		const now = this.now();
		if (state.running || !isJobDue(job.schedule, state, now)) return;
		state.running = true;
		try {
			const summary = await job.run();
			state.lastRunAt = now;
			state.lastRunDate = timeNowOslo(now).date;
			state.lastFailedAt = undefined;
			if (summary) this.log.info(`[scheduled job] ${job.name}: ${summary}`);
		} catch (err) {
			state.lastFailedAt = now;
			this.log.error(`[scheduled job] ${job.name} failed; retrying in ${RETRY_AFTER_MS / MINUTE_MS} min or later`, err);
		} finally {
			state.running = false;
		}
	}
}
