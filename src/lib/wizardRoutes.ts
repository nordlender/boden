// Request wiring for the /api/wizard/[kind]/* routes (archive, set-image,
// set-product) — kept out of wizardVariants.ts so that file stays a pure
// data layer with no URL segments, form field names or page paths.
import type { APIContext } from 'astro';
import type { VariantKind } from './wizardVariants';
import { requireAdmin, isPositiveInteger } from './http';

interface VariantRoute {
	kind: VariantKind;
	// The selection form's checkbox field — ItemRow/SetRow name theirs
	// differently, and attributes/bulk.ts reads `itemIds` too.
	idsField: 'itemIds' | 'setIds';
	// Where to land when the form carries no usable `redirectTo`.
	fallback: string;
}

const routes: Record<'items' | 'sets', VariantRoute> = {
	items: { kind: 'item', idsField: 'itemIds', fallback: '/admin/items' },
	sets: { kind: 'set', idsField: 'setIds', fallback: '/admin/sets' },
};

// Explicit comparison rather than `segment in routes` — a segment like
// "constructor" would otherwise resolve through Object.prototype.
export function variantRoute(segment: string | undefined): VariantRoute | null {
	return segment === 'items' || segment === 'sets' ? routes[segment] : null;
}

/**
 * The shared preamble of every /api/wizard/[kind]/* route: admin gate, `kind`
 * segment lookup (404 for anything else), form body, and the selected ids.
 * Returns a Response to hand straight back, or what the route needs to go
 * on. `ids` may be empty — each route words its own 400, since it also
 * checks its own other fields.
 *
 * isPositiveInteger, not bare Number.isInteger, on the ids: Number(null) and
 * Number('') from a missing/blank entry coerce to 0, which isn't a real id —
 * see isPositiveInteger's doc comment.
 */
export async function readVariantRequest({
	locals,
	params,
	request,
}: Pick<APIContext, 'locals' | 'params' | 'request'>): Promise<Response | { route: VariantRoute; form: FormData; ids: number[] }> {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	const route = variantRoute(params.kind);
	if (!route) return new Response('Not found', { status: 404 });

	const form = await request.formData();
	const ids = form.getAll(route.idsField).map(Number).filter(isPositiveInteger);
	return { route, form, ids };
}
