# Scheduled jobs

Recurring server-side work runs in-process on a small scheduler, not through
an external cron. The pieces:

- `src/lib/scheduledJobs/scheduler.ts` — the framework: a `ScheduledJob`
  (name, schedule, `run`), the pure `isJobDue` timing rule, and the
  `Scheduler` that ticks once a minute and runs whatever is due.
- `src/lib/scheduledJobs/index.ts` — `SCHEDULED_JOBS`, the list of jobs, and
  `ensureScheduledJobsStarted()`.
- `src/middleware/index.ts` — calls `ensureScheduledJobsStarted()` on every
  on-demand request. Astro and its Node adapter have no "server started"
  hook, so the first request starts the scheduler; every later call is a
  no-op. Prerendered pages (built at `astro build`) never start it.

## Schedules

| Schedule | Runs |
| --- | --- |
| `{ everyMinutes: n }` | On the first tick after start, then whenever `n` minutes have passed since the last successful run. |
| `{ dailyAt: 'HH:MM' }` | Once per Oslo calendar day, on the first tick at or after `HH:MM` Europe/Oslo time (DST is handled by reading the Oslo wall clock). A server that starts after `HH:MM` runs that day's job right away, so a run missed while the server was down (or idle until its first request) is caught up. |

There is no persisted run history: after a restart every job counts as never
having run. **Jobs must therefore be idempotent.** Running one twice, or
late, must not change more than running it once on time.

A job that throws is logged (`[scheduled job] <name> failed …`) and retried
on its next due tick, but no sooner than 15 minutes later. Other jobs keep
running. A job never overlaps itself: a run still in progress makes the
next tick skip it. A job may return a string, which is logged as the run's
summary. Return nothing to stay quiet.

## Adding a job

Append to `SCHEDULED_JOBS` in `src/lib/scheduledJobs/index.ts`:

```ts
{
	name: 'my-job', // unique, used in log lines
	schedule: { dailyAt: '03:00' },
	run: () => {
		const changed = doTheWork(); // keep it idempotent
		return changed > 0 ? `changed ${changed} rows` : undefined;
	},
},
```

Put the work itself in a normal `src/lib/` module that takes its inputs
(e.g. today's date) as parameters, so it can be unit-tested without the
scheduler, as `markNoShowOrders` is in `src/lib/__tests__/orderCleanup.test.ts`.

## Turning it off

Set `SCHEDULED_JOBS=off` to start the server without any jobs, e.g. for a
second server process pointed at the same database (only one process
should run the jobs) or while debugging. Test runs (`VITEST`) never start
the scheduler.

## Jobs

### `order-cleanup` (daily at 00:05)

`markNoShowOrders` in `src/lib/orderCleanup.ts`: a `scheduled` order whose
pick-up day (`fromDate`) has passed without a moderator handing it out
becomes `no_show` the next day. A no-show holds no stock and no confirmed
window, so it no longer blocks deleting the window or its recurring rule
(#369). Its `pickupDayId` / `returnDayId` stay as a record until the window
itself is deleted.
