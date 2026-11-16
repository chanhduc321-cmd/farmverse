import { describe, expect, test } from 'vitest';
import { attributionParams, captureAttribution, readAttribution } from './attribution.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('readAttribution', () => {
  test('reads campaign parameters and the farm a shared link points at', () => {
    expect(readAttribution('/farm/An_Nguyen', '?utm_source=Threads&utm_medium=social&utm_campaign=launch_w1')).toEqual({
      source: 'threads', medium: 'social', campaign: 'launch_w1', referrerFarm: 'an_nguyen',
    });
  });

  test('returns nothing for a plain visit', () => {
    expect(readAttribution('/', '')).toBeUndefined();
  });

  test('drops values that are not short campaign slugs', () => {
    expect(readAttribution('/', '?utm_source=<script>&utm_medium=social')).toEqual({ medium: 'social' });
    expect(readAttribution('/', `?utm_campaign=${'x'.repeat(80)}`)).toBeUndefined();
    expect(readAttribution('/farm/ab', '')).toBeUndefined();
  });
});

describe('captureAttribution', () => {
  test('keeps the first touch across later visits', () => {
    const storage = memoryStorage();
    const first = captureAttribution('/farm/bao99', '?utm_source=share&utm_medium=player&utm_campaign=steal', storage);
    const later = captureAttribution('/', '?utm_source=facebook_page', storage);
    expect(first).toEqual({ source: 'share', medium: 'player', campaign: 'steal', referrerFarm: 'bao99' });
    expect(later).toEqual(first);
  });

  test('records a later campaign when the first visit carried none', () => {
    const storage = memoryStorage();
    expect(captureAttribution('/', '', storage)).toBeUndefined();
    expect(captureAttribution('/', '?utm_source=threads', storage)).toEqual({ source: 'threads' });
  });

  test('ignores corrupted or tampered stored values', () => {
    const storage = memoryStorage();
    storage.setItem('farmverse-attribution', '{"source":"<b>","referrerFarm":"../x"}');
    expect(captureAttribution('/', '', storage)).toBeUndefined();
    storage.setItem('farmverse-attribution', 'not json');
    expect(captureAttribution('/', '?utm_source=threads', storage)).toEqual({ source: 'threads' });
  });

  test('still reports the current visit when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(captureAttribution('/', '?utm_source=threads', blocked)).toEqual({ source: 'threads' });
  });
});

describe('attributionParams', () => {
  test('never sends the referring username to analytics', () => {
    const params = attributionParams({ source: 'share', medium: 'player', campaign: 'steal', referrerFarm: 'bao99' });
    expect(params).toEqual({ utm_source: 'share', utm_medium: 'player', utm_campaign: 'steal', referred_by_player: true });
    expect(JSON.stringify(params)).not.toContain('bao99');
  });

  test('marks an unattributed visit explicitly', () => {
    expect(attributionParams(undefined)).toEqual({ utm_source: '(direct)', referred_by_player: false });
  });
});
