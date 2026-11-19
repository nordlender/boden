import { describe, it, expect } from 'vitest';
import { generateOrderCode, isOrderCodeFormat } from '../orderCode';

describe('generateOrderCode', () => {
	it("always ends a member order with M", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('member')).toMatch(/M$/);
		}
	});

	it("always ends an admin's order code with A", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('admin')).toMatch(/A$/);
		}
	});

	it("always ends a board member's order code with B", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('board')).toMatch(/B$/);
		}
	});

	it("always ends a moderator's (instructor's) order code with I", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOrderCode('moderator')).toMatch(/I$/);
		}
	});

	it('matches the NNAAX format', () => {
		expect(generateOrderCode('member')).toMatch(/^\d{2}[A-Z]{2}[ABIM]$/);
	});

	it('never draws the randomly-placed digits/letters from the ambiguous 0/O or 1/I pairs', () => {
		// The fixed 5th character legitimately can be 'I' (moderator) — this
		// only checks the two random digits and two random free letters
		// (positions 0-3), see ORDER_CODE_DIGITS / ORDER_CODE_FREE_LETTERS.
		for (let i = 0; i < 50; i++) {
			const code = generateOrderCode('member');
			const randomPart = code.slice(0, 4);
			expect(randomPart).not.toMatch(/[01IO]/);
		}
	});
});

describe('isOrderCodeFormat', () => {
	it('accepts every generated code', () => {
		for (const role of ['admin', 'board', 'moderator', 'member'] as const) {
			for (let i = 0; i < 20; i++) {
				expect(isOrderCodeFormat(generateOrderCode(role))).toBe(true);
			}
		}
	});

	it.each(['23AB', '23ABMM', '23abm', '23ABX', '03ABM', '23OBM', 'AB23M', '#23ABM', ''])('rejects %j', (code) => {
		expect(isOrderCodeFormat(code)).toBe(false);
	});
});
