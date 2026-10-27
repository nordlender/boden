import { daysInclusive } from './dates';

// Single choke point for the max rental duration so a later
// admin-configurable version (see the linked GitHub issue) only has to
// change this one function's body — every call site goes through
// getMaxRentalDays(), never the raw constant.
export const MAX_RENTAL_DAYS = 14;

export function getMaxRentalDays(): number {
  return MAX_RENTAL_DAYS;
}

// The max is advisory, not a hard limit (#391): a longer range can still be
// requested, and is flagged for the moderator to decide on. Derived from the
// order's dates against the current max rather than snapshotted at
// submission, so the flag always reflects today's policy.
export function isOverMaxRental(fromDate: string, toDate: string): boolean {
  return daysInclusive(fromDate, toDate) > getMaxRentalDays();
}
