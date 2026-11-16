import { describe, expect, test } from 'vitest';
import { farmLinkPath, parseFarmLink } from '../../shared/community.mts';

describe('shared farm links', () => {
  test('builds a path that round-trips through the parser', () => {
    expect(farmLinkPath('an_nguyen')).toBe('/farm/an_nguyen');
    expect(parseFarmLink(farmLinkPath('an_nguyen'), '')).toBe('an_nguyen');
  });

  test('reads the owner from the path or the query fallback', () => {
    expect(parseFarmLink('/farm/An_Nguyen/', '')).toBe('an_nguyen');
    expect(parseFarmLink('/', '?farm=bao99&utm_source=threads')).toBe('bao99');
  });

  test('returns undefined when the address is not a farm link', () => {
    expect(parseFarmLink('/', '')).toBeUndefined();
    expect(parseFarmLink('/', '?utm_source=threads')).toBeUndefined();
  });

  test('returns null for a farm link that names an invalid player', () => {
    expect(parseFarmLink('/farm/', '')).toBeNull();
    expect(parseFarmLink('/farm/ab', '')).toBeNull();
    expect(parseFarmLink('/farm/a/b', '')).toBeNull();
    expect(parseFarmLink('/farm/%E0%A4%A', '')).toBeNull();
    expect(parseFarmLink('/', '?farm=<script>')).toBeNull();
  });
});
