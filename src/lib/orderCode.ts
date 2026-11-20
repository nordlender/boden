import type { Role } from './auth';

// Everything about what an order code looks like — kept free of the db
// client so pure callers (orderNotice.ts, tests) can use it without opening
// data/rental.db. Persisting a code (and retrying on collision) is
// createOrder's job in orders.ts.
//
// Format is `NNAAX` (see issue #155, revised): two digits, two free letters,
// then a role-flag letter always drawn from ORDER_CODE_ROLE_LETTERS — A/B/I/M
// for admin/board member/instructor (moderator)/member, so the creating role
// is legible at a glance.
export const ORDER_CODE_LENGTH = 5;

// Excludes 0/O and 1/I — an order code is read aloud by members to
// moderators. 'I' still appears as a *fixed* role-letter suffix below
// (ORDER_CODE_ROLE_LETTERS) — that's a single, always-in-the-same-position
// character, not a randomly drawn one, so it doesn't reintroduce the
// ambiguity this excludes from the two free-letter positions.
const ORDER_CODE_DIGITS = '23456789';
const ORDER_CODE_FREE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Maps the role that created the order to its fixed last-character letter —
// every order code's last letter is always one of these four, so the
// creating role is legible at a glance rather than merely "privileged vs.
// not". Ranked highest-privilege first: admin > board member > instructor
// (moderator) > member. A user can hold more than one of these at once (an
// admin is implicitly also a board member/instructor, etc.), but getRole()
// (src/lib/auth.ts) already resolves that down to a single highest-ranked
// Role before it ever reaches here, so this map is a direct one-to-one
// lookup.
const ORDER_CODE_ROLE_LETTERS: Record<Role, string> = {
	admin: 'A',
	board: 'B',
	moderator: 'I', // instructor
	member: 'M',
};

const ORDER_CODE_PATTERN = new RegExp(
	`^[${ORDER_CODE_DIGITS}]{2}[${ORDER_CODE_FREE_LETTERS}]{2}[${Object.values(ORDER_CODE_ROLE_LETTERS).join('')}]$`,
);

function randomChar(alphabet: string): string {
	return alphabet[Math.floor(Math.random() * alphabet.length)];
}

// `role` is the role of the member who created the order.
export function generateOrderCode(role: Role = 'member'): string {
	return (
		randomChar(ORDER_CODE_DIGITS) +
		randomChar(ORDER_CODE_DIGITS) +
		randomChar(ORDER_CODE_FREE_LETTERS) +
		randomChar(ORDER_CODE_FREE_LETTERS) +
		ORDER_CODE_ROLE_LETTERS[role]
	);
}

// True only for a string generateOrderCode could have produced.
export function isOrderCodeFormat(value: string): boolean {
	return ORDER_CODE_PATTERN.test(value);
}
