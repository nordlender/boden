import { describe, it, expect } from 'vitest';
import { entryKey, isCartId, parseCartEntries, sameEntries, sameSnapshot, toCartEntries } from '../cartEntries';

const ID = '0b6f8c1e-2f5a-4c3d-9e8b-7a6f5e4d3c2b';

describe('parseCartEntries', () => {
  it('parses item and set entries', () => {
    expect(parseCartEntries('[{"itemId":1,"quantity":2},{"setId":3,"quantity":1}]')).toEqual([
      { itemId: 1, quantity: 2 },
      { setId: 3, quantity: 1 },
    ]);
  });

  it('accepts an empty array', () => {
    expect(parseCartEntries('[]')).toEqual([]);
  });

  it.each([
    ['empty string', ''],
    ['malformed JSON', '{nope'],
    ['non-array', '{"itemId":1,"quantity":1}'],
    ['JSON null', 'null'],
    ['JSON string', '"x"'],
    ['JSON number', '42'],
    ['null entry', '[null]'],
    ['number entry', '[1]'],
    ['array entry', '[[1,1]]'],
    ['both ids', '[{"itemId":1,"setId":1,"quantity":1}]'],
    ['no id', '[{"quantity":1}]'],
    ['no quantity', '[{"itemId":1}]'],
    ['unknown field', '[{"itemId":1,"quantity":1,"extra":true}]'],
    ['__proto__ field', '[{"itemId":1,"quantity":1,"__proto__":{"setId":1}}]'],
    ['zero quantity', '[{"itemId":1,"quantity":0}]'],
    ['negative quantity', '[{"itemId":1,"quantity":-2}]'],
    ['fractional quantity', '[{"itemId":1,"quantity":1.5}]'],
    ['string quantity', '[{"itemId":1,"quantity":"2"}]'],
    ['unsafe integer quantity', '[{"itemId":1,"quantity":1e300}]'],
    ['string id', '[{"itemId":"1","quantity":1}]'],
    ['negative id', '[{"setId":-1,"quantity":1}]'],
    ['unsafe integer id', '[{"itemId":9007199254740993,"quantity":1}]'],
    ['duplicate line', '[{"itemId":1,"quantity":1},{"itemId":1,"quantity":2}]'],
  ])('rejects %s', (_label, raw) => {
    expect(parseCartEntries(raw)).toBeNull();
  });

  it('toCartEntries applies the same rules to an already-parsed value', () => {
    expect(toCartEntries([{ itemId: 1, quantity: 1 }])).toEqual([{ itemId: 1, quantity: 1 }]);
    expect(toCartEntries([{ itemId: 1, quantity: 0 }])).toBeNull();
    expect(toCartEntries(undefined)).toBeNull();
  });
});

describe('entryKey', () => {
  it('keeps an item and a set sharing an id apart', () => {
    expect(entryKey({ itemId: 1 })).toBe('item:1');
    expect(entryKey({ setId: 1 })).toBe('set:1');
  });
});

describe('isCartId', () => {
  it('accepts a randomUUID-style id and rejects anything else', () => {
    expect(isCartId(ID)).toBe(true);
    expect(isCartId(crypto.randomUUID())).toBe(true);
    expect(isCartId(ID.toUpperCase())).toBe(false);
    expect(isCartId('abc')).toBe(false);
    expect(isCartId(undefined)).toBe(false);
    expect(isCartId(42)).toBe(false);
  });
});

describe('sameEntries / sameSnapshot', () => {
  const a = [
    { itemId: 1, quantity: 2 },
    { setId: 1, quantity: 1 },
  ];

  it('ignores line order', () => {
    expect(sameEntries(a, [...a].reverse())).toBe(true);
  });

  it('notices a changed quantity, an added line, or a removed line', () => {
    expect(sameEntries(a, [{ itemId: 1, quantity: 3 }, { setId: 1, quantity: 1 }])).toBe(false);
    expect(sameEntries(a, [...a, { itemId: 2, quantity: 1 }])).toBe(false);
    expect(sameEntries(a, [a[0]])).toBe(false);
  });

  it('does not treat an item and a set sharing an id as the same line', () => {
    expect(sameEntries([{ itemId: 1, quantity: 1 }], [{ setId: 1, quantity: 1 }])).toBe(false);
  });

  it('treats a different cart id as a different cart even with the same lines', () => {
    expect(sameSnapshot({ cartId: ID, entries: a }, { cartId: ID, entries: [...a] })).toBe(true);
    expect(sameSnapshot({ cartId: ID, entries: a }, { cartId: crypto.randomUUID(), entries: a })).toBe(false);
  });
});
