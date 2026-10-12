import { FieldReader, isRecord, load, save } from "./storage";

export const STATS_KEY = "wtp.stats.v1";
const MAX_DEX = 100000;

export interface GenerationTally {
  played: number;
  correct: number;
}

export interface Stats {
  roundsPlayed: number;
  correct: number;
  incorrect: number;
  guessesSubmitted: number;
  currentStreak: number;
  bestStreak: number;
  fastestCorrectMs: number | null;
  playtimeMs: number;
  byGeneration: Record<string, GenerationTally>;
  /** Pokédex numbers identified correctly at least once. */
  discovered: number[];
  /** Most recent round keys already recorded — guards against double counting. */
  recentRounds: string[];
}

export function emptyStats(): Stats {
  return {
    roundsPlayed: 0,
    correct: 0,
    incorrect: 0,
    guessesSubmitted: 0,
    currentStreak: 0,
    bestStreak: 0,
    fastestCorrectMs: null,
    playtimeMs: 0,
    byGeneration: {},
    discovered: [],
    recentRounds: [],
  };
}

export interface RoundRecord {
  key: string;
  pokemonId: number;
  generation: number;
  correct: boolean;
  guesses: number;
  durationMs: number | null;
}

const RECENT_LIMIT = 50;

/** Pure: returns new stats with the round applied (or the same object if already recorded). */
export function recordRound(stats: Stats, round: RoundRecord): Stats {
  if (stats.recentRounds.includes(round.key)) return stats;
  const gen = String(round.generation);
  const tally = stats.byGeneration[gen] ?? { played: 0, correct: 0 };
  const streak = round.correct ? stats.currentStreak + 1 : 0;
  const duration = round.durationMs ?? 0;
  return {
    roundsPlayed: stats.roundsPlayed + 1,
    correct: stats.correct + (round.correct ? 1 : 0),
    incorrect: stats.incorrect + (round.correct ? 0 : 1),
    guessesSubmitted: stats.guessesSubmitted + round.guesses,
    currentStreak: streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    fastestCorrectMs:
      round.correct && round.durationMs !== null
        ? Math.min(stats.fastestCorrectMs ?? Infinity, round.durationMs)
        : stats.fastestCorrectMs,
    playtimeMs: stats.playtimeMs + duration,
    byGeneration: {
      ...stats.byGeneration,
      [gen]: { played: tally.played + 1, correct: tally.correct + (round.correct ? 1 : 0) },
    },
    discovered:
      round.correct && !stats.discovered.includes(round.pokemonId)
        ? [...stats.discovered, round.pokemonId].sort((a, b) => a - b)
        : stats.discovered,
    recentRounds: [...stats.recentRounds, round.key].slice(-RECENT_LIMIT),
  };
}

export function accuracy(correct: number, played: number): number | null {
  return played === 0 ? null : correct / played;
}

export function sanitiseStats(raw: unknown): { value: Stats; repaired: boolean } {
  if (!isRecord(raw)) return { value: emptyStats(), repaired: true };
  const r = new FieldReader(raw);
  const byGeneration: Record<string, GenerationTally> = {};
  for (const [gen, tally] of Object.entries(r.record("byGeneration"))) {
    if (!/^\d+$/.test(gen) || !isRecord(tally)) {
      r.repaired = true;
      continue;
    }
    const t = new FieldReader(tally);
    const played = t.count("played");
    const correct = Math.min(t.count("correct"), played);
    if (t.repaired) r.repaired = true;
    byGeneration[gen] = { played, correct };
  }
  const roundsPlayed = r.count("roundsPlayed");
  const recent = Array.isArray(raw.recentRounds)
    ? raw.recentRounds.filter((k): k is string => typeof k === "string").slice(-RECENT_LIMIT)
    : [];
  const value: Stats = {
    roundsPlayed,
    correct: Math.min(r.count("correct"), roundsPlayed),
    incorrect: Math.min(r.count("incorrect"), roundsPlayed),
    guessesSubmitted: r.count("guessesSubmitted"),
    currentStreak: r.count("currentStreak"),
    bestStreak: r.count("bestStreak"),
    fastestCorrectMs: r.nullableCount("fastestCorrectMs"),
    playtimeMs: r.count("playtimeMs"),
    byGeneration,
    discovered: r.intList("discovered", 1, MAX_DEX, []),
    recentRounds: recent,
  };
  value.bestStreak = Math.max(value.bestStreak, value.currentStreak);
  return { value, repaired: r.repaired };
}

export const loadStats = () => load(STATS_KEY, sanitiseStats, emptyStats);
export const saveStats = (stats: Stats) => save(STATS_KEY, stats);
