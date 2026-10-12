/** Points for a correct answer on attempt 1, 2, 3+ (later attempts use the last value). */
export const ATTEMPT_POINTS = [100, 70, 40] as const;
export const HINT_PENALTY = 15;
export const MIN_CORRECT_POINTS = 10;
export const STREAK_BONUS_STEP = 10;
export const STREAK_BONUS_CAP = 50;

export interface ScoreInput {
  correct: boolean;
  /** 1-based attempt on which the round was answered. */
  attempt: number;
  hintsUsed: number;
  /** Streak before this round. */
  streakBefore: number;
  streakBonus: boolean;
  multiplier: number;
}

export interface ScoreBreakdown {
  base: number;
  hintPenalty: number;
  streakBonus: number;
  total: number;
}

const ZERO: ScoreBreakdown = { base: 0, hintPenalty: 0, streakBonus: 0, total: 0 };

export function attemptPoints(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), ATTEMPT_POINTS.length) - 1;
  return ATTEMPT_POINTS[index] ?? 0;
}

/** Bonus for the streak *including* this round: +10 for 2 in a row … capped at +50. */
export function streakBonusFor(streakAfter: number): number {
  return Math.min(STREAK_BONUS_CAP, Math.max(0, streakAfter - 1) * STREAK_BONUS_STEP);
}

export function scoreRound(input: ScoreInput): ScoreBreakdown {
  if (!input.correct) return ZERO;
  const raw = attemptPoints(input.attempt);
  const hintPenalty = Math.min(raw - MIN_CORRECT_POINTS, input.hintsUsed * HINT_PENALTY);
  const base = Math.round(raw * input.multiplier);
  const penalty = Math.round(hintPenalty * input.multiplier);
  const streakBonus = input.streakBonus ? streakBonusFor(input.streakBefore + 1) : 0;
  return { base, hintPenalty: penalty, streakBonus, total: base - penalty + streakBonus };
}
