export const prerender = false;

// Also gated by src/middleware/index.ts's MOD_ROUTE_PREFIXES ('/api/moderator'),
// but that's defense-in-depth — keep this inline check too (see prefixes.ts).

import type { APIRoute } from 'astro';
import { getOrderIdByCode } from '../../../lib/moderatorOrders';
import { requireModerator } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, redirect, locals }) => {
	const forbidden = requireModerator(locals);
	if (forbidden) return forbidden;

	const form = await request.formData();
	const code = form.get('code')?.toString().trim().toUpperCase();

	const orderId = code ? await getOrderIdByCode(code) : null;
	if (!orderId) {
		return redirect('/moderator/retrieve?error=not_found', 303);
	}

	// Target route (/moderator/retrieve/[id]) is added by sibling PR #136
	// (worktree-moderator-flow-wi2-hub), not yet merged as of this PR — if
	// this PR merges/deploys first, a successful lookup 404s here until #136
	// lands too. Merge #136 before or together with this PR.
	return redirect(`/moderator/retrieve/${orderId}`, 303);
};
