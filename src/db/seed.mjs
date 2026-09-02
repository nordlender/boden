// Dev-only seed data. Plain JS + raw SQL (not schema.ts) so it can run with
// plain `node`, no TS loader needed. Idempotent: re-running skips items
// whose slug already exists.
import Database from 'better-sqlite3';

const db = new Database('./data/rental.db');
db.pragma('foreign_keys = ON');

const categories = [
  { name: 'Ropes', slug: 'ropes' },
  { name: 'Harness', slug: 'harness' },
  { name: 'Protection', slug: 'protection' },
  { name: 'Ice & Alpine', slug: 'ice-alpine' },
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
    category: 'harness',
    stockCount: 10,
    attributes: [
      ['Size', 'M (adjustable)'],
      ['Type', 'Sit harness'],
    ],
    optionGroups: [
      {
        name: 'Color',
        values: [
          { label: 'Red', imageUrl: '/uploads/harness-red.svg' },
          { label: 'Blue', imageUrl: '/uploads/harness-blue.svg' },
          { label: 'Green', imageUrl: '/uploads/harness-green.svg' },
        ],
      },
    ],
  },
  {
    slug: 'climbing-helmet',
    name: 'Climbing Helmet',
    description: 'Adjustable helmet for rock and ice.',
    imageUrl: '/uploads/helmet.svg',
    category: 'protection',
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
    category: 'protection',
    stockCount: 6,
    attributes: [
      ['Count', '6'],
      ['Gate', 'Wire'],
    ],
  },
  {
    // DMM Dragon Cam — specs (colour, strength, weight, range, product code)
    // vary by size, so none of them are item-level attributes; each is
    // carried on its own option value instead (see item_option_values.attributes).
    slug: 'dmm-dragon-cam',
    name: 'Dragon Cam',
    description:
      'Dual-axle cam with TripleGrip lobes for grip across rock types, plus an integrated extendable sling to cut down on quickdraws. Pick a size below.',
    imageUrl: '/product/dragon1.webp',
    category: 'protection',
    stockCount: 3,
    attributes: [],
    optionGroups: [
      {
        name: 'Size',
        values: [
          {
            label: '#00',
            imageUrl: '/product/dragon00.webp',
            attributes: { Colour: 'Blue', 'Active strength': '10 kN', 'Passive strength': '9 kN', Weight: '75 g', Range: '14-21 mm', 'Product code': 'A73500A' },
          },
          {
            label: '#0',
            imageUrl: '/product/dragon0.webp',
            attributes: { Colour: 'Silver', 'Active strength': '14 kN', 'Passive strength': '12 kN', Weight: '85 g', Range: '16-25 mm', 'Product code': 'A7350A' },
          },
          {
            label: '#1',
            imageUrl: '/product/dragon1.webp',
            attributes: { Colour: 'Purple', 'Active strength': '14 kN', 'Passive strength': '14 kN', Weight: '103 g', Range: '20-33 mm', 'Product code': 'A7351A' },
          },
          {
            label: '#2',
            imageUrl: '/product/dragon2.webp',
            attributes: { Colour: 'Green', 'Active strength': '14 kN', 'Passive strength': '14 kN', Weight: '117 g', Range: '24-41 mm', 'Product code': 'A7352A' },
          },
          {
            label: '#3',
            imageUrl: '/product/dragon3.webp',
            attributes: { Colour: 'Red', 'Active strength': '14 kN', 'Passive strength': '14 kN', Weight: '128 g', Range: '29-50 mm', 'Product code': 'A7353A' },
          },
          {
            label: '#4',
            imageUrl: '/product/dragon4.webp',
            attributes: { Colour: 'Gold', 'Active strength': '14 kN', 'Passive strength': '14 kN', Weight: '154 g', Range: '38-64 mm', 'Product code': 'A7354A' },
          },
        ],
      },
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
const getOptionGroup = db.prepare(
  'SELECT id FROM item_option_groups WHERE item_id = ? AND name = ?'
);
const insertOptionGroup = db.prepare(`
  INSERT INTO item_option_groups (item_id, name, sort_order)
  VALUES (@itemId, @name, @sortOrder)
`);
const insertOptionValue = db.prepare(`
  INSERT INTO item_option_values (group_id, label, image_url, attributes, sort_order)
  VALUES (@groupId, @label, @imageUrl, @attributes, @sortOrder)
`);

const seed = db.transaction(() => {
  for (const category of categories) {
    insertCategory.run(category);
  }

  for (const item of items) {
    let itemRow = getItemBySlug.get(item.slug);

    if (!itemRow) {
      const category = getCategoryId.get(item.category);
      const result = insertItem.run({
        slug: item.slug,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        categoryId: category.id,
        stockCount: item.stockCount,
      });
      itemRow = { id: result.lastInsertRowid };

      item.attributes.forEach(([key, value], index) => {
        insertAttribute.run({ itemId: itemRow.id, key, value, sortOrder: index });
      });
    }

    for (const group of item.optionGroups ?? []) {
      if (getOptionGroup.get(itemRow.id, group.name)) continue;

      const groupResult = insertOptionGroup.run({
        itemId: itemRow.id,
        name: group.name,
        sortOrder: 0,
      });

      group.values.forEach((value, index) => {
        insertOptionValue.run({
          groupId: groupResult.lastInsertRowid,
          label: value.label,
          imageUrl: value.imageUrl ?? null,
          attributes: value.attributes ? JSON.stringify(value.attributes) : null,
          sortOrder: index,
        });
      });
    }
  }
});

seed();
console.log('Seed complete.');
db.close();
