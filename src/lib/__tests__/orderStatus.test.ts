import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, RESERVING_STATUSES, isOrderStatus, memberOrderAction } from '../orderStatus';
import { orders } from '../../db/schema';

describe('order status constants', () => {
	it('ORDER_STATUSES matches the schema enum', () => {
		expect([...ORDER_STATUSES]).toEqual([...orders.status.enumValues]);
	});
	it('RESERVING_STATUSES are valid statuses and exclude terminal ones', () => {
		for (const s of RESERVING_STATUSES) expect(ORDER_STATUSES).toContain(s);
		expect([...RESERVING_STATUSES]).toEqual(['requested', 'scheduled', 'active']);
		expect(RESERVING_STATUSES).not.toContain('cancelled');
	});
	it('isOrderStatus validates', () => {
		expect(isOrderStatus('scheduled')).toBe(true);
		expect(isOrderStatus('nope')).toBe(false);
		expect(isOrderStatus(null)).toBe(false);
	});
});

describe('memberOrderAction', () => {
	it('deletes an unreviewed requested order', () => {
		expect(memberOrderAction('requested')).toBe('delete');
	});

	it('cancels an accepted (scheduled) order', () => {
		expect(memberOrderAction('scheduled')).toBe('cancel');
	});

	it('offers nothing from hand-out on', () => {
		for (const status of ['active', 'returned', 'rejected', 'cancelled']) {
			expect(memberOrderAction(status)).toBeNull();
		}
	});
});
