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
