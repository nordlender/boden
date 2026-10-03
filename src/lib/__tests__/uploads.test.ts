import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentTypeForUpload, MAX_UPLOAD_BYTES, saveImageUpload, sniffImageType, uploadFilename } from '../uploads';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const bytes = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe('sniffImageType', () => {
  it('recognises supported raster formats by their leading bytes', () => {
    expect(sniffImageType(PNG)).toBe('png');
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImageType(bytes('GIF89a....'))).toBe('gif');
    expect(sniffImageType(bytes('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(sniffImageType(bytes('\0\0\0\x1cftypavif'))).toBe('avif');
  });

  it('rejects SVG, HTML and other non-images regardless of filename', () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(bytes('<!doctype html><script>'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('uploadFilename', () => {
  it('slugifies the base name, adds a random suffix and the sniffed extension', () => {
    expect(uploadFilename('Edelrid Harness (grønn).JPEG', 'jpg')).toMatch(/^edelrid-harness-gr-nn-[0-9a-f]{6}\.jpg$/);
  });

  it('ignores the client extension and strips path tricks', () => {
    expect(uploadFilename('../../evil.svg', 'png')).toMatch(/^evil-[0-9a-f]{6}\.png$/);
    expect(uploadFilename('....', 'gif')).toMatch(/^image-[0-9a-f]{6}\.gif$/);
  });
});

describe('saveImageUpload', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'uploads-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores a valid image and returns its /media URL', async () => {
    const result = await saveImageUpload(new File([PNG], 'Rope.png'), dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe(`/media/${result.name}`);
    expect(readdirSync(dir)).toEqual([result.name]);
    expect(new Uint8Array(readFileSync(join(dir, result.name)))).toEqual(PNG);
  });

  it('rejects unsupported, empty and oversized files without writing', async () => {
    expect(await saveImageUpload(new File([bytes('<svg/>')], 'x.png'), dir)).toEqual({ ok: false, error: 'unsupported_type' });
    expect(await saveImageUpload(new File([], 'x.png'), dir)).toEqual({ ok: false, error: 'empty' });
    const huge = new File([PNG, new Uint8Array(MAX_UPLOAD_BYTES)], 'big.png');
    expect(await saveImageUpload(huge, dir)).toEqual({ ok: false, error: 'too_large' });
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('contentTypeForUpload', () => {
  it('maps served extensions and refuses anything else', () => {
    expect(contentTypeForUpload('a.png')).toBe('image/png');
    expect(contentTypeForUpload('a.JPEG')).toBe('image/jpeg');
    expect(contentTypeForUpload('a.svg')).toBeNull();
    expect(contentTypeForUpload('noext')).toBeNull();
  });
});
