// Client-side behaviour shared by every CartView.astro (see its header for
// what a cart page gets). One controller per [data-cart-view] element; the
// controls belonging to it elsewhere on the page (CartNextButton, an
// "Empty cart" button) are found by the view's name:
//   [data-cart-next="<name>"]               link or submit button
//   [data-cart-update="<name>"]             "Update cart"
//   [data-cart-clear="<name>"]              "Empty cart"
//   [data-cart-snapshot-id/-entries="<name>"] hidden snapshot fields
//
// The view dispatches CART_VIEW_CHANGE on its root with the new
// CartSnapshot whenever it re-renders its lines, so a page can react (the
// reservation form re-checks availability).
//
// An editable view that finds the cart changed shows the new cart (the
// member can review it right there). A read-only view (the confirm step)
// never adopts a changed cart: it keeps what the member reviewed, says the
// cart changed and doesn't move on — they go back to review it, and the
// next step's server check rejects the old snapshot anyway.
import { isCartId, sameSnapshot, toCartEntries, type CartSnapshot } from '../../lib/cartEntries';

export const CART_VIEW_CHANGE = 'cart-view:change';

// Broadcast on `document` after a view changed the cart, so other views on
// the page (the sidebar on /reservation, say) show the new cart too.
const CART_CHANGED = 'cart:changed';

const CHANGED_NOTICE = 'Your cart changed since it was shown here (for example in another tab). Check it, then continue.';
const STALE_NOTICE = 'Your cart changed since you reviewed it (for example in another tab). Go back and check it before continuing.';
const UPDATE_FAILED_NOTICE = "Your cart couldn't be updated, so it's shown as it is now. Please try again.";

export interface CartViewHandle {
	readonly root: HTMLElement;
	snapshot(): CartSnapshot;
	reload(): Promise<void>;
}

interface CartResponse extends CartSnapshot {
	html: string;
}

const views = new Map<HTMLElement, CartViewHandle>();

export function initCartViews(): void {
	document.querySelectorAll<HTMLElement>('[data-cart-view]').forEach((root) => getCartView(root));
}

// The view's controller, created on first use — safe to call from any page
// script regardless of which script runs first.
export function getCartView(root: HTMLElement): CartViewHandle {
	let view = views.get(root);
	if (!view) {
		view = createCartView(root);
		views.set(root, view);
	}
	return view;
}

function parseCartResponse(data: unknown): CartResponse | null {
	if (typeof data !== 'object' || data === null) return null;
	const { cartId, entries, html } = data as Record<string, unknown>;
	const validEntries = toCartEntries(entries);
	if ((cartId !== null && !isCartId(cartId)) || validEntries === null || typeof html !== 'string') return null;
	return { cartId, entries: validEntries, html };
}

function createCartView(root: HTMLElement): CartViewHandle {
	const name = root.dataset.cartView ?? '';
	const rows = root.querySelector<HTMLElement>('[data-cart-rows]');
	const empty = root.querySelector<HTMLElement>('[data-cart-empty]');
	const notice = root.querySelector<HTMLElement>('[data-cart-notice]');
	const noticeText = root.querySelector<HTMLElement>('[data-cart-notice-text]');
	const controls = <T extends HTMLElement>(attribute: string) => [...document.querySelectorAll<T>(`[${attribute}="${CSS.escape(name)}"]`)];
	const nextControls = controls('data-cart-next');
	const updateButtons = controls('data-cart-update');
	const clearButtons = controls('data-cart-clear');
	const idFields = controls<HTMLInputElement>('data-cart-snapshot-id');
	const entriesFields = controls<HTMLInputElement>('data-cart-snapshot-entries');
	const editable = root.dataset.editable !== undefined;

	let snapshot: CartSnapshot = {
		cartId: root.dataset.cartId || null,
		entries: toCartEntries(JSON.parse(root.dataset.cartEntries || '[]')) ?? [],
	};
	// A request (update, clear, freshness check) is in flight.
	let busy = false;
	// The next step has started (navigation or form submit) — ignore further
	// clicks so a double-click can't submit twice. Reset when the page comes
	// back from the back/forward cache.
	let leaving = false;

	const quantityInputs = () => [...(rows?.querySelectorAll<HTMLInputElement>('[data-cart-quantity]') ?? [])];
	const isDirty = () => quantityInputs().some((input) => input.value !== input.defaultValue);
	const isOpen = () => !root.closest('[inert]');

	function syncControls() {
		const dirty = isDirty();
		const isEmpty = snapshot.entries.length === 0;
		updateButtons.forEach((button) => (button.hidden = !dirty));
		nextControls.forEach((control) => (control.hidden = dirty || isEmpty));
		clearButtons.forEach((button) => (button.hidden = isEmpty));
	}

	function writeSnapshot() {
		idFields.forEach((field) => (field.value = snapshot.cartId ?? ''));
		entriesFields.forEach((field) => (field.value = JSON.stringify(snapshot.entries)));
	}

	function showNotice(text: string | null) {
		if (noticeText) noticeText.textContent = text ?? '';
		if (notice) notice.hidden = text === null;
	}

	function render(cart: CartResponse) {
		if (rows) rows.innerHTML = cart.html;
		snapshot = { cartId: cart.cartId, entries: cart.entries };
		writeSnapshot();
		if (empty) empty.hidden = cart.entries.length > 0;
		syncControls();
		root.dispatchEvent(new CustomEvent<CartSnapshot>(CART_VIEW_CHANGE, { detail: snapshot }));
	}

	async function fetchCart(): Promise<CartResponse | null> {
		const query = new URLSearchParams({ size: root.dataset.size ?? 'compact' });
		if (editable) query.set('editable', '1');
		if (root.dataset.availability !== undefined) query.set('availability', '1');
		if (root.dataset.newTab !== undefined) query.set('newTab', '1');
		try {
			const res = await fetch(`/api/cart?${query}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
			return res.ok ? parseCartResponse(await res.json()) : null;
		} catch {
			return null;
		}
	}

	async function reload() {
		const cart = await fetchCart();
		if (cart) render(cart);
	}

	// Runs a cart-changing request, then shows the cart as it now is.
	async function mutate(url: string, body?: FormData) {
		if (busy) return;
		busy = true;
		showNotice(null);
		let ok = false;
		try {
			ok = (await fetch(url, { method: 'POST', body })).ok;
		} catch {
			// Shown below, after the reload.
		}
		await reload();
		busy = false;
		if (!ok) showNotice(UPDATE_FAILED_NOTICE);
		document.dispatchEvent(new CustomEvent(CART_CHANGED, { detail: { source: root } }));
	}

	function update() {
		const body = new FormData();
		quantityInputs().forEach((input) => body.set(input.name, input.value));
		return mutate('/api/cart/update-all', body);
	}

	// Reacts to the cart having changed since it was shown: an editable view
	// shows the new cart, a read-only one only says so (see the header).
	function showChanged(current: CartResponse) {
		if (editable) {
			render(current);
			showNotice(CHANGED_NOTICE);
		} else {
			showNotice(STALE_NOTICE);
		}
	}

	// Checks the cart is still the one shown before moving on; if it changed,
	// stays (see showChanged). A failed check moves on anyway — the next step
	// re-checks the submitted snapshot server-side.
	async function proceed(go: () => void) {
		if (leaving || busy) return;
		busy = true;
		const current = await fetchCart();
		busy = false;
		if (current && !sameSnapshot(current, snapshot)) {
			showChanged(current);
			return;
		}
		leaving = true;
		go();
	}

	rows?.addEventListener('input', syncControls);
	rows?.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.matches('[data-cart-quantity]')) {
			event.preventDefault();
			if (isDirty()) update();
		}
	});
	updateButtons.forEach((button) => button.addEventListener('click', update));
	clearButtons.forEach((button) => button.addEventListener('click', () => mutate('/api/cart/clear')));

	const forms = new Set<HTMLFormElement>();
	nextControls.forEach((control) => {
		if (control instanceof HTMLAnchorElement) {
			control.addEventListener('click', (event) => {
				// Let modified clicks (new tab/window) through untouched.
				if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
				event.preventDefault();
				proceed(() => window.location.assign(control.href));
			});
		} else if (control instanceof HTMLButtonElement && control.form) {
			forms.add(control.form);
		}
	});
	forms.forEach((form) => {
		// `submit` only fires once the browser's own validation passed, so
		// form.submit() afterwards (which skips validation) is safe.
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			proceed(() => form.submit());
		});
	});

	document.addEventListener(CART_CHANGED, async (event) => {
		const { source } = (event as CustomEvent<{ source: HTMLElement }>).detail;
		// A closed sidebar reloads when opened; unsaved edits aren't discarded.
		if (source === root || !isOpen() || isDirty()) return;
		if (editable) {
			reload();
			return;
		}
		const current = await fetchCart();
		if (current && !sameSnapshot(current, snapshot)) showChanged(current);
	});

	window.addEventListener('pageshow', (event) => {
		if (event.persisted) leaving = false;
	});

	writeSnapshot();
	syncControls();

	return { root, snapshot: () => snapshot, reload };
}
