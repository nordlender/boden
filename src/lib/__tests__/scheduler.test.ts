import { describe, it, expect, vi } from 'vitest';
import { isJobDue, RETRY_AFTER_MS, Scheduler, type ScheduledJob } from '../scheduledJobs/scheduler';

// The job list imports the db client (order cleanup); keep it off the real db.
vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	return { db: createTestDb() };
});
const { scheduledJobsEnabled, SCHEDULED_JOBS } = await import('../scheduledJobs');

// 2026-11-17 is CET (UTC+1): 23:04Z = 00:04 Oslo on the 18th.
const at = (iso: string) => new Date(iso);
const quietLog = { info: vi.fn(), error: vi.fn() };

describe('isJobDue', () => {
	it('runs an interval job right away, then once the interval has passed', () => {
		const schedule = { everyMinutes: 10 };
		expect(isJobDue(schedule, {}, at('2026-11-17T12:00:00Z'))).toBe(true);
		expect(isJobDue(schedule, { lastRunAt: at('2026-11-17T12:00:00Z') }, at('2026-11-17T12:09:59Z'))).toBe(false);
		expect(isJobDue(schedule, { lastRunAt: at('2026-11-17T12:00:00Z') }, at('2026-11-17T12:10:00Z'))).toBe(true);
	});

	it('runs a daily job once per Oslo day, at or after its time', () => {
		const schedule = { dailyAt: '00:05' };
		expect(isJobDue(schedule, { lastRunDate: '2026-11-17' }, at('2026-11-17T23:04:00Z'))).toBe(false);
		expect(isJobDue(schedule, { lastRunDate: '2026-11-17' }, at('2026-11-17T23:05:00Z'))).toBe(true);
		expect(isJobDue(schedule, { lastRunDate: '2026-11-18' }, at('2026-11-18T10:00:00Z'))).toBe(false);
	});

	it('catches up on start: a daily job that has never run is due once its time has passed', () => {
		expect(isJobDue({ dailyAt: '00:05' }, {}, at('2026-11-17T09:00:00Z'))).toBe(true);
	});

	it('follows the Oslo clock across DST (CEST, UTC+2, in summer)', () => {
		expect(isJobDue({ dailyAt: '00:05' }, { lastRunDate: '2026-07-01' }, at('2026-07-01T22:04:00Z'))).toBe(false);
		expect(isJobDue({ dailyAt: '00:05' }, { lastRunDate: '2026-07-01' }, at('2026-07-01T22:05:00Z'))).toBe(true);
	});

	it('waits RETRY_AFTER_MS after a failure', () => {
		const failedAt = at('2026-11-17T12:00:00Z');
		expect(isJobDue({ everyMinutes: 1 }, { lastFailedAt: failedAt }, new Date(failedAt.getTime() + RETRY_AFTER_MS - 1))).toBe(false);
		expect(isJobDue({ everyMinutes: 1 }, { lastFailedAt: failedAt }, new Date(failedAt.getTime() + RETRY_AFTER_MS))).toBe(true);
	});
});

describe('Scheduler', () => {
	function scheduler(jobs: ScheduledJob[], now: () => Date) {
		return new Scheduler(jobs, { now, log: quietLog });
	}

	it('runs a due job on tick and records it, so it is not due again the same day', async () => {
		const run = vi.fn();
		let now = at('2026-11-17T09:00:00Z');
		const s = scheduler([{ name: 'daily', schedule: { dailyAt: '00:05' }, run }], () => now);
		await s.tick();
		await s.tick();
		expect(run).toHaveBeenCalledTimes(1);
		expect(s.getState('daily')?.lastRunDate).toBe('2026-11-17');
		now = at('2026-11-17T23:05:00Z');
		await s.tick();
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('never overlaps a job with itself', async () => {
		let finish!: () => void;
		const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		const s = scheduler([{ name: 'slow', schedule: { everyMinutes: 0 }, run }], () => at('2026-11-17T12:00:00Z'));
		const first = s.tick();
		await s.tick();
		expect(run).toHaveBeenCalledTimes(1);
		finish();
		await first;
	});

	it('logs a failure and keeps other jobs running', async () => {
		const ok = vi.fn();
		const s = scheduler(
			[
				{ name: 'broken', schedule: { everyMinutes: 1 }, run: () => Promise.reject(new Error('boom')) },
				{ name: 'fine', schedule: { everyMinutes: 1 }, run: ok },
			],
			() => at('2026-11-17T12:00:00Z'),
		);
		await s.tick();
		expect(ok).toHaveBeenCalledOnce();
		expect(s.getState('broken')).toMatchObject({ lastFailedAt: at('2026-11-17T12:00:00Z'), lastRunAt: undefined });
		expect(quietLog.error).toHaveBeenCalled();
	});

	it('rejects duplicate job names', () => {
		const job = { name: 'same', schedule: { everyMinutes: 1 }, run: () => {} };
		expect(() => scheduler([job, job], () => new Date())).toThrow('Duplicate scheduled job name: same');
	});
});

describe('SCHEDULED_JOBS', () => {
	it('runs the order cleanup once a day, shortly after midnight', () => {
		expect(SCHEDULED_JOBS.map((job) => [job.name, job.schedule])).toEqual([['order-cleanup', { dailyAt: '00:05' }]]);
	});
});

describe('scheduledJobsEnabled', () => {
	it('is off under vitest and with SCHEDULED_JOBS=off', () => {
		expect(scheduledJobsEnabled({ VITEST: 'true' })).toBe(false);
		expect(scheduledJobsEnabled({ SCHEDULED_JOBS: 'off' })).toBe(false);
		expect(scheduledJobsEnabled({})).toBe(true);
	});
});
