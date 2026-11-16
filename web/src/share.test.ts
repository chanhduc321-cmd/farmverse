import { describe, expect, test, vi } from 'vitest';
import { farmShareUrl, sendShare, shareMessage } from './share.ts';

const BANNED = /near|blockchain|crypto|web3|wallet|token|\bví\b/i;

describe('farm share link', () => {
  test('points at the sharer\'s farm and tags the surface for attribution', () => {
    const url = new URL(farmShareUrl('https://nongtraimongmo.xyz', 'an_nguyen', 'steal'));
    expect(url.origin + url.pathname).toBe('https://nongtraimongmo.xyz/farm/an_nguyen');
    expect(url.searchParams.get('utm_source')).toBe('share');
    expect(url.searchParams.get('utm_medium')).toBe('player');
    expect(url.searchParams.get('utm_campaign')).toBe('steal');
  });
});

describe('share messages', () => {
  const cases = [
    shareMessage({ surface: 'farm' }),
    shareMessage({ surface: 'steal', host: 'bao99', cropName: 'Dâu tây' }),
    shareMessage({ surface: 'pet_block', host: 'bao99' }),
    shareMessage({ surface: 'journal', event: 'steal', visitor: 'chi_3', cropName: 'Ngô', amount: 1 }),
    shareMessage({ surface: 'journal', event: 'pet_block', visitor: 'chi_3' }),
    shareMessage({ surface: 'journal', event: 'visit', visitor: 'chi_3' }),
    shareMessage({ surface: 'leaderboard', rank: 2 }),
    shareMessage({ surface: 'leaderboard' }),
  ];

  test('are Vietnamese, name the people involved and avoid infrastructure terms', () => {
    expect(cases[1]).toContain('bao99');
    expect(cases[1]).toContain('dâu tây');
    expect(cases[2]).toContain('bao99');
    expect(cases[3]).toContain('chi_3');
    for (const text of cases) {
      expect(text).toMatch(/vườn/i);
      expect(text).not.toMatch(BANNED);
      expect(text.length).toBeLessThanOrEqual(200);
    }
  });

  test('are distinct per situation', () => {
    expect(new Set(cases).size).toBe(cases.length);
  });
});

describe('sendShare', () => {
  const payload = { title: 'Nông Trại Mộng Mơ', text: 'Vào vườn mình trộm thử xem!', url: 'https://nongtraimongmo.xyz/farm/an' };

  test('uses the native share sheet when the device has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    expect(await sendShare(payload, { share, clipboard: { writeText } })).toBe('shared');
    expect(share).toHaveBeenCalledWith(payload);
    expect(writeText).not.toHaveBeenCalled();
  });

  test('reports a dismissed share sheet as cancelled without copying', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('dismissed'), { name: 'AbortError' }));
    const writeText = vi.fn();
    expect(await sendShare(payload, { share, clipboard: { writeText } })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  test('copies text and link when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sendShare(payload, { clipboard: { writeText } })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`${payload.text} ${payload.url}`);
  });

  test('falls back to copying when the share sheet fails for another reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await sendShare(payload, { share, clipboard: { writeText } })).toBe('copied');
  });

  test('reports failure when neither sharing nor copying is possible', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    expect(await sendShare(payload, { clipboard: { writeText } })).toBe('failed');
    expect(await sendShare(payload, {})).toBe('failed');
  });
});
