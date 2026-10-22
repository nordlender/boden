#!/usr/bin/env node
// Dev-only: seeds example users, orders, hub messages, pick-up days and
// product links on top of the catalog from seed-example-catalog.mjs (which
// must have run first — orders reference its items by slug).
//
// Not wired into astro dev/build/preview. Run by `npm run dev-setup` after
// the catalog seed, or manually after `node scripts/seed-example-catalog.mjs`.
//
// Idempotent: users upsert on id, orders on order_code, pick-up days / rules /
// messages / links are only inserted when missing. Re-running never
// duplicates rows, but also doesn't overwrite what has been edited since.
//
// Usage: node scripts/seed-example-orders.mjs

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Must match drizzle.config.ts's dbCredentials.url.
const dbPath = path.join(rootDir, 'data', 'rental.db');

if (!existsSync(dbPath)) {
  console.error(`No db found at ${dbPath}. Run \`npx drizzle-kit migrate\` first.`);
  process.exit(1);
}

// Fake users — their ids are not real bloc ids, so nobody can sign in as
// them; they only exist so orders (and moderator accountability) have an
// owner. Log in through bloc as yourself to act as a moderator/admin.
const users = [
  { id: 'example-member-1', email: 'astrid.example@example.com', name: 'Astrid Example' },
  { id: 'example-member-2', email: 'magnus.example@example.com', name: 'Magnus Example' },
  { id: 'example-member-3', email: 'sigrid.example@example.com', name: 'Sigrid Example' },
  { id: 'example-moderator', email: 'ola.moderator@example.com', name: 'Ola Moderator' },
];

// Orders. `code` is fixed so the seed is idempotent (NNAAX: last letter M =
// created by a member). `status` drives which timestamps/accountability
// columns get filled, mimicking what the moderator flow would have written.
//
// The two Dragon Cam #00 orders overlap on 12–13 Nov with one unit each —
// the item has exactly two active units, so that day is fully booked and
// exercises the availability calendar. The rest cover every status near the
// end of November.
const orders = [
  {
    code: '23ABM',
    userId: 'example-member-1',
    status: 'scheduled',
    fromDate: '2026-11-12',
    toDate: '2026-11-13',
    note: 'Trad weekend at Hell — first order on Dragon Cam #00.',
    items: [{ slug: 'dmm-dragon-cam-00', quantity: 1 }],
  },
  {
    code: '47CDM',
    userId: 'example-member-2',
    status: 'requested',
    fromDate: '2026-11-11',
    toDate: '2026-11-14',
    note: 'Second order on Dragon Cam #00, wraps around the first.',
    items: [{ slug: 'dmm-dragon-cam-00', quantity: 1 }],
  },
  {
    code: '52EFM',
    userId: 'example-member-3',
    status: 'requested',
    fromDate: '2026-11-24',
    toDate: '2026-11-26',
    note: null,
    items: [
      { slug: 'climbing-helmet', quantity: 2 },
      { slug: 'quickdraw-set-6', quantity: 1 },
    ],
  },
  {
    code: '68GHM',
    userId: 'example-member-1',
    status: 'scheduled',
    fromDate: '2026-11-25',
    toDate: '2026-11-27',
    note: 'Pick up Wednesday evening if possible.',
    items: [
      { slug: 'ice-axe', quantity: 2 },
      { slug: 'crampons', quantity: 2 },
    ],
  },
  {
    code: '39JKM',
    userId: 'example-member-2',
    status: 'active',
    fromDate: '2026-11-23',
    toDate: '2026-11-29',
    note: 'Week-long trip, will return on the Sunday.',
    items: [
      { slug: 'dynamic-rope-60m', quantity: 1 },
      { slug: 'climbing-harness-red', quantity: 1 },
      { slug: 'climbing-helmet', quantity: 1 },
    ],
  },
  {
    code: '74LMM',
    userId: 'example-member-3',
    status: 'returned',
    fromDate: '2026-11-20',
    toDate: '2026-11-22',
    note: null,
    items: [{ slug: 'climbing-harness-blue', quantity: 2 }],
  },
  {
    code: '85NPM',
    userId: 'example-member-1',
    status: 'rejected',
    fromDate: '2026-11-27',
    toDate: '2026-11-30',
    note: 'Need a full rack.',
    rejectedReason: 'Dragon Cam #3 is retired and not available.',
    items: [{ slug: 'dmm-dragon-cam-3', quantity: 1 }],
  },
];

// Pick-up days. Mondays 18:00–20:00 as a recurring rule, plus single days a
// moderator registered ad hoc on the days the example orders start or end,
// so scheduled orders have a pick-up day to match against.
const MODERATOR_ID = 'example-moderator';
const recurringRule = { weekday: 1, startTime: '18:00', endTime: '20:00', startDate: '2026-10-26', endDate: '2026-12-14' };
const singlePickupDays = [
  { date: '2026-11-11', startTime: '17:00', endTime: '19:00', where: 'At Vulkan' },
  { date: '2026-11-12', startTime: '12:00', endTime: '14:00', where: 'In the reception at SiO Athletica Blindern' },
  { date: '2026-11-25', startTime: '18:00', endTime: '20:00', where: 'At Vulkan' },
];

// Hub board messages (unit notes are seeded with the catalog's units).
const messages = [
  { content: 'Pick-ups are in the reception on Mondays. Please bring your order code.', pinned: true, daysAgo: 14 },
  { content: 'Dragon Cam #3 failed inspection and is retired. Do not hand it out.', pinned: false, daysAgo: 6 },
  { content: 'Rope 60m: one unit is only 58 m after a cut — mention it when handing out.', pinned: false, daysAgo: 2 },
];

// Product links (manufacturer page, manuals …) by product slug.
const productLinks = [
  { productSlug: 'dmm-dragon-cam', label: 'DMM Dragon Cam', url: 'https://dmmwales.com/products/dragon-cam' },
  { productSlug: 'dmm-dragon-cam', label: 'Care and inspection', url: 'https://dmmwales.com/pages/product-care' },
  { productSlug: 'dynamic-rope-60m', label: 'Edelrid Boa', url: 'https://edelrid.com/' },
];

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const upsertUser = db.prepare(
  `INSERT INTO users (id, email, name) VALUES (@id, @email, @name)
   ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name`,
);

const getItemBySlug = db.prepare('SELECT id FROM items WHERE slug = ?');
const getOrderByCode = db.prepare('SELECT id FROM orders WHERE order_code = ?');
const getUser = db.prepare('SELECT name, email FROM users WHERE id = ?');
const insertOrder = db.prepare(
  `INSERT INTO orders (
     order_code, user_id, status, from_date, to_date, note,
     contact_name, contact_email, contact_mobile, has_unpaid_fees, user_is_member,
     confirmed_by_user_id, returned_by_user_id, created_at,
     accepted_at, activated_at, returned_at, rejected_at, rejected_reason, disclaimer_accepted_at
   ) VALUES (
     @code, @userId, @status, @fromDate, @toDate, @note,
     @contactName, @contactEmail, @contactMobile, 0, 1,
     @confirmedBy, @returnedBy, @createdAt,
     @acceptedAt, @activatedAt, @returnedAt, @rejectedAt, @rejectedReason, @createdAt
   )`,
);
const insertOrderItem = db.prepare(
  `INSERT INTO order_items (order_id, item_id, requested_quantity, retrieved_quantity) VALUES (?, ?, ?, ?)`,
);

const getRule = db.prepare(
  `SELECT id FROM pickup_recurring_rules
   WHERE weekday = @weekday AND start_time = @startTime AND end_time = @endTime
     AND start_date = @startDate AND end_date = @endDate`,
);
const insertRule = db.prepare(
  `INSERT INTO pickup_recurring_rules (created_by_user_id, weekday, start_time, end_time, start_date, end_date)
   VALUES (@userId, @weekday, @startTime, @endTime, @startDate, @endDate)`,
);
const insertRecurringDay = db.prepare(
  `INSERT INTO pickup_days (date, start_time, end_time, user_id, kind, recurring_rule_id)
   VALUES (@date, @startTime, @endTime, @userId, 'recurring', @ruleId)`,
);
// The unique index only covers kind = 'single', so OR IGNORE is exactly "skip
// if this moderator already offered this exact window".
const insertSingleDay = db.prepare(
  `INSERT OR IGNORE INTO pickup_days (date, start_time, end_time, "where", user_id, kind)
   VALUES (@date, @startTime, @endTime, @where, @userId, 'single')`,
);

const getMessage = db.prepare('SELECT id FROM messages WHERE content = ? AND unit_id IS NULL');
const insertMessage = db.prepare(
  `INSERT INTO messages (content, author_name, author_id, created_at, pinned_at)
   VALUES (@content, 'Example admin', NULL, @createdAt, @pinnedAt)`,
);

const getProductBySlug = db.prepare('SELECT id FROM products WHERE slug = ?');
const getLink = db.prepare('SELECT id FROM product_links WHERE product_id = ? AND url = ?');
const insertLink = db.prepare('INSERT INTO product_links (product_id, label, url) VALUES (?, ?, ?)');

const unix = (date, time = '12:00') => Math.floor(new Date(`${date}T${time}:00Z`).getTime() / 1000);
const dayBefore = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

function seedOrder(order) {
  if (getOrderByCode.get(order.code)) return false;

  const user = getUser.get(order.userId);
  const createdAt = unix(dayBefore(order.fromDate, 7));
  const accepted = ['scheduled', 'active', 'returned'].includes(order.status);
  const handedOut = ['active', 'returned'].includes(order.status);
  const returned = order.status === 'returned';
  const rejected = order.status === 'rejected';

  const { lastInsertRowid: orderId } = insertOrder.run({
    code: order.code,
    userId: order.userId,
    status: order.status,
    fromDate: order.fromDate,
    toDate: order.toDate,
    note: order.note,
    contactName: user.name,
    contactEmail: user.email,
    contactMobile: '+47 400 00 000',
    confirmedBy: handedOut ? MODERATOR_ID : null,
    returnedBy: returned ? MODERATOR_ID : null,
    createdAt,
    acceptedAt: accepted || rejected ? createdAt + 86400 : null,
    activatedAt: handedOut ? unix(order.fromDate, '18:30') : null,
    returnedAt: returned ? unix(order.toDate, '18:30') : null,
    rejectedAt: rejected ? createdAt + 86400 : null,
    rejectedReason: rejected ? order.rejectedReason : null,
  });

  for (const { slug, quantity } of order.items) {
    const item = getItemBySlug.get(slug);
    if (!item) throw new Error(`Item ${slug} not found — run seed-example-catalog.mjs first.`);
    insertOrderItem.run(orderId, item.id, quantity, handedOut ? quantity : null);
  }
  return true;
}

function datesOnWeekday({ weekday, startDate, endDate }) {
  const dates = [];
  const d = new Date(`${startDate}T00:00:00Z`);
  while (d.toISOString().slice(0, 10) <= endDate) {
    if (d.getUTCDay() === weekday) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

const seed = db.transaction(() => {
  for (const u of users) upsertUser.run(u);

  let newOrders = 0;
  for (const o of orders) if (seedOrder(o)) newOrders++;

  if (!getRule.get(recurringRule)) {
    const { lastInsertRowid: ruleId } = insertRule.run({ ...recurringRule, userId: MODERATOR_ID });
    for (const date of datesOnWeekday(recurringRule)) {
      insertRecurringDay.run({ date, startTime: recurringRule.startTime, endTime: recurringRule.endTime, userId: MODERATOR_ID, ruleId });
    }
  }
  for (const day of singlePickupDays) insertSingleDay.run({ ...day, userId: MODERATOR_ID });

  for (const m of messages) {
    if (getMessage.get(m.content)) continue;
    const createdAt = Math.floor(Date.now() / 1000) - m.daysAgo * 86400;
    insertMessage.run({ content: m.content, createdAt, pinnedAt: m.pinned ? createdAt : null });
  }

  for (const l of productLinks) {
    const product = getProductBySlug.get(l.productSlug);
    if (!product || getLink.get(product.id, l.url)) continue;
    insertLink.run(product.id, l.label, l.url);
  }

  return newOrders;
});

const newOrders = seed();
db.close();

console.log(
  `Seeded ${users.length} users, ${orders.length} orders (${newOrders} new), ${singlePickupDays.length} single + 1 recurring pick-up days, ${messages.length} messages, ${productLinks.length} product links.`,
);
