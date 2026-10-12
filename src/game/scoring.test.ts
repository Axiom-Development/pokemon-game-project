import { describe, expect, it } from "vitest";
import { scoreRound, streakBonusFor } from "./scoring";

const base = { correct: true, attempt: 1, hintsUsed: 0, streakBefore: 0, streakBonus: true, multiplier: 1 };

describe("scoreRound", () => {
  it("awards 100 / 70 / 40 by attempt", () => {
    expect(scoreRound({ ...base, attempt: 1 }).total).toBe(100);
    expect(scoreRound({ ...base, attempt: 2 }).total).toBe(70);
    expect(scoreRound({ ...base, attempt: 3 }).total).toBe(40);
    expect(scoreRound({ ...base, attempt: 4 }).total).toBe(40);
  });

  it("scores nothing for a wrong answer", () => {
    expect(scoreRound({ ...base, correct: false, streakBefore: 9 }).total).toBe(0);
  });

  it("deducts 15 per hint but never below 10", () => {
    expect(scoreRound({ ...base, hintsUsed: 2 }).total).toBe(70);
    expect(scoreRound({ ...base, attempt: 3, hintsUsed: 5 }).total).toBe(10);
  });

  it("adds a capped streak bonus", () => {
    expect(streakBonusFor(1)).toBe(0);
    expect(streakBonusFor(2)).toBe(10);
    expect(streakBonusFor(6)).toBe(50);
    expect(streakBonusFor(40)).toBe(50);
    expect(scoreRound({ ...base, streakBefore: 2 }).total).toBe(120);
    expect(scoreRound({ ...base, streakBefore: 2, streakBonus: false }).total).toBe(100);
  });

  it("keeps the breakdown consistent with the total under a multiplier", () => {
    const s = scoreRound({ ...base, attempt: 2, hintsUsed: 1, multiplier: 1.5, streakBefore: 1 });
    expect(s.total).toBe(s.base - s.hintPenalty + s.streakBonus);
    expect(s.base).toBe(105);
  });

  it("is deterministic", () => {
    expect(scoreRound(base)).toEqual(scoreRound(base));
  });
});
