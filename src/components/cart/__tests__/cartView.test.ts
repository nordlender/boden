// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CART_VIEW_CHANGE, getCartView } from '../cartView';

const ID = '0b6f8c1e-2f5a-4c3d-9e8b-7a6f5e4d3c2b';
const OTHER_ID = '1c7a9d2f-3a6b-4d4e-8f9c-8b7a6f5e4d3c';

function row(itemId: number, quantity: number) {
	return `<div data-cart-row data-line-key="item:${itemId}"><input type="number" name="quantity_${itemId}" value="${quantity}" data-cart-quantity></div>`;
}

// Mirrors what CartView.astro + CartNextButton.astro render.
function mount({ entries = [{ itemId: 1, quantity: 2 }], mode = 'form' as 'form' | 'link', editable = true, cartId = ID as string | null } = {}) {
	const rows = entries.map((e) => row(e.itemId, e.quantity)).join('');
	const next =
		mode === 'link'
			? `<a href="/reservation" data-cart-next="v">Continue</a><button type="button" data-cart-update="v" hidden>Update cart</button>`
			: `<form id="f" action="/next" method="post">
				<input type="hidden" name="cartId" data-cart-snapshot-id="v">
				<input type="hidden" name="cartEntries" data-cart-snapshot-entries="v">
				<button type="submit" data-cart-next="v">Next</button>
				<button type="button" data-cart-update="v" hidden>Update cart</button>
			</form>`;
	document.body.innerHTML = `
		<div data-cart-view="v" data-size="compact" ${editable ? 'data-editable' : ''} data-cart-id="${cartId ?? ''}" data-cart-entries='${JSON.stringify(entries)}'>
			<div data-cart-notice hidden><p data-cart-notice-text></p></div>
			<div data-cart-rows>${rows}</div>
			<div data-cart-empty ${entries.length ? 'hidden' : ''}>Empty</div>
		</div>
		<button type="button" data-cart-clear="v">Empty cart</button>
		${next}`;
	const root = document.querySelector<HTMLElement>('[data-cart-view]')!;
	const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector(selector) as unknown as T;
	return { root, view: getCartView(root), $ };
}

function cartResponse(cartId: string | null, entries: { itemId: number; quantity: number }[]) {
	return new Response(JSON.stringify({ cartId, entries, html: entries.map((e) => row(e.itemId, e.quantity)).join('') }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('cartView', () => {
	it('fills the hidden snapshot fields from the rendered cart', () => {
		const { $ } = mount();
		expect($<HTMLInputElement>('[name="cartId"]').value).toBe(ID);
		expect(JSON.parse($<HTMLInputElement>('[name="cartEntries"]').value)).toEqual([{ itemId: 1, quantity: 2 }]);
	});

	it('swaps the next button for "Update cart" while a quantity has unsaved changes', () => {
		const { $ } = mount();
		const input = $<HTMLInputElement>('[data-cart-quantity]');
		input.value = '5';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect($('[data-cart-next]').hidden).toBe(true);
		expect($('[data-cart-update]').hidden).toBe(false);

		input.value = '2';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect($('[data-cart-next]').hidden).toBe(false);
		expect($('[data-cart-update]').hidden).toBe(true);
	});

	it('"Update cart" saves every quantity, then shows the saved cart and announces it', async () => {
		const { root, $ } = mount();
		const changes: unknown[] = [];
		root.addEventListener(CART_VIEW_CHANGE, (event) => changes.push((event as CustomEvent).detail));
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(cartResponse(ID, [{ itemId: 1, quantity: 5 }]));

		const input = $<HTMLInputElement>('[data-cart-quantity]');
		input.value = '5';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		$<HTMLButtonElement>('[data-cart-update]').click();
		await flush();
		await flush();

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/cart/update-all');
		expect((init.body as FormData).get('quantity_1')).toBe('5');
		expect($<HTMLInputElement>('[data-cart-quantity]').defaultValue).toBe('5');
		expect($('[data-cart-next]').hidden).toBe(false);
		expect(JSON.parse($<HTMLInputElement>('[name="cartEntries"]').value)).toEqual([{ itemId: 1, quantity: 5 }]);
		expect(changes).toEqual([{ cartId: ID, entries: [{ itemId: 1, quantity: 5 }] }]);
	});

	it('shows a notice when the update is rejected, with the cart as it is', async () => {
		const { $ } = mount();
		fetchMock.mockResolvedValueOnce(new Response('Item not available', { status: 404 })).mockResolvedValueOnce(cartResponse(ID, [{ itemId: 1, quantity: 2 }]));
		const input = $<HTMLInputElement>('[data-cart-quantity]');
		input.value = '3';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		$<HTMLButtonElement>('[data-cart-update]').click();
		await flush();
		await flush();
		expect($('[data-cart-notice]').hidden).toBe(false);
		expect($<HTMLInputElement>('[data-cart-quantity]').value).toBe('2');
	});

	it('submits the form when the cart is unchanged — only once, however often it is clicked', async () => {
		const { $ } = mount();
		const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
		fetchMock.mockImplementation(async () => cartResponse(ID, [{ itemId: 1, quantity: 2 }]));
		const form = $<HTMLFormElement>('#f');
		form.requestSubmit();
		form.requestSubmit();
		await flush();
		await flush();
		form.requestSubmit();
		await flush();
		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('stays on the page and shows the new cart when it changed elsewhere', async () => {
		const { $ } = mount();
		const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
		fetchMock.mockResolvedValueOnce(cartResponse(ID, [{ itemId: 1, quantity: 2 }, { itemId: 7, quantity: 1 }]));
		$<HTMLFormElement>('#f').requestSubmit();
		await flush();
		await flush();
		expect(submit).not.toHaveBeenCalled();
		expect($('[data-cart-notice]').hidden).toBe(false);
		expect(document.querySelectorAll('[data-cart-row]')).toHaveLength(2);
		expect(JSON.parse($<HTMLInputElement>('[name="cartEntries"]').value)).toHaveLength(2);
	});

	it('treats a new cart id (the cart was ordered meanwhile) as a change', async () => {
		const { $ } = mount();
		const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
		fetchMock.mockResolvedValueOnce(cartResponse(OTHER_ID, [{ itemId: 1, quantity: 2 }]));
		$<HTMLFormElement>('#f').requestSubmit();
		await flush();
		await flush();
		expect(submit).not.toHaveBeenCalled();
		expect($<HTMLInputElement>('[name="cartId"]').value).toBe(OTHER_ID);
	});

	it('moves on anyway when the check itself fails (the server re-checks)', async () => {
		const { $ } = mount();
		const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError('offline'));
		$<HTMLFormElement>('#f').requestSubmit();
		await flush();
		await flush();
		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('follows a next link only after the check passes', async () => {
		const { $ } = mount({ mode: 'link' });
		const assign = vi.fn();
		vi.stubGlobal('location', { ...window.location, assign });
		fetchMock.mockResolvedValueOnce(cartResponse(ID, [{ itemId: 1, quantity: 2 }]));
		$<HTMLAnchorElement>('[data-cart-next]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
		await flush();
		await flush();
		expect(assign).toHaveBeenCalledWith(expect.stringContaining('/reservation'));
	});

	describe('read-only (the confirm step)', () => {
		it('never adopts a changed cart: keeps the reviewed lines and snapshot, says so, and never submits', async () => {
			const { $ } = mount({ editable: false });
			const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
			fetchMock.mockImplementation(async () => cartResponse(ID, [{ itemId: 1, quantity: 3 }]));

			$<HTMLFormElement>('#f').requestSubmit();
			await flush();
			await flush();
			$<HTMLFormElement>('#f').requestSubmit();
			await flush();
			await flush();

			expect(submit).not.toHaveBeenCalled();
			expect($('[data-cart-notice]').hidden).toBe(false);
			expect($('[data-cart-notice-text]').textContent).toMatch(/go back/i);
			expect(document.querySelectorAll('[data-cart-row]')).toHaveLength(1);
			expect(JSON.parse($<HTMLInputElement>('[name="cartEntries"]').value)).toEqual([{ itemId: 1, quantity: 2 }]);
		});

		it('submits when the cart is still the reviewed one', async () => {
			const { $ } = mount({ editable: false });
			const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
			fetchMock.mockResolvedValueOnce(cartResponse(ID, [{ itemId: 1, quantity: 2 }]));
			$<HTMLFormElement>('#f').requestSubmit();
			await flush();
			await flush();
			expect(submit).toHaveBeenCalledTimes(1);
		});

		it('flags (without re-rendering) a change made in the sidebar on the same page', async () => {
			const { $ } = mount({ editable: false });
			// Not Once: controllers mounted by earlier tests still listen on document.
			fetchMock.mockImplementation(async () => cartResponse(ID, [{ itemId: 1, quantity: 3 }]));
			document.dispatchEvent(new CustomEvent('cart:changed', { detail: { source: document.body } }));
			await flush();
			await flush();
			expect($('[data-cart-notice]').hidden).toBe(false);
			expect($<HTMLInputElement>('[data-cart-quantity]').value).toBe('2');
			expect(JSON.parse($<HTMLInputElement>('[name="cartEntries"]').value)).toEqual([{ itemId: 1, quantity: 2 }]);
		});
	});

	it('an editable view shows the new cart after a change elsewhere on the page', async () => {
		const { $ } = mount();
		// Not Once: controllers mounted by earlier tests still listen on document.
		fetchMock.mockImplementation(async () => cartResponse(ID, [{ itemId: 1, quantity: 3 }]));
		document.dispatchEvent(new CustomEvent('cart:changed', { detail: { source: document.body } }));
		await flush();
		await flush();
		expect($<HTMLInputElement>('[data-cart-quantity]').value).toBe('3');
	});

	it('accepts a cart without an id (wiped after an order) and shows it as empty', async () => {
		const { root, $ } = mount();
		fetchMock.mockResolvedValueOnce(cartResponse(null, []));
		await getCartView(root).reload();
		expect($<HTMLInputElement>('[name="cartId"]').value).toBe('');
		expect($('[data-cart-empty]').hidden).toBe(false);
		expect($('[data-cart-next]').hidden).toBe(true);
	});

	it('hides the next button and "Empty cart" for an empty cart', () => {
		const { $ } = mount({ entries: [] });
		expect($('[data-cart-next]').hidden).toBe(true);
		expect($('[data-cart-clear]').hidden).toBe(true);
		expect($('[data-cart-empty]').hidden).toBe(false);
	});
});
