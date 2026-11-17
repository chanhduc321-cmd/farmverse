import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const page = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const BANNED = /near|blockchain|crypto|web3|wallet|token|\bví\b/i;

function meta(attribute: 'property' | 'name', key: string): string | undefined {
  const tag = new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]*)"`).exec(page);
  return tag?.[1];
}

describe('link preview tags', () => {
  test('describes the game in Vietnamese for Open Graph and Twitter cards', () => {
    expect(meta('property', 'og:title')).toBe('Nông Trại Mộng Mơ');
    expect(meta('property', 'og:description')).toMatch(/trộm rau/);
    expect(meta('name', 'description')).toBe(meta('property', 'og:description'));
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:locale')).toBe('vi_VN');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'));
  });

  test('points at an absolute 1200x630 image that ships with the static assets', () => {
    const image = meta('property', 'og:image');
    expect(image).toMatch(/^https:\/\/nongtraimongmo\.xyz\/social\/preview\.jpg$/);
    expect(meta('name', 'twitter:image')).toBe(image);
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:url')).toBe('https://nongtraimongmo.xyz/');
    // Vite serves ../image as the public directory.
    expect(existsSync(fileURLToPath(new URL('../../image/social/preview.jpg', import.meta.url)))).toBe(true);
  });

  test('keeps infrastructure terms out of the preview copy', () => {
    const head = page.slice(0, page.indexOf('</head>'));
    const copy = [...head.matchAll(/content="([^"]*)"/g)].map(match => match[1]).join(' ');
    expect(copy).not.toMatch(BANNED);
  });
});
