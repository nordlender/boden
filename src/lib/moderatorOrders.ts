import { and, asc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { orderItems, orders } from '../db/schema';
import { getReservationAvailability } from './reservation';

// Moderator-side order operations — kept separate from member-side
// src/lib/orders.ts (createOrder/createSplitOrders/deleteOrder/
// rescheduleOrder), which only ever acts on an order its caller owns.
// Everything here acts across all members' orders, gated by
// requireModerator() (src/lib/wizard-http.ts) at the API-route layer.

export interface OrderDetailItem {
	orderItemId: number;
	itemId: number;
	itemName: string;
	itemImageUrl: string | null;
	requestedQuantity: number;
	retrievedQuantity: number | null;
	// Pulled from rotation — item.archived, or its assigned product is no
	// longer published (or it has no product at all: no trustworthy product
	// context left to vouch for it).
	archived: boolean;
	// Peak concurrent demand from other requested/active orders exceeds
	// stock for this order's own [fromDate, toDate] — see
	// src/lib/reservation.ts's getReservationAvailability.
	doubleBooked: boolean;
}

export interface OrderDetail {
	id: number;
	orderCode: string;
	userId: string;
	userName: string | null;
	userEmail: string;
	status: 'requested' | 'active' | 'returned' | 'rejected';
	fromDate: string;
	toDate: string;
	note: string | null;
	contactName: string;
	contactEmail: string;
	contactMobile: string | null;
	hasUnpaidFees: boolean | null;
	userIsMember: boolean | null;
	acceptedAt: Date | null;
	activatedAt: Date | null;
	returnedAt: Date | null;
	rejectedAt: Date | null;
	rejectedReason: string | null;
	confirmedByUserId: string | null;
	returnedByUserId: string | null;
	items: OrderDetailItem[];
}

// getOrderDetail/getOrderDetailByCode below share this exact `with` shape —
// only the WHERE clause differs. Drizzle's relational query builder infers
// its result type from the inline `with` config, so RawOrderDetail is
// derived from one concrete call (queryOrderDetailById) rather than trying
// to factor the query itself out behind a generic `where` parameter, which
// loses that inference.
function queryOrderDetailById(orderId: number) {
	return db.query.orders.findFirst({
		where: (t, { eq: eqCol }) => eqCol(t.id, orderId),
		with: {
			user: true,
			orderItems: { with: { item: { with: { product: true } } } },
		},
	});
}

type RawOrderDetail = NonNullable<Awaited<ReturnType<typeof queryOrderDetailById>>>;

function toOrderDetail(order: RawOrderDetail): OrderDetail {
	const availabilities = getReservationAvailability(
		{ from: order.fromDate, to: order.toDate },
		order.orderItems.map((oi) => ({ itemId: oi.itemId, quantity: oi.requestedQuantity })),
		order.id,
	);
	const availableByItemId = new Map(availabilities.map((a) => [a.itemId, a.available]));

	return {
		id: order.id,
		orderCode: order.orderCode,
		userId: order.userId,
		userName: order.user.name,
		userEmail: order.user.email,
		status: order.status,
		fromDate: order.fromDate,
		toDate: order.toDate,
		note: order.note,
		contactName: order.contactName,
		contactEmail: order.contactEmail,
		contactMobile: order.contactMobile,
		hasUnpaidFees: order.hasUnpaidFees,
		userIsMember: order.userIsMember,
		acceptedAt: order.acceptedAt,
		activatedAt: order.activatedAt,
		returnedAt: order.returnedAt,
		rejectedAt: order.rejectedAt,
		rejectedReason: order.rejectedReason,
		confirmedByUserId: order.confirmedByUserId,
		returnedByUserId: order.returnedByUserId,
		items: order.orderItems.map((oi) => ({
			orderItemId: oi.id,
			itemId: oi.itemId,
			itemName: oi.item.name,
			itemImageUrl: oi.item.imageUrl,
			requestedQuantity: oi.requestedQuantity,
			retrievedQuantity: oi.retrievedQuantity,
			archived: oi.item.archived || oi.item.product?.status !== 'published',
			doubleBooked: !(availableByItemId.get(oi.itemId) ?? true),
		})),
	};
}

export async function getOrderDetail(orderId: number): Promise<OrderDetail | null> {
	const order = await queryOrderDetailById(orderId);
	return order ? toOrderDetail(order) : null;
}

export async function getOrderDetailByCode(orderCode: string): Promise<OrderDetail | null> {
	const order = await db.query.orders.findFirst({
		where: (t, { eq: eqCol }) => eqCol(t.orderCode, orderCode),
		with: {
			user: true,
			orderItems: { with: { item: { with: { product: true } } } },
		},
	});
	return order ? toOrderDetail(order) : null;
}

// Id-only lookup for the retrieve form (src/pages/api/moderator/retrieve.ts),
// which only needs the id to redirect to the hub page — that page immediately
// re-runs getOrderDetail(id) itself, so doing the full joins + availability
// computation here too would run them twice per lookup for no reason.
export async function getOrderIdByCode(orderCode: string): Promise<number | null> {
	const order = await db.query.orders.findFirst({
		where: (t, { eq: eqCol }) => eqCol(t.orderCode, orderCode),
		columns: { id: true },
	});
	return order?.id ?? null;
}

export type AcceptOrderResult = { ok: true } | { ok: false; error: 'not_pending_review' };

// Gate shared by acceptOrder/rejectOrder: an order is pending review only
// once (status='requested', neither accepted nor rejected yet). Re-POSTing
// against an order that's since moved on (accepted by another moderator tab,
// rejected, or further along) always fails this WHERE clause, so
// `result.changes === 0` alone (no separate pre-read) tells us whether the
// action actually applied — same "let the WHERE clause be the check"
// pattern as src/lib/orders.ts's deleteOrder.
const PENDING_REVIEW_WHERE = (orderId: number) =>
	and(eq(orders.id, orderId), eq(orders.status, 'requested'), isNull(orders.acceptedAt), isNull(orders.rejectedAt));

export async function acceptOrder(orderId: number): Promise<AcceptOrderResult> {
	const result = db.update(orders).set({ acceptedAt: new Date() }).where(PENDING_REVIEW_WHERE(orderId)).run();
	return result.changes > 0 ? { ok: true } : { ok: false, error: 'not_pending_review' };
}

export type RejectOrderResult = { ok: true } | { ok: false; error: 'not_pending_review' } | { ok: false; error: 'blank_reason' };

export async function rejectOrder(orderId: number, reason: string): Promise<RejectOrderResult> {
	const trimmedReason = reason.trim();
	if (!trimmedReason) {
		return { ok: false, error: 'blank_reason' };
	}
	const result = db
		.update(orders)
		.set({ status: 'rejected', rejectedAt: new Date(), rejectedReason: trimmedReason })
		.where(PENDING_REVIEW_WHERE(orderId))
		.run();
	return result.changes > 0 ? { ok: true } : { ok: false, error: 'not_pending_review' };
}

// Thrown inside confirmRetrieval's transaction when the order isn't (still)
// eligible — caught outside and turned into a result rather than a 500.
class NotAcceptableError extends Error {
	constructor() {
		super('not_acceptable');
	}
}

// Thrown when a submitted quantity is out of bounds for its line — should
// only ever happen on a stale/tampered POST, since the confirm count page's
// own mismatch loop (src/pages/moderator/confirm/[id]/count.astro) already
// enforces an exact match against each line's target before submitting here.
class QuantityExceedsRequestedError extends Error {
	constructor() {
		super('quantity_exceeds_requested');
	}
}

export type ConfirmRetrievalResult = { ok: true } | { ok: false; error: 'not_acceptable' } | { ok: false; error: 'quantity_exceeds_requested' };

// Called only once the confirm count page's mismatch loop has already
// confirmed every line's blind count equals its target (requestedQuantity,
// or the moderator's explicit reduced target for a line flagged
// unavailable) — this is the final write, not where matching is decided.
// The per-line bounds check below is defense-in-depth against a
// stale/tampered POST, not the normal path.
export async function confirmRetrieval(
	orderId: number,
	moderatorUserId: string,
	retrieved: { orderItemId: number; quantity: number }[],
): Promise<ConfirmRetrievalResult> {
	try {
		db.transaction((tx) => {
			const order = tx
				.select({ status: orders.status, acceptedAt: orders.acceptedAt, rejectedAt: orders.rejectedAt })
				.from(orders)
				.where(eq(orders.id, orderId))
				.get();
			if (!order || order.status !== 'requested' || order.acceptedAt === null || order.rejectedAt !== null) {
				throw new NotAcceptableError();
			}

			const lines = tx
				.select({ id: orderItems.id, requestedQuantity: orderItems.requestedQuantity })
				.from(orderItems)
				.where(eq(orderItems.orderId, orderId))
				.all();
			const requestedById = new Map(lines.map((line) => [line.id, line.requestedQuantity]));

			for (const line of retrieved) {
				const requestedQuantity = requestedById.get(line.orderItemId);
				if (requestedQuantity === undefined || line.quantity < 0 || line.quantity > requestedQuantity) {
					throw new QuantityExceedsRequestedError();
				}
			}

			for (const line of retrieved) {
				tx.update(orderItems).set({ retrievedQuantity: line.quantity }).where(eq(orderItems.id, line.orderItemId)).run();
			}
			tx.update(orders)
				.set({ status: 'active', activatedAt: new Date(), confirmedByUserId: moderatorUserId })
				.where(eq(orders.id, orderId))
				.run();
		});
	} catch (err) {
		if (err instanceof NotAcceptableError) return { ok: false, error: 'not_acceptable' };
		if (err instanceof QuantityExceedsRequestedError) return { ok: false, error: 'quantity_exceeds_requested' };
		throw err;
	}
	return { ok: true };
}

export type MarkReturnedResult = { ok: true } | { ok: false; error: 'not_active' };

export async function markReturned(orderId: number, moderatorUserId: string): Promise<MarkReturnedResult> {
	const result = db
		.update(orders)
		.set({ status: 'returned', returnedAt: new Date(), returnedByUserId: moderatorUserId })
		.where(and(eq(orders.id, orderId), eq(orders.status, 'active')))
		.run();
	return result.changes > 0 ? { ok: true } : { ok: false, error: 'not_active' };
}

export interface FollowingRentalWarning {
	itemId: number;
	itemName: string;
	followingOrderId: number;
	followingOrderCode: string;
	followingFromDate: string;
}

// If this order isn't returned by its stated toDate, does that break
// another already-placed order? For each item in this order, look at other
// requested/active orders (excluding this one) containing the same item
// with fromDate >= this order's toDate (scheduled to start on or after this
// order's own return day), nearest one first. For each candidate, check its
// own availability via getReservationAvailability — deliberately NOT
// excluding this order from that sweep (excludeOrderId is the candidate's
// own id, not this order's), since the whole point is that this order is
// still requested/active in the DB and therefore still counted as
// consuming stock through its own toDate. If that comes back unavailable
// for the shared item, this order is a contributing cause.
export async function getFollowingRentalWorries(orderId: number): Promise<FollowingRentalWarning[]> {
	const order = await db.query.orders.findFirst({
		where: (t, { eq: eqCol }) => eqCol(t.id, orderId),
		with: { orderItems: { with: { item: true } } },
	});
	if (!order) return [];

	const warnings: FollowingRentalWarning[] = [];
	for (const oi of order.orderItems) {
		const candidates = await db
			.select({
				orderId: orders.id,
				orderCode: orders.orderCode,
				fromDate: orders.fromDate,
				toDate: orders.toDate,
				quantity: orderItems.requestedQuantity,
			})
			.from(orderItems)
			.innerJoin(orders, eq(orderItems.orderId, orders.id))
			.where(
				and(
					eq(orderItems.itemId, oi.itemId),
					inArray(orders.status, ['requested', 'active']),
					gte(orders.fromDate, order.toDate),
					ne(orders.id, order.id),
				),
			)
			.orderBy(asc(orders.fromDate))
			.all();

		for (const candidate of candidates) {
			const [availability] = getReservationAvailability(
				{ from: candidate.fromDate, to: candidate.toDate },
				[{ itemId: oi.itemId, quantity: candidate.quantity }],
				candidate.orderId,
			);
			if (availability && !availability.available) {
				warnings.push({
					itemId: oi.itemId,
					itemName: oi.item.name,
					followingOrderId: candidate.orderId,
					followingOrderCode: candidate.orderCode,
					followingFromDate: candidate.fromDate,
				});
				break; // nearest problematic candidate for this item is enough
			}
		}
	}
	return warnings;
}
