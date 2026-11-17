import { describe, expect, test } from 'vitest';
import type { WeeklyLeaderboard } from '../../shared/community.mts';
import { formatWeekRange, leaderboardSections, playerRank } from './leaderboard.ts';

const board: WeeklyLeaderboard = {
  weekStart: Date.UTC(2026, 10, 15, 17), // Monday 16 November 2026, 00:00 in Vietnam
  weekEnd: Date.UTC(2026, 10, 22, 17),
  generatedAt: Date.UTC(2026, 10, 18, 3),
  thieves: [{ username: 'ace', farms: 3, fruit: 3 }, { username: 'bob', farms: 1, fruit: 4 }],
  robbed: [{ username: 'host_a', thieves: 2, fruit: 5 }],
  guards: [{ username: 'host_a', pet: 'goose', blockedVisitors: 2, blocks: 3 }],
};

describe('leaderboard panel', () => {
  test('shows the week as Vietnamese dates, Monday to Sunday', () => {
    expect(formatWeekRange(board.weekStart, board.weekEnd)).toBe('16/11 – 22/11');
  });

  test('builds three ranked sections with Vietnamese detail lines', () => {
    const [thieves, robbed, guards] = leaderboardSections(board);
    expect(thieves.title).toBe('Trùm trộm rau');
    expect(thieves.rows).toEqual([
      { rank: 1, username: 'ace', detail: '3 vườn · 3 quả' },
      { rank: 2, username: 'bob', detail: '1 vườn · 4 quả' },
    ]);
    expect(robbed.rows[0]).toEqual({ rank: 1, username: 'host_a', detail: '2 người · mất 5 quả' });
    expect(guards.rows[0]).toEqual({ rank: 1, username: 'host_a', detail: 'Ngỗng · đuổi 2 người' });
    for (const section of [thieves, robbed, guards]) expect(section.empty.length).toBeGreaterThan(10);
  });

  test('finds the signed-in player in the thieves ranking', () => {
    expect(playerRank(board, 'bob')).toBe(2);
    expect(playerRank(board, 'nobody')).toBeUndefined();
    expect(playerRank(board, undefined)).toBeUndefined();
  });
});
