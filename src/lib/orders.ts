import { db } from '../db/client';
import { items, orders, orderItems } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { CartEntry } from './cart';

// Excludes ambiguous characters (0/O, 1/I) — this code is read aloud by
// members to moderators and typed into the retrieve-order form.
const ORDER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ORDER_CODE_LENGTH = 6;
const MAX_ORDER_CODE_ATTEMPTS = 5;

export function generateOrderCode(): string {
  let code = '';
  for (let i = 0; i < ORDER_CODE_LENGTH; i++) {
    code += ORDER_CODE_ALPHABET[Math.floor(Math.random() * ORDER_CODE_ALPHABET.length)];
  }
  return code;
}

export type CreateOrderInput = {
  userId: string;
  note: string | null;
  cartEntries: CartEntry[];
};

export type CreateOrderResult =
  | { ok: true; orderId: number; orderCode: string }
  | { ok: false; error: 'empty_cart' };

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const itemIds = input.cartEntries.map((e) => e.itemId);
  const validItems = itemIds.length
    ? await db
        .select({ id: items.id })
        .from(items)
        .where(and(inArray(items.id, itemIds), eq(items.archived, false)))
    : [];
  const validItemIds = new Set(validItems.map((i) => i.id));

  // Drop entries pointing at items that no longer exist or were archived —
  // stock shortfall itself is resolved later by the moderator at the confirm
  // step (see orderItems.retrievedQuantity), not here.
  const entriesToOrder = input.cartEntries.filter((e) => validItemIds.has(e.itemId));
  if (entriesToOrder.length === 0) {
    return { ok: false, error: 'empty_cart' };
  }

  for (let attempt = 0; attempt < MAX_ORDER_CODE_ATTEMPTS; attempt++) {
    const orderCode = generateOrderCode();
    try {
      const result = db.transaction((tx) => {
        const order = tx
          .insert(orders)
          .values({ orderCode, userId: input.userId, note: input.note })
          .returning({ id: orders.id, orderCode: orders.orderCode })
          .get();

        tx.insert(orderItems)
          .values(
            entriesToOrder.map((e) => ({
              orderId: order.id,
              itemId: e.itemId,
              requestedQuantity: e.quantity,
            })),
          )
          .run();

        return order;
      });
      return { ok: true, orderId: result.id, orderCode: result.orderCode };
    } catch (err) {
      // Unique-constraint collision on order_code — retry with a fresh code.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('UNIQUE constraint failed') || attempt === MAX_ORDER_CODE_ATTEMPTS - 1) {
        throw err;
      }
    }
  }

  // Unreachable: the loop above either returns or rethrows on its last attempt.
  throw new Error('Failed to generate a unique order code');
}
