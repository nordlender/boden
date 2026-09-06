#!/usr/bin/env node
// Dev-only: seeds a fixed set of example categories/products/items, adapted
// from the flat item+option-group catalog that used to live on the
// `navbar-homepage` worktree (pre schema_v3) into this branch's
// categories -> products -> items -> itemAttributeValues model.
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
    items: [
      {
        slug: 'dynamic-rope-60m',
        name: 'Dynamic Climbing Rope 60m',
        imageUrl: '/uploads/rope-60m.svg',
        stockCount: 5,
        values: { Diameter: '9.8 mm', Length: '60 m' },
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
    items: [
      {
        slug: 'climbing-harness-red',
        name: 'Climbing Harness — Red',
        imageUrl: '/uploads/harness-red.svg',
        stockCount: 4,
        values: { Size: 'M (adjustable)', Type: 'Sit harness', Color: 'Red' },
      },
      {
        slug: 'climbing-harness-blue',
        name: 'Climbing Harness — Blue',
        imageUrl: '/uploads/harness-blue.svg',
        stockCount: 3,
        values: { Size: 'M (adjustable)', Type: 'Sit harness', Color: 'Blue' },
      },
      {
        slug: 'climbing-harness-green',
        name: 'Climbing Harness — Green',
        imageUrl: '/uploads/harness-green.svg',
        stockCount: 3,
        values: { Size: 'M (adjustable)', Type: 'Sit harness', Color: 'Green' },
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
        stockCount: 8,
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
        stockCount: 6,
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
    items: [
      {
        slug: 'dmm-dragon-cam-00',
        name: 'Dragon Cam #00',
        imageUrl: '/product/dragon00.webp',
        stockCount: 2,
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
        stockCount: 2,
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
        stockCount: 3,
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
        stockCount: 2,
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
        // for exercising that path in the shop/cart UI.
        slug: 'dmm-dragon-cam-3',
        name: 'Dragon Cam #3',
        imageUrl: '/product/dragon3.webp',
        stockCount: 0,
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
        stockCount: 1,
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
        stockCount: 4,
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
        stockCount: 4,
        values: { Points: '12', Type: 'Step-in' },
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
  `INSERT INTO items (product_id, slug, name, image_url, stock_count, archived)
   VALUES (@productId, @slug, @name, @imageUrl, @stockCount, 0)
   ON CONFLICT(slug) DO UPDATE SET
     product_id = excluded.product_id,
     name = excluded.name,
     image_url = excluded.image_url,
     stock_count = excluded.stock_count,
     archived = 0`,
);
const getItemBySlug = db.prepare('SELECT id FROM items WHERE slug = ?');

const upsertAttributeValue = db.prepare(
  `INSERT INTO item_attribute_values (item_id, attribute_id, value) VALUES (?, ?, ?)
   ON CONFLICT(item_id, attribute_id) DO UPDATE SET value = excluded.value`,
);

const seed = db.transaction(() => {
  for (const c of categories) upsertCategory.run(c.name, c.slug);

  for (const [categorySlug, name, slug] of subcategories) {
    const categoryId = getCategoryBySlug.get(categorySlug).id;
    upsertSubcategory.run(categoryId, name, slug);
  }

  for (const p of products) {
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
    const productId = getProductBySlug.get(p.slug).id;

    const attributeIds = {};
    p.attributeKeys.forEach((name, i) => {
      upsertAttributeKey.run(productId, name, i);
      attributeIds[name] = getAttributeKey.get(productId, name).id;
    });

    for (const item of p.items) {
      upsertItem.run({
        productId,
        slug: item.slug,
        name: item.name,
        imageUrl: item.imageUrl,
        stockCount: item.stockCount,
      });
      const itemId = getItemBySlug.get(item.slug).id;

      for (const [key, value] of Object.entries(item.values)) {
        upsertAttributeValue.run(itemId, attributeIds[key], value);
      }
    }
  }
});

seed();
db.close();

const totalItems = products.reduce((sum, p) => sum + p.items.length, 0);
console.log(`Seeded ${categories.length} categories, ${products.length} products, ${totalItems} items.`);
