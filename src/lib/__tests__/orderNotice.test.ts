import { describe, expect, it } from 'vitest';
import type { AstroCookies } from 'astro';
import { setOrderNotice, takeOrderNotice } from '../orderNotice';

// Minimal in-memory stand-in for AstroCookies — only what orderNotice uses.
function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	return {
		jar,
		get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name),
	} as unknown as AstroCookies & { jar: Map<string, string> };
}

describe('order notice cookie', () => {
	it('round-trips once, then is gone', () => {
		const cookies = fakeCookies();
		setOrderNotice(cookies, 'cancelled', '23ABM');
		expect(takeOrderNotice(cookies)).toEqual({ kind: 'cancelled', orderCode: '23ABM' });
		expect(takeOrderNotice(cookies)).toBeNull();
	});

	it('returns null with no cookie', () => {
		expect(takeOrderNotice(fakeCookies())).toBeNull();
	});

	it('ignores and clears a malformed value', () => {
		const cookies = fakeCookies({ order_notice: 'cancelled:<script>' });
		expect(takeOrderNotice(cookies)).toBeNull();
		expect(cookies.jar.has('order_notice')).toBe(false);
		expect(takeOrderNotice(fakeCookies({ order_notice: 'archived:23ABM' }))).toBeNull();
	});
});
