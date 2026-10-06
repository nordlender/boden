// Shared form-parsing for /api/products/create and /api/products/[id]/update
// — both routes accept the exact same field shape, submitted by
// ProductForm.astro. Kept separate from products.ts's DB layer so it can be
// unit tested without a database.
import type { ProductInput } from './products';
import { isPositiveInteger } from './http';

export type ParsedProductForm = { ok: true; input: ProductInput } | { ok: false; error: string };

// FormData entries are `string | File`, not always `string` — a bare
// `.toString()` on a File falls back to Object's default stringification
// rather than throwing, so this only ever returns a real string, treating
// anything else (a File, or a missing field) as absent.
function formString(form: FormData, field: string): string {
	const value = form.get(field);
	return typeof value === 'string' ? value : '';
}

function formStrings(form: FormData, field: string): string[] {
	return form.getAll(field).filter((value): value is string => typeof value === 'string');
}

function parseOptionalId(form: FormData, field: string): number | null {
	const raw = formString(form, field).trim();
	if (!raw) return null;
	const parsed = Number(raw);
	return isPositiveInteger(parsed) ? parsed : null;
}

export function parseProductForm(form: FormData): ParsedProductForm {
	const title = formString(form, 'title').trim();
	if (!title) {
		return { ok: false, error: 'Product title is required' };
	}

	const statusRaw = formString(form, 'status');
	const status = statusRaw === 'published' ? 'published' : 'hidden';

	const linkLabels = formStrings(form, 'linkLabel[]');
	const linkUrls = formStrings(form, 'linkUrl[]');
	const links = linkLabels
		.map((label, index) => ({ label: label.trim(), url: (linkUrls[index] ?? '').trim() }))
		.filter((link) => link.label || link.url);

	const attributeKeys = formStrings(form, 'attributeKey[]')
		.map((name) => name.trim())
		.filter(Boolean);

	// A radio today (one variant key), but read with getAll so a future
	// multi-select needs no parser change.
	const variantAttributeKeys = formStrings(form, 'variantAttributeKey')
		.map((name) => name.trim())
		.filter(Boolean);

	return {
		ok: true,
		input: {
			title,
			description: formString(form, 'description').trim() || null,
			categoryId: parseOptionalId(form, 'categoryId'),
			subcategoryId: parseOptionalId(form, 'subcategoryId'),
			status,
			thumbnailImageUrl: formString(form, 'thumbnailImageUrl').trim() || null,
			links,
			attributeKeys,
			variantAttributeKeys,
		},
	};
}
