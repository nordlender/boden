// Shared form-parsing for /api/products/create and /api/products/[id]/update
// — both routes accept the exact same field shape, submitted by
// ProductForm.astro. Kept separate from products.ts's DB layer so it can be
// unit tested without a database.
import type { ProductInput } from './products';
import { isPositiveInteger } from './wizard-http';

export type ParsedProductForm = { ok: true; input: ProductInput } | { ok: false; error: string };

function parseOptionalId(form: FormData, field: string): number | null {
	const raw = form.get(field);
	if (typeof raw !== 'string' || raw.trim() === '') return null;
	const parsed = Number(raw);
	return isPositiveInteger(parsed) ? parsed : null;
}

export function parseProductForm(form: FormData): ParsedProductForm {
	const title = form.get('title')?.toString().trim();
	if (!title) {
		return { ok: false, error: 'Product title is required' };
	}

	const statusRaw = form.get('status')?.toString();
	const status = statusRaw === 'published' ? 'published' : 'hidden';

	const links = form
		.getAll('linkLabel[]')
		.map((label, index) => ({
			label: label.toString().trim(),
			url: form.getAll('linkUrl[]')[index]?.toString().trim() ?? '',
		}))
		.filter((link) => link.label || link.url);

	const attributeKeys = form
		.getAll('attributeKey[]')
		.map((name) => name.toString().trim())
		.filter(Boolean);

	return {
		ok: true,
		input: {
			title,
			description: form.get('description')?.toString().trim() || null,
			categoryId: parseOptionalId(form, 'categoryId'),
			subcategoryId: parseOptionalId(form, 'subcategoryId'),
			status,
			thumbnailImageUrl: form.get('thumbnailImageUrl')?.toString().trim() || null,
			links,
			attributeKeys,
		},
	};
}
