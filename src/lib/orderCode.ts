// Order code format, kept in a dependency-free module so callers that only
// need to validate a code (e.g. orderNotice.ts) don't pull in the db client.

// NNAAX: two digits, two free letters, one role letter.
export const ORDER_CODE_LENGTH = 5;
