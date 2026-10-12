import { describe, expect, it } from "vitest";
import { completedOn, emptyDaily, liveStreak, recordDaily, sanitiseDaily, type DailyResult } from "./dailyRecord";
import { defaultSettings, sanitiseSettings } from "./settings";
import { emptyStats, recordRound, sanitiseStats, type RoundRecord } from "./stats";
import { load, save, type KeyValueStore } from "./storage";

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

const round = (over: Partial<RoundRecord> = {}): RoundRecord => ({
  key: "r1", pokemonId: 25, generation: 1, correct: true, guesses: 1, durationMs: 4200, ...over,
});

describe("stats", () => {
  it("records a round and survives a save/load round trip", () => {
    const store = new MemoryStore();
    const stats = recordRound(emptyStats(), round());
    save("s", stats, store);
    const loaded = load("s", sanitiseStats, emptyStats, store);
    expect(loaded.repaired).toBe(false);
    expect(loaded.value).toEqual(stats);
    expect(stats).toMatchObject({ roundsPlayed: 1, correct: 1, currentStreak: 1, fastestCorrectMs: 4200, discovered: [25] });
    expect(stats.byGeneration["1"]).toEqual({ played: 1, correct: 1 });
  });

  it("never counts the same round twice", () => {
    const once = recordRound(emptyStats(), round());
    expect(recordRound(once, round())).toBe(once);
  });

  it("resets the streak on a miss and keeps the best", () => {
    let s = recordRound(emptyStats(), round({ key: "a" }));
    s = recordRound(s, round({ key: "b", pokemonId: 1 }));
    s = recordRound(s, round({ key: "c", correct: false }));
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.incorrect).toBe(1);
    expect(s.discovered).toEqual([1, 25]);
  });

  it("repairs corrupted values field by field", () => {
    const { value, repaired } = sanitiseStats({
      roundsPlayed: 5, correct: "lots", incorrect: -3, discovered: [1, "x", 4, 4],
      byGeneration: { "1": { played: 2, correct: 9 }, bad: 1 }, fastestCorrectMs: "fast",
    });
    expect(repaired).toBe(true);
    expect(value.correct).toBe(0);
    expect(value.incorrect).toBe(0);
    expect(value.discovered).toEqual([1, 4]);
    expect(value.byGeneration).toEqual({ "1": { played: 2, correct: 2 } });
    expect(value.fastestCorrectMs).toBeNull();
  });
});

describe("storage", () => {
  it("falls back on invalid JSON and flags it", () => {
    const store = new MemoryStore();
    store.setItem("s", "{not json");
    const loaded = load("s", sanitiseStats, emptyStats, store);
    expect(loaded.repaired).toBe(true);
    expect(loaded.value).toEqual(emptyStats());
  });

  it("copes with storage that throws", () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => undefined,
    };
    expect(load("s", sanitiseStats, emptyStats, broken).value).toEqual(emptyStats());
    expect(save("s", {}, broken)).toBe(false);
  });
});

describe("settings", () => {
  it("keeps valid fields and replaces invalid ones", () => {
    const { value, repaired } = sanitiseSettings({ difficulty: "nightmare", volume: 7, generations: [2, 2, 12], sound: false });
    expect(repaired).toBe(true);
    expect(value.difficulty).toBe("normal");
    expect(value.volume).toBe(1);
    expect(value.generations).toEqual([2]);
    expect(value.sound).toBe(false);
  });

  it("returns defaults for non-objects", () => {
    expect(sanitiseSettings("hello").value).toEqual(defaultSettings());
  });
});

describe("daily record", () => {
  const result = (date: string, solved = true): DailyResult => ({ date, pokemonId: 1, solved, guesses: 1, hintsUsed: 0, points: 100 });

  it("builds a streak over consecutive days", () => {
    let r = recordDaily(emptyDaily(), result("2026-10-10"));
    r = recordDaily(r, result("2026-10-11"));
    expect(r.streak).toBe(2);
    r = recordDaily(r, result("2026-10-13")); // skipped a day
    expect(r.streak).toBe(1);
    expect(r.bestStreak).toBe(2);
  });

  it("can only be completed once per date", () => {
    const r = recordDaily(emptyDaily(), result("2026-10-12"));
    expect(recordDaily(r, result("2026-10-12", false))).toBe(r);
    expect(completedOn(r, "2026-10-12")?.solved).toBe(true);
    expect(completedOn(r, "2026-10-13")).toBeNull();
  });

  it("drops the live streak once a day is missed", () => {
    const r = recordDaily(emptyDaily(), result("2026-10-10"));
    expect(liveStreak(r, "2026-10-11")).toBe(1);
    expect(liveStreak(r, "2026-10-12")).toBe(0);
  });

  it("a failed daily breaks the streak", () => {
    let r = recordDaily(emptyDaily(), result("2026-10-10"));
    r = recordDaily(r, result("2026-10-11", false));
    expect(r.streak).toBe(0);
  });

  it("sanitises a corrupted record", () => {
    const { value, repaired } = sanitiseDaily({ last: { date: "yesterday" }, streak: 3, progress: { date: "2026-10-12", guesses: ["Mew", 4] } });
    expect(repaired).toBe(true);
    expect(value.last).toBeNull();
    expect(value.streak).toBe(3);
    expect(value.progress).toEqual({ date: "2026-10-12", guesses: ["Mew"], hintsUsed: 0 });
  });
});
