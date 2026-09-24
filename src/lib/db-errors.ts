// better-sqlite3 sets a typed `.code` on thrown errors (e.g.
// 'SQLITE_CONSTRAINT_UNIQUE'), which survives driver/SQLite message-format
// changes better than matching on `err.message`. `column` narrows to a
// specific unique index (e.g. 'users.email') when a caller needs to tell
// two different UNIQUE constraints apart; omit it to match any UNIQUE
// violation.
export function isUniqueConstraintViolation(err: unknown, column?: string): boolean {
  const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE') return false;
  if (!column) return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes(column);
}

// Same rationale as isUniqueConstraintViolation above — thrown when a write
// sets a FK column (e.g. orders.userId, confirmedByUserId) to an id that
// doesn't exist in the referenced table. Callers that write an FK column
// sourced from an ambient session id (locals.user!.id) rather than a
// freshly-looked-up row should catch this and return a clean result instead
// of letting it escape as an unhandled 500 — see moderatorOrders.ts's
// confirmRetrieval/markReturned and orders.ts's createOrder.
export function isForeignKeyViolation(err: unknown): boolean {
  const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
  return code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
}
