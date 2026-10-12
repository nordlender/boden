#!/usr/bin/env node
// Dev-only: seeds a fixed set of example categories/products/items, adapted
// from the flat item+option-group catalog that used to live on the
// `navbar-homepage` worktree (pre schema_v3) into this branch's
// categories -> products -> items -> itemAttributeValues model, plus the
// physical `units` behind each item (an item's stock is its active units).
//
// Not wired into astro dev/build/preview. Run manually after
// `npx drizzle-kit migrate` to get example catalog data to test the shop
// (add-to-cart) and the admin wizard against, instead of an empty db.
//
// Idempotent: re-running upserts on slug, so it's safe to run again after
// the wizard has since edited these same items.
//
// Usage: node scripts/seed-example-catalog.mjs

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

const categories = [
  { name: 'Ropes', slug: 'ropes' },
  { name: 'Harness', slug: 'harness' },
  { name: 'Protection', slug: 'protection' },
  { name: 'Ice & Alpine', slug: 'ice-alpine' },
];

// subcategories: [categorySlug, name, slug]
const subcategories = [['protection', 'Cams', 'cams']];

const products = [
  {
    slug: 'dynamic-rope-60m',
    title: 'Dynamic Climbing Rope 60m',
    description: 'Single dynamic rope for sport and trad routes.',
    categorySlug: 'ropes',
    thumbnailImageUrl: '/uploads/rope-60m.svg',
    attributeKeys: ['Diameter', 'Length'],
    unitDefaults: { brand: 'Edelrid', model: 'Boa 9.8' },
    items: [
      {
        slug: 'dynamic-rope-60m',
        name: 'Dynamic Climbing Rope 60m',
        imageUrl: '/uploads/rope-60m.svg',
        unitCount: 4,
        values: { Diameter: '9.8 mm', Length: '60 m' },
        // Example of `opts`: a rope cut down after core damage near one end
        // is still in use, just shorter than its item says.
        specialUnits: [
          {
            marking: 'ROPE-60-CUT',
            status: 'active',
            opts: { length: '58 m' },
            notes: [
              { date: '2025-06-14', text: 'Core damage 2 m from one end after a fall over an edge.' },
              { date: '2025-06-15', text: 'Cut to 58 m, ends sealed and re-marked.' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'climbing-harness',
    title: 'Climbing Harness',
    description: 'Adjustable sit harness, fits most body types.',
    categorySlug: 'harness',
    thumbnailImageUrl: '/uploads/harness.svg',
    attributeKeys: ['Size', 'Type', 'Color'],
    unitDefaults: { brand: 'Edelrid', model: 'Jay III' },
    items: [
      {
        slug: 'climbing-harness-red',
        name: 'Climbing Harness — Red',
        imageUrl: '/uploads/harness-red.svg',
        unitCount: 4,
        values: { Size: 'M (adjustable)', Type: 'Sit harness', Color: 'Red' },
        // Example of an out-of-service unit: it exists, but doesn't count
        // toward stock until it's set back to active.
        specialUnits: [
          {
            marking: 'HARNESS-RED-OOS',
            status: 'out_of_service',
            notes: [{ date: '2026-09-20', text: 'Status: Active → Out of service — Belay loop fuzzed, sent for inspection.' }],
          },
        ],
      },
      {
        slug: 'climbing-harness-blue',
        name: 'Climbing Harness — Blue',
        imageUrl: '/uploads/harness-blue.svg',
        unitCount: 3,
        values: { Size: 'M (adjustable)', Type: 'Sit harness', Color: 'Blue' },
      },
      {
        slug: 'climbing-harness-green',
        name: 'Climbing Harness — Green',
        imageUrl: '/uploads/harness-green.svg',
        unitCount: 3,
        values: { Size: 'M (adjustable)', Type: 'Sit harness', Color: 'Green' },
      },
      // S/L sizes exist mainly to give the example set below (Indoor Rope
      // Climbing Set) size-matched harnesses to bundle — its M variant
      // reuses climbing-harness-blue above rather than adding a redundant
      // 4th M-sized item, which is itself the point: a set component is a
      // real, independently-rentable item, not a set-only stub (see issue
      // #61's original framing).
      {
        slug: 'climbing-harness-s',
        name: 'Climbing Harness — S',
        imageUrl: '/uploads/harness.svg',
        unitCount: 3,
        values: { Size: 'S (adjustable)', Type: 'Sit harness', Color: 'Black' },
      },
      {
        slug: 'climbing-harness-l',
        name: 'Climbing Harness — L',
        imageUrl: '/uploads/harness.svg',
        unitCount: 3,
        values: { Size: 'L (adjustable)', Type: 'Sit harness', Color: 'Black' },
      },
    ],
  },
  {
    slug: 'chalk-bag',
    title: 'Chalk Bag',
    description: 'Simple chalk bag with a brush loop and adjustable belt.',
    categorySlug: 'harness',
    thumbnailImageUrl: '/uploads/quickdraws.svg',
    attributeKeys: ['Capacity'],
    items: [
      {
        slug: 'chalk-bag',
        name: 'Chalk Bag',
        imageUrl: '/uploads/quickdraws.svg',
        unitCount: 6,
        values: { Capacity: '650 ml' },
      },
    ],
  },
  {
    slug: 'singing-rock-rama-belay-device',
    title: 'Singing Rock Rama Belay Device',
    description: 'Assisted-braking belay device for single ropes.',
    categorySlug: 'harness',
    thumbnailImageUrl: '/uploads/harness.svg',
    attributeKeys: ['Type', 'Compatible rope diameter'],
    items: [
      {
        slug: 'singing-rock-rama',
        name: 'Singing Rock Rama Belay Device',
        imageUrl: '/uploads/harness.svg',
        unitCount: 5,
        values: { Type: 'Assisted-braking', 'Compatible rope diameter': '8.5–11 mm' },
      },
    ],
  },
  {
    slug: 'climbing-helmet',
    title: 'Climbing Helmet',
    description: 'Adjustable helmet for rock and ice.',
    categorySlug: 'protection',
    thumbnailImageUrl: '/uploads/helmet.svg',
    attributeKeys: ['Size', 'Weight'],
    items: [
      {
        slug: 'climbing-helmet',
        name: 'Climbing Helmet',
        imageUrl: '/uploads/helmet.svg',
        unitCount: 8,
        values: { Size: 'Adjustable', Weight: '300 g' },
      },
    ],
  },
  {
    slug: 'quickdraw-set-6',
    title: 'Quickdraw Set (6-pack)',
    description: 'Six quickdraws with wire gates, ready to rack.',
    categorySlug: 'protection',
    thumbnailImageUrl: '/uploads/quickdraws.svg',
    attributeKeys: ['Count', 'Gate'],
    items: [
      {
        slug: 'quickdraw-set-6',
        name: 'Quickdraw Set (6-pack)',
        imageUrl: '/uploads/quickdraws.svg',
        unitCount: 6,
        values: { Count: '6', Gate: 'Wire' },
      },
    ],
  },
  {
    slug: 'dmm-dragon-cam',
    title: 'Dragon Cam',
    description:
      'Dual-axle cam with TripleGrip lobes for grip across rock types, plus an integrated extendable sling to cut down on quickdraws. Pick a size below.',
    categorySlug: 'protection',
    subcategorySlug: 'cams',
    thumbnailImageUrl: '/product/dragon1.webp',
    attributeKeys: ['Size', 'Colour', 'Active strength', 'Passive strength', 'Weight', 'Range', 'Product code'],
    unitDefaults: { brand: 'DMM', model: 'Dragon 2' },
    items: [
      {
        slug: 'dmm-dragon-cam-00',
        name: 'Dragon Cam #00',
        imageUrl: '/product/dragon00.webp',
        unitCount: 2,
        values: {
          Size: '#00',
          Colour: 'Blue',
          'Active strength': '10 kN',
          'Passive strength': '9 kN',
          Weight: '75 g',
          Range: '14-21 mm',
          'Product code': 'A73500A',
        },
      },
      {
        slug: 'dmm-dragon-cam-0',
        name: 'Dragon Cam #0',
        imageUrl: '/product/dragon0.webp',
        unitCount: 2,
        values: {
          Size: '#0',
          Colour: 'Silver',
          'Active strength': '14 kN',
          'Passive strength': '12 kN',
          Weight: '85 g',
          Range: '16-25 mm',
          'Product code': 'A7350A',
        },
      },
      {
        slug: 'dmm-dragon-cam-1',
        name: 'Dragon Cam #1',
        imageUrl: '/product/dragon1.webp',
        unitCount: 3,
        values: {
          Size: '#1',
          Colour: 'Purple',
          'Active strength': '14 kN',
          'Passive strength': '14 kN',
          Weight: '103 g',
          Range: '20-33 mm',
          'Product code': 'A7351A',
        },
      },
      {
        slug: 'dmm-dragon-cam-2',
        name: 'Dragon Cam #2',
        imageUrl: '/product/dragon2.webp',
        unitCount: 2,
        values: {
          Size: '#2',
          Colour: 'Green',
          'Active strength': '14 kN',
          'Passive strength': '14 kN',
          Weight: '117 g',
          Range: '24-41 mm',
          'Product code': 'A7352A',
        },
      },
      {
        // Deliberately zero stock — an example of an out-of-stock variant
        // for exercising that path in the shop/cart UI. Its one unit is
        // retired, so the item still has a history but no active stock.
        slug: 'dmm-dragon-cam-3',
        name: 'Dragon Cam #3',
        imageUrl: '/product/dragon3.webp',
        unitCount: 0,
        specialUnits: [
          {
            marking: 'CAM3-RETIRED',
            status: 'retired',
            notes: [
              { date: '2024-05-02', text: 'Trigger wire frayed. Replaced by DMM under warranty.' },
              { date: '2026-08-11', text: 'Status: Active → Retired — Lobe deformed after a long fall, failed inspection.' },
            ],
          },
        ],
        values: {
          Size: '#3',
          Colour: 'Red',
          'Active strength': '14 kN',
          'Passive strength': '14 kN',
          Weight: '128 g',
          Range: '29-50 mm',
          'Product code': 'A7353A',
        },
      },
      {
        slug: 'dmm-dragon-cam-4',
        name: 'Dragon Cam #4',
        imageUrl: '/product/dragon4.webp',
        unitCount: 1,
        values: {
          Size: '#4',
          Colour: 'Gold',
          'Active strength': '14 kN',
          'Passive strength': '14 kN',
          Weight: '154 g',
          Range: '38-64 mm',
          'Product code': 'A7354A',
        },
      },
    ],
  },
  {
    slug: 'ice-axe',
    title: 'Ice Axe',
    description: 'General mountaineering ice axe.',
    categorySlug: 'ice-alpine',
    thumbnailImageUrl: '/uploads/ice-axe.svg',
    attributeKeys: ['Length', 'Type'],
    items: [
      {
        slug: 'ice-axe',
        name: 'Ice Axe',
        imageUrl: '/uploads/ice-axe.svg',
        unitCount: 4,
        values: { Length: '60 cm', Type: 'Mountaineering' },
      },
    ],
  },
  {
    slug: 'crampons',
    title: 'Crampons',
    description: '12-point step-in crampons.',
    categorySlug: 'ice-alpine',
    thumbnailImageUrl: '/uploads/crampons.svg',
    attributeKeys: ['Points', 'Type'],
    items: [
      {
        slug: 'crampons',
        name: 'Crampons',
        imageUrl: '/uploads/crampons.svg',
        unitCount: 4,
        values: { Points: '12', Type: 'Step-in' },
      },
    ],
  },
];

// Example sets — a product's variant slot can be a set instead of (or
// alongside) an item, each set resolving to a bundle of real items via
// setItems (see src/db/schema.ts's `sets` comment). A set has no attribute
// template of its own: `label` is a plain, manually-typed string the admin
// picks to distinguish sibling sets (or null when there's only one), and
// what a set "includes" is derived automatically at display time from its
// components' own real attribute values — see src/lib/sets.ts's
// getSetComponentDisplayBulk. Deliberately two different shapes here:
//
// - "Indoor Rope Climbing Set" bundles components from three unrelated
//   products (harness/chalk bag/belay device) — each set component renders
//   as its own line, since nothing else in the set shares its attribute
//   keys.
// - "Dragon Cam Rack" bundles five different sizes of the *same* product
//   (Dragon Cam) — these share an identical attribute-key signature, so
//   they render as one shared table instead (this is the case the table
//   layout exists for).
const setProducts = [
  {
    slug: 'indoor-rope-climbing-set',
    title: 'Indoor Rope Climbing Set',
    description: 'Everything for an indoor top-rope session — harness, chalk bag, and belay device, bundled by size.',
    categorySlug: 'ropes',
    thumbnailImageUrl: '/uploads/rope-60m.svg',
    sets: [
      {
        slug: 'indoor-rope-climbing-set-s',
        name: 'Indoor Rope Climbing Set (internal) — S',
        label: 'S',
        components: [
          { itemSlug: 'climbing-harness-s', quantity: 1 },
          { itemSlug: 'chalk-bag', quantity: 1 },
          { itemSlug: 'singing-rock-rama', quantity: 1 },
        ],
      },
      {
        slug: 'indoor-rope-climbing-set-m',
        name: 'Indoor Rope Climbing Set (internal) — M',
        label: 'M',
        components: [
          { itemSlug: 'climbing-harness-blue', quantity: 1 },
          { itemSlug: 'chalk-bag', quantity: 1 },
          { itemSlug: 'singing-rock-rama', quantity: 1 },
        ],
      },
      {
        slug: 'indoor-rope-climbing-set-l',
        name: 'Indoor Rope Climbing Set (internal) — L',
        label: 'L',
        components: [
          { itemSlug: 'climbing-harness-l', quantity: 1 },
          { itemSlug: 'chalk-bag', quantity: 1 },
          { itemSlug: 'singing-rock-rama', quantity: 1 },
        ],
      },
    ],
  },
  {
    slug: 'dragon-cam-rack-set',
    title: 'Dragon Cam Rack (5-piece)',
    description: 'A curated 5-piece Dragon Cam rack, sizes #00 through #4 (excluding #3).',
    categorySlug: 'protection',
    subcategorySlug: 'cams',
    thumbnailImageUrl: '/product/dragon1.webp',
    sets: [
      {
        slug: 'dragon-cam-rack-set-standard',
        name: 'Dragon Cam Rack (internal)',
        label: null, // only one variant — nothing to distinguish it from
        components: [
          { itemSlug: 'dmm-dragon-cam-00', quantity: 1 },
          { itemSlug: 'dmm-dragon-cam-0', quantity: 1 },
          { itemSlug: 'dmm-dragon-cam-1', quantity: 1 },
          { itemSlug: 'dmm-dragon-cam-2', quantity: 1 },
          // Skips dmm-dragon-cam-3, which is deliberately zero-stock (see
          // its own comment above) — keeps this set actually orderable.
          { itemSlug: 'dmm-dragon-cam-4', quantity: 1 },
        ],
      },
    ],
  },
];

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const upsertCategory = db.prepare(
  'INSERT INTO categories (name, slug) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name',
);
const getCategoryBySlug = db.prepare('SELECT id FROM categories WHERE slug = ?');
const upsertSubcategory = db.prepare(
  `INSERT INTO subcategories (category_id, name, slug) VALUES (?, ?, ?)
   ON CONFLICT(category_id, slug) DO UPDATE SET name = excluded.name`,
);
const getSubcategoryBySlug = db.prepare('SELECT id FROM subcategories WHERE category_id = ? AND slug = ?');

const upsertProduct = db.prepare(
  `INSERT INTO products (slug, title, description, category_id, subcategory_id, status, thumbnail_image_url)
   VALUES (@slug, @title, @description, @categoryId, @subcategoryId, 'published', @thumbnailImageUrl)
   ON CONFLICT(slug) DO UPDATE SET
     title = excluded.title,
     description = excluded.description,
     category_id = excluded.category_id,
     subcategory_id = excluded.subcategory_id,
     thumbnail_image_url = excluded.thumbnail_image_url`,
);
const getProductBySlug = db.prepare('SELECT id FROM products WHERE slug = ?');

const upsertAttributeKey = db.prepare(
  `INSERT INTO product_attribute_keys (product_id, name, sort_order) VALUES (?, ?, ?)
   ON CONFLICT(product_id, name) DO UPDATE SET sort_order = excluded.sort_order`,
);
const getAttributeKey = db.prepare('SELECT id FROM product_attribute_keys WHERE product_id = ? AND name = ?');

const upsertItem = db.prepare(
  `INSERT INTO items (product_id, slug, name, image_url, archived)
   VALUES (@productId, @slug, @name, @imageUrl, 0)
   ON CONFLICT(slug) DO UPDATE SET
     product_id = excluded.product_id,
     name = excluded.name,
     image_url = excluded.image_url,
     archived = 0`,
);
const getItemBySlug = db.prepare('SELECT id FROM items WHERE slug = ?');

// Units have no natural unique key, so the seed identifies its own units by
// (item, marking) — re-running only adds units that are missing, so it
// never duplicates them or overwrites what an admin has edited since.
const getUnitByMarking = db.prepare('SELECT id FROM units WHERE item_id = ? AND marking = ?');
const insertUnit = db.prepare(
  `INSERT INTO units (item_id, brand, model, marking, serial_number, manufactured_at, purchased_at, status, notes, opts)
   VALUES (@itemId, @brand, @model, @marking, @serialNumber, @manufacturedAt, @purchasedAt, @status, @notes, @opts)`,
);

const upsertAttributeValue = db.prepare(
  `INSERT INTO item_attribute_values (item_id, attribute_id, value) VALUES (?, ?, ?)
   ON CONFLICT(item_id, attribute_id) DO UPDATE SET value = excluded.value`,
);

const upsertSet = db.prepare(
  `INSERT INTO sets (product_id, slug, name, label, image_url, archived)
   VALUES (@productId, @slug, @name, @label, @imageUrl, 0)
   ON CONFLICT(slug) DO UPDATE SET
     product_id = excluded.product_id,
     name = excluded.name,
     label = excluded.label,
     image_url = excluded.image_url,
     archived = 0`,
);
const getSetBySlug = db.prepare('SELECT id FROM sets WHERE slug = ?');

const upsertSetItem = db.prepare(
  `INSERT INTO set_items (set_id, item_id, quantity) VALUES (?, ?, ?)
   ON CONFLICT(set_id, item_id) DO UPDATE SET quantity = excluded.quantity`,
);

// Shared by seedProduct/seedSetProduct — both a regular product and a
// set-only product upsert the same row shape, just with a different set of
// children underneath.
function upsertProductRow(p) {
  const categoryId = getCategoryBySlug.get(p.categorySlug).id;
  const subcategoryId = p.subcategorySlug ? getSubcategoryBySlug.get(categoryId, p.subcategorySlug).id : null;

  upsertProduct.run({
    slug: p.slug,
    title: p.title,
    description: p.description,
    categoryId,
    subcategoryId,
    thumbnailImageUrl: p.thumbnailImageUrl,
  });
  return getProductBySlug.get(p.slug).id;
}

// Every item gets `unitCount` active units (its stock) marked
// <SLUG>-01, -02, …, with varied but deterministic purchase/manufacture
// dates and serials, plus any hand-written `specialUnits` (out of service,
// retired, cut ropes, …) on top.
function seedUnits(itemId, item, unitDefaults = {}) {
  const prefix = item.slug.toUpperCase();
  const numbered = Array.from({ length: item.unitCount }, (_, i) => {
    const n = i + 1;
    const year = 2021 + ((itemId + n) % 5);
    const month = String(1 + ((itemId * 3 + n) % 12)).padStart(2, '0');
    return {
      marking: `${prefix}-${String(n).padStart(2, '0')}`,
      serialNumber: `${String(itemId).padStart(3, '0')}${String(year).slice(2)}${String(1000 + n * 37)}`,
      manufacturedAt: `${year - 1}-${month}-01`,
      purchasedAt: `${year}-${month}-15`,
      status: 'active',
    };
  });

  for (const unit of [...numbered, ...(item.specialUnits ?? [])]) {
    if (getUnitByMarking.get(itemId, unit.marking)) continue;
    insertUnit.run({
      itemId,
      brand: unit.brand ?? unitDefaults.brand ?? null,
      model: unit.model ?? unitDefaults.model ?? null,
      marking: unit.marking,
      serialNumber: unit.serialNumber ?? null,
      manufacturedAt: unit.manufacturedAt ?? null,
      purchasedAt: unit.purchasedAt ?? null,
      status: unit.status ?? 'active',
      notes: JSON.stringify((unit.notes ?? []).map((note) => ({ authorId: null, ...note }))),
      opts: JSON.stringify(unit.opts ?? {}),
    });
  }
}

function seedItem(productId, item, attributeIds, unitDefaults) {
  upsertItem.run({
    productId,
    slug: item.slug,
    name: item.name,
    imageUrl: item.imageUrl,
  });
  const itemId = getItemBySlug.get(item.slug).id;

  for (const [key, value] of Object.entries(item.values)) {
    upsertAttributeValue.run(itemId, attributeIds[key], value);
  }
  seedUnits(itemId, item, unitDefaults);
}

function seedProduct(p) {
  const productId = upsertProductRow(p);

  const attributeIds = {};
  p.attributeKeys.forEach((name, i) => {
    upsertAttributeKey.run(productId, name, i);
    attributeIds[name] = getAttributeKey.get(productId, name).id;
  });

  for (const item of p.items) seedItem(productId, item, attributeIds, p.unitDefaults);
}

function seedSet(productId, set) {
  upsertSet.run({ productId, slug: set.slug, name: set.name, label: set.label ?? null, imageUrl: set.imageUrl ?? null });
  const setId = getSetBySlug.get(set.slug).id;

  for (const component of set.components) {
    const itemId = getItemBySlug.get(component.itemSlug).id;
    upsertSetItem.run(setId, itemId, component.quantity);
  }
}

function seedSetProduct(p) {
  const productId = upsertProductRow(p);
  for (const set of p.sets) seedSet(productId, set);
}

const seed = db.transaction(() => {
  for (const c of categories) upsertCategory.run(c.name, c.slug);

  for (const [categorySlug, name, slug] of subcategories) {
    const categoryId = getCategoryBySlug.get(categorySlug).id;
    upsertSubcategory.run(categoryId, name, slug);
  }

  for (const p of products) seedProduct(p);
  for (const p of setProducts) seedSetProduct(p);
});

seed();
db.close();

const totalItems = products.reduce((sum, p) => sum + p.items.length, 0);
const totalSets = setProducts.reduce((sum, p) => sum + p.sets.length, 0);
const totalUnits = products.reduce(
  (sum, p) => sum + p.items.reduce((n, item) => n + item.unitCount + (item.specialUnits?.length ?? 0), 0),
  0,
);
console.log(
  `Seeded ${categories.length} categories, ${products.length + setProducts.length} products, ${totalItems} items, ${totalUnits} units, ${totalSets} sets.`,
);
