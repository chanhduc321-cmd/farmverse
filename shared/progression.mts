import type { Farm, FarmAction } from './farm.mts';

export const firstMissionSteps = ['buy', 'plant', 'harvest', 'sell'] as const;
export const dailySaleTarget = 3;
export const missionGold = { first: 20, daily: 10 } as const;

type AttendanceReward =
  | { type: 'gold' | 'fertilizer'; amount: number }
  | { type: 'seed'; cropId: number; amount: number };

export const attendanceRewards: readonly AttendanceReward[] = [
  { type: 'gold', amount: 5 },
  { type: 'seed', cropId: 1, amount: 1 },
  { type: 'gold', amount: 5 },
  { type: 'fertilizer', amount: 1 },
  { type: 'gold', amount: 10 },
  { type: 'seed', cropId: 1, amount: 2 },
  { type: 'gold', amount: 20 },
];

export type MissionClaim = { mission: 'first' } | { mission: 'daily'; day: number };

interface DailyProgress {
  day: number;
  harvested: boolean;
  sold: number;
  claimed: boolean;
}

export interface FarmProgression {
  firstStep: number;
  firstClaimed: boolean;
  daily: DailyProgress;
  attendance?: { day: number; streak: number; rewardedSince?: number };
  pendingDays: number[];
}

export function missionDay(now: number): number {
  return Math.floor((now + 7 * 3_600_000) / 86_400_000);
}

function emptyDay(day: number): DailyProgress {
  return { day, harvested: false, sold: 0, claimed: false };
}

function complete(daily: DailyProgress): boolean {
  return daily.harvested && daily.sold >= dailySaleTarget;
}

function attendanceStatus(attendance: FarmProgression['attendance'], day: number) {
  const checkedIn = attendance?.day === day;
  const streak = attendance && attendance.day >= day - 1 ? attendance.streak : 0;
  const nextStreak = checkedIn ? streak : streak + 1;
  const todayIndex = (nextStreak - 1) % attendanceRewards.length;
  const attendanceDays = attendanceRewards.map((reward, index) => {
    const slotDay = day - todayIndex + index;
    let status: 'upcoming' | 'available' | 'claimed' | 'checked-in' = 'upcoming';
    if (slotDay === day && !checkedIn) status = 'available';
    else if (slotDay <= day) status = slotDay >= (attendance?.rewardedSince ?? Infinity) ? 'claimed' : 'checked-in';
    return { day: index + 1, reward, status };
  });
  return { streak, checkedIn, attendanceDays };
}

export function missionStatus(farm: Farm, now: number) {
  const day = missionDay(now);
  const progress = farm.progression;
  const daily = progress?.daily.day === day ? progress.daily : emptyDay(day);
  const rewardDay = progress?.pendingDays[0]
    ?? (progress && complete(progress.daily) && !progress.daily.claimed ? progress.daily.day : undefined);
  return {
    firstStep: progress?.firstStep ?? 0,
    firstClaimed: progress?.firstClaimed ?? false,
    daily,
    rewardDay,
    ...attendanceStatus(progress?.attendance, day),
  };
}

function ensureProgress(farm: Farm, day: number): FarmProgression {
  return farm.progression ??= { firstStep: 0, firstClaimed: false, daily: emptyDay(day), pendingDays: [] };
}

export function recordCheckIn(farm: Farm, now: number): AttendanceReward | undefined {
  const day = missionDay(now);
  const progress = ensureProgress(farm, day);
  const previous = progress.attendance;
  if (previous && previous.day >= day) return;
  const consecutive = previous?.day === day - 1;
  const streak = consecutive ? previous.streak + 1 : 1;
  const rewardedSince = consecutive ? previous.rewardedSince ?? day : day;
  progress.attendance = { day, streak, rewardedSince };
  return attendanceRewards[(streak - 1) % attendanceRewards.length];
}

export function recordMissionAction(farm: Farm, action: FarmAction, now: number): void {
  if (action.type !== 'buy' && action.type !== 'plant' && action.type !== 'harvest' && action.type !== 'sell') return;
  const day = missionDay(now);
  const progress = ensureProgress(farm, day);
  if (firstMissionSteps[progress.firstStep] === action.type) progress.firstStep++;
  if (action.type !== 'harvest' && action.type !== 'sell') return;

  if (progress.daily.day !== day) {
    if (complete(progress.daily) && !progress.daily.claimed) progress.pendingDays.push(progress.daily.day);
    progress.daily = emptyDay(day);
  }
  if (action.type === 'harvest') progress.daily.harvested = true;
  else if (action.type === 'sell') progress.daily.sold = Math.min(dailySaleTarget, progress.daily.sold + action.quantity);
}

export function claimMissionReward(farm: Farm, claim: MissionClaim): number | undefined {
  const progress = farm.progression;
  if (!progress) return;
  if (claim.mission === 'first') {
    if (progress.firstStep !== firstMissionSteps.length || progress.firstClaimed) return;
    progress.firstClaimed = true;
  } else if (claim.day === progress.daily.day) {
    if (!complete(progress.daily) || progress.daily.claimed) return;
    progress.daily.claimed = true;
  } else {
    const index = progress.pendingDays.indexOf(claim.day);
    if (index < 0) return;
    progress.pendingDays.splice(index, 1);
  }
  return missionGold[claim.mission];
}
