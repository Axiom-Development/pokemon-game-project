import { previousDateKey } from "../game/daily";
import { FieldReader, isRecord, load, save } from "./storage";

export const DAILY_KEY = "wtp.daily.v1";

export interface DailyResult {
  date: string;
  pokemonId: number;
  solved: boolean;
  guesses: number;
  hintsUsed: number;
  points: number;
}

export interface DailyRecord {
  last: DailyResult | null;
  streak: number;
  bestStreak: number;
  /** Last date the daily was solved (for streak continuity). */
  lastSolved: string | null;
  played: number;
  solved: number;
  /** Guesses and hints of an unfinished daily, so reloading can't reset it. */
  progress: DailyProgress | null;
}

export interface DailyProgress {
  date: string;
  guesses: string[];
  hintsUsed: number;
}

export function emptyDaily(): DailyRecord {
  return { last: null, streak: 0, bestStreak: 0, lastSolved: null, played: 0, solved: 0, progress: null };
}

export function progressOn(record: DailyRecord, date: string): DailyProgress | null {
  return record.progress?.date === date ? record.progress : null;
}

export function completedOn(record: DailyRecord, date: string): DailyResult | null {
  return record.last?.date === date ? record.last : null;
}

/** Streak still alive today? (solved yesterday or today) */
export function liveStreak(record: DailyRecord, today: string): number {
  if (!record.lastSolved) return 0;
  return record.lastSolved === today || record.lastSolved === previousDateKey(today) ? record.streak : 0;
}

/** Pure. A date can only be recorded once. */
export function recordDaily(record: DailyRecord, result: DailyResult): DailyRecord {
  if (completedOn(record, result.date)) return record;
  const continues = record.lastSolved === previousDateKey(result.date);
  const streak = result.solved ? (continues ? record.streak + 1 : 1) : 0;
  return {
    last: result,
    streak,
    bestStreak: Math.max(record.bestStreak, streak),
    lastSolved: result.solved ? result.date : record.lastSolved,
    played: record.played + 1,
    solved: record.solved + (result.solved ? 1 : 0),
    progress: null,
  };
}

export function sanitiseDaily(raw: unknown): { value: DailyRecord; repaired: boolean } {
  if (!isRecord(raw)) return { value: emptyDaily(), repaired: true };
  const r = new FieldReader(raw);
  let last: DailyResult | null = null;
  if (isRecord(raw.last)) {
    const l = new FieldReader(raw.last);
    const date = l.dateKey("date");
    const pokemonId = l.count("pokemonId");
    if (date && pokemonId > 0) {
      last = {
        date,
        pokemonId,
        solved: l.oneOf("solved", [true, false], false),
        guesses: l.count("guesses"),
        hintsUsed: l.count("hintsUsed"),
        points: l.count("points"),
      };
    }
    if (l.repaired || !last) r.repaired = true;
  } else if (raw.last !== null && raw.last !== undefined) {
    r.repaired = true;
  }
  let progress: DailyProgress | null = null;
  if (isRecord(raw.progress)) {
    const p = new FieldReader(raw.progress);
    const date = p.dateKey("date");
    const guesses = Array.isArray(raw.progress.guesses)
      ? raw.progress.guesses.filter((g): g is string => typeof g === "string").slice(0, 10)
      : [];
    if (date) progress = { date, guesses, hintsUsed: p.count("hintsUsed") };
    else r.repaired = true;
  }
  const played = r.count("played");
  const value: DailyRecord = {
    last,
    streak: r.count("streak"),
    bestStreak: r.count("bestStreak"),
    lastSolved: r.dateKey("lastSolved"),
    played,
    solved: Math.min(r.count("solved"), played),
    progress,
  };
  value.bestStreak = Math.max(value.bestStreak, value.streak);
  return { value, repaired: r.repaired };
}

export const loadDaily = () => load(DAILY_KEY, sanitiseDaily, emptyDaily);
export const saveDaily = (record: DailyRecord) => save(DAILY_KEY, record);
