import { describe, it, expect } from 'vitest';
import { parseProductForm } from '../productForm';

function formWith(entries: [string, string][]): FormData {
	const form = new FormData();
	for (const [key, value] of entries) form.append(key, value);
	return form;
}

describe('parseProductForm', () => {
	it('rejects a missing title', () => {
		const result = parseProductForm(formWith([]));
		expect(result).toEqual({ ok: false, error: 'Product title is required' });
	});

	it('pairs linkLabel[]/linkUrl[] by index and drops fully-empty rows', () => {
		const result = parseProductForm(
			formWith([
				['title', 'Harness'],
				['linkLabel[]', 'Manual'],
				['linkUrl[]', 'https://example.com/manual'],
				['linkLabel[]', ''],
				['linkUrl[]', ''],
			]),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.input.links).toEqual([{ label: 'Manual', url: 'https://example.com/manual' }]);
	});

	it('trims and drops empty attribute-key rows', () => {
		const result = parseProductForm(
			formWith([
				['title', 'Harness'],
				['attributeKey[]', '  Size '],
				['attributeKey[]', ''],
			]),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.input.attributeKeys).toEqual(['Size']);
	});

	it('defaults status to hidden for anything other than "published"', () => {
		const result = parseProductForm(formWith([['title', 'Harness']]));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.input.status).toBe('hidden');
	});

	it('parses a positive-integer categoryId and rejects non-positive input', () => {
		const valid = parseProductForm(
			formWith([
				['title', 'Harness'],
				['categoryId', '3'],
			]),
		);
		expect(valid.ok && valid.input.categoryId).toBe(3);

		const invalid = parseProductForm(
			formWith([
				['title', 'Harness'],
				['categoryId', '0'],
			]),
		);
		expect(invalid.ok && invalid.input.categoryId).toBe(null);
	});
});
