import { describe, it, expect, vi } from 'vitest';
import type { APIContext } from 'astro';

const { getOrderIdByCode } = vi.hoisted(() => ({ getOrderIdByCode: vi.fn() }));
vi.mock('../../../../lib/moderatorOrders', () => ({ getOrderIdByCode }));

const { POST } = await import('../retrieve');

// Mirrors how Astro's own redirect() behaves for the assertions below —
// no framework running here, just enough of APIContext for the handler.
function redirect(path: string, status = 302): Response {
	return new Response(null, { status, headers: { Location: path } });
}

function makeContext(opts: { code?: string; user?: { role: 'member' | 'moderator' | 'admin' } | null }): APIContext {
	const form = new FormData();
	if (opts.code !== undefined) form.set('code', opts.code);
	return {
		request: { formData: async () => form } as unknown as Request,
		redirect,
		locals: { user: opts.user ?? { role: 'moderator' } },
	} as unknown as APIContext;
}

describe('POST /api/moderator/retrieve', () => {
	it('returns 403 for a member (requireModerator gate)', async () => {
		const response = await POST(makeContext({ code: 'AB12CD', user: { role: 'member' } }));
		expect(response.status).toBe(403);
		expect(getOrderIdByCode).not.toHaveBeenCalled();
	});

	it('redirects back to the form with error=not_found when the code matches no order', async () => {
		getOrderIdByCode.mockResolvedValueOnce(null);
		const response = await POST(makeContext({ code: 'NOSUCH' }));
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/moderator/retrieve?error=not_found');
	});

	it('redirects to the order hub on a successful lookup', async () => {
		getOrderIdByCode.mockResolvedValueOnce(42);
		const response = await POST(makeContext({ code: 'ab12cd' }));
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toBe('/moderator/retrieve/42');
		expect(getOrderIdByCode).toHaveBeenCalledWith('AB12CD');
	});
});
