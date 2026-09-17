// Single choke point for the max rental duration so a later
// admin-configurable version (see the linked GitHub issue) only has to
// change this one function's body — every call site goes through
// getMaxRentalDays(), never the raw constant.
export const MAX_RENTAL_DAYS = 14;

export function getMaxRentalDays(): number {
  return MAX_RENTAL_DAYS;
}
