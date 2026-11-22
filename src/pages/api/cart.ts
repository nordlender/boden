// The cart for cartView.ts (CartView.astro's client script): its snapshot
// (id + shown lines as entries, see lib/cartEntries.ts's CartSnapshot) and
// the rows as an HTML partial to swap in. The sidebar loads its lines only
// from here: some pages that render it are prerendered (the shop grid, 404),
// so they have no per-request cart cookie at render time.
//
// The rows are rendered server-side via the Container API rather than
// built on the client from JSON, because CartLineRow (ui/ItemLine) is an
// Astro component and only renders server-side. The query mirrors the
// requesting CartView's props: size=compact|detailed, editable=1,
// availability=1, newTab=1.

import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadCart } from '../../lib/cart';
import { json } from '../../lib/http';
import CartLineRows from '../../components/cart/CartLineRows.astro';

export const GET: APIRoute = async ({ cookies, url }) => {
	const { cartId, entries, lines } = await loadCart(cookies);
	const flag = (name: string) => url.searchParams.get(name) === '1';
	const container = await AstroContainer.create();
	const html = await container.renderToString(CartLineRows, {
		props: {
			lines,
			size: url.searchParams.get('size') === 'detailed' ? 'detailed' : 'compact',
			editable: flag('editable'),
			availability: flag('availability'),
			newTab: flag('newTab'),
		},
	});
	return json({ cartId, entries, html });
};
