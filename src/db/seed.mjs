// Dev-only seed data. Plain JS + raw SQL (not schema.ts) so it can run with
// plain `node`, no TS loader needed. Idempotent: re-running skips items
// whose slug already exists.
import Database from 'better-sqlite3';

const db = new Database('./data/rental.db');
db.pragma('foreign_keys = ON');

const categories = [
  { name: 'Ropes', slug: 'ropes' },
  { name: 'Harnesses & Protection', slug: 'harnesses-protection' },
  { name: 'Ice & Alpine', slug: 'ice-alpine' },
  { name: 'Camping', slug: 'camping' },
];

const items = [
  {
    slug: 'dynamic-rope-60m',
    name: 'Dynamic Climbing Rope 60m',
    description: 'Single dynamic rope for sport and trad routes.',
    imageUrl: '/uploads/rope-60m.svg',
    category: 'ropes',
    stockCount: 5,
    attributes: [
      ['Diameter', '9.8 mm'],
      ['Length', '60 m'],
    ],
  },
  {
    slug: 'climbing-harness',
    name: 'Climbing Harness',
    description: 'Adjustable sit harness, fits most body types.',
    imageUrl: '/uploads/harness.svg',
    category: 'harnesses-protection',
    stockCount: 10,
    attributes: [
      ['Size', 'M (adjustable)'],
      ['Type', 'Sit harness'],
    ],
  },
  {
    slug: 'climbing-helmet',
    name: 'Climbing Helmet',
    description: 'Adjustable helmet for rock and ice.',
    imageUrl: '/uploads/helmet.svg',
    category: 'harnesses-protection',
    stockCount: 8,
    attributes: [
      ['Size', 'Adjustable'],
      ['Weight', '300 g'],
    ],
  },
  {
    slug: 'quickdraw-set-6',
    name: 'Quickdraw Set (6-pack)',
    description: 'Six quickdraws with wire gates, ready to rack.',
    imageUrl: '/uploads/quickdraws.svg',
    category: 'harnesses-protection',
    stockCount: 6,
    attributes: [
      ['Count', '6'],
      ['Gate', 'Wire'],
    ],
  },
  {
    slug: 'dmm-dragon-cam-1',
    name: 'DMM Dragon Cam #1',
    description:
      'Dual-axle cam with TripleGrip lobes for grip across rock types, plus an integrated extendable sling to cut down on quickdraws.',
    imageUrl: '/uploads/dragon1.jpg',
    category: 'harnesses-protection',
    stockCount: 3,
    attributes: [
      ['Colour', 'Purple'],
      ['Range', '20-33 mm'],
      ['Strength', '14 kN'],
      ['Weight', '103 g'],
      ['Product code', 'A7351A'],
    ],
  },
  {
    slug: 'ice-axe',
    name: 'Ice Axe',
    description: 'General mountaineering ice axe.',
    imageUrl: '/uploads/ice-axe.svg',
    category: 'ice-alpine',
    stockCount: 4,
    attributes: [
      ['Length', '60 cm'],
      ['Type', 'Mountaineering'],
    ],
  },
  {
    slug: 'crampons',
    name: 'Crampons',
    description: '12-point step-in crampons.',
    imageUrl: '/uploads/crampons.svg',
    category: 'ice-alpine',
    stockCount: 4,
    attributes: [
      ['Points', '12'],
      ['Type', 'Step-in'],
    ],
  },
  {
    slug: 'tent-4-person',
    name: '4-Person Tent',
    description: 'Freestanding 3-season tent for approach camps.',
    imageUrl: '/uploads/tent-4p.svg',
    category: 'camping',
    stockCount: 2,
    attributes: [
      ['Capacity', '4 person'],
      ['Weight', '3.2 kg'],
    ],
  },
];

const insertCategory = db.prepare(
  'INSERT OR IGNORE INTO categories (name, slug) VALUES (@name, @slug)'
);
const getCategoryId = db.prepare('SELECT id FROM categories WHERE slug = ?');
const getItemBySlug = db.prepare('SELECT id FROM items WHERE slug = ?');
const insertItem = db.prepare(`
  INSERT INTO items (slug, name, description, image_url, category_id, stock_count)
  VALUES (@slug, @name, @description, @imageUrl, @categoryId, @stockCount)
`);
const insertAttribute = db.prepare(`
  INSERT INTO item_attributes (item_id, key, value, sort_order)
  VALUES (@itemId, @key, @value, @sortOrder)
`);

const seed = db.transaction(() => {
  for (const category of categories) {
    insertCategory.run(category);
  }

  for (const item of items) {
    if (getItemBySlug.get(item.slug)) continue;

    const category = getCategoryId.get(item.category);
    const result = insertItem.run({
      slug: item.slug,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      categoryId: category.id,
      stockCount: item.stockCount,
    });

    item.attributes.forEach(([key, value], index) => {
      insertAttribute.run({ itemId: result.lastInsertRowid, key, value, sortOrder: index });
    });
  }
});

seed();
console.log('Seed complete.');
db.close();
