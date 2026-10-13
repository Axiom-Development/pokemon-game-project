import { describe, expect, it } from "vitest";
import { dailyPokemonId, dateKey, previousDateKey } from "./daily";
import { buildHints, letterCount, namePattern, revealedLetterCount } from "./hints";
import { Deck, mulberry32 } from "./random";
import { buildRunConfig, defaultGenerationsFor, type RunOptions } from "./rules";
import type { Pokemon } from "../data/types";

const options: RunOptions = {
  mode: "classic", difficulty: "normal", generations: [3], challengeGenerations: [1, 2],
  timedSeconds: 60, hardcoreTimer: true,
};

describe("difficulty", () => {
  it("easy defaults to generation 1", () => {
    expect(defaultGenerationsFor("easy")).toEqual([1]);
    expect(defaultGenerationsFor("hard")).toHaveLength(9);
  });

  it("changes guesses, hints, autocomplete and timers", () => {
    const easy = buildRunConfig({ ...options, difficulty: "easy" }).rules;
    const hard = buildRunConfig({ ...options, difficulty: "hard" }).rules;
    const expert = buildRunConfig({ ...options, difficulty: "expert" });
    expect(easy.maxHints).toBeGreaterThan(hard.maxHints);
    expect(hard.guesses).toBeLessThan(easy.guesses);
    expect(hard.autocomplete).toBe("reduced");
    expect(expert.rules.autocomplete).toBe("off");
    expect(expert.rules.maxHints).toBe(0);
    expect(expert.rules.roundSeconds).not.toBeNull();
    expect(expert.generations).toHaveLength(9); // overrides the player's choice
  });

  it("uses the player's generations otherwise, falling back to all if empty", () => {
    expect(buildRunConfig(options).generations).toEqual([3]);
    expect(buildRunConfig({ ...options, generations: [] }).generations).toHaveLength(9);
  });
});

describe("modes", () => {
  it("configures each mode", () => {
    expect(buildRunConfig({ ...options, mode: "timed" }).timeLimitSeconds).toBe(60);
    expect(buildRunConfig({ ...options, mode: "generation" }).generations).toEqual([1, 2]);
    expect(buildRunConfig({ ...options, mode: "generation" }).roundLimit).toBe(10);
    expect(buildRunConfig({ ...options, mode: "survival" }).lives).toBe(3);
    const daily = buildRunConfig({ ...options, mode: "daily", difficulty: "expert" });
    expect(daily.rules.autocomplete).toBe("full"); // same rules for everyone
    expect(daily.roundLimit).toBe(1);
    const hardcore = buildRunConfig({ ...options, mode: "hardcore" });
    expect(hardcore.rules).toMatchObject({ autocomplete: "off", maxHints: 0, strict: true, guesses: 2, roundSeconds: 15 });
    expect(buildRunConfig({ ...options, mode: "hardcore", hardcoreTimer: false }).rules.roundSeconds).toBeNull();
  });
});

describe("daily selection", () => {
  const ids = Array.from({ length: 1025 }, (_, i) => i + 1);

  it("is deterministic per date", () => {
    expect(dailyPokemonId("2026-10-12", ids)).toBe(dailyPokemonId("2026-10-12", [...ids]));
  });

  it("varies across dates", () => {
    const picks = new Set<number>();
    let key = "2026-12-31";
    for (let i = 0; i < 60; i++) {
      picks.add(dailyPokemonId(key, ids));
      key = previousDateKey(key);
    }
    expect(picks.size).toBeGreaterThan(50);
  });

  it("formats and steps local dates across month and year boundaries", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(previousDateKey("2026-03-01")).toBe("2026-02-28");
    expect(previousDateKey("2026-01-01")).toBe("2025-12-31");
  });
});

describe("deck", () => {
  it("shows every Pokémon once before repeating", () => {
    const deck = new Deck([1, 2, 3, 4, 5], mulberry32(7));
    const first = Array.from({ length: 5 }, () => deck.draw());
    expect([...first].sort()).toEqual([1, 2, 3, 4, 5]);
    const second = deck.draw();
    expect(second).not.toBe(first[4]);
  });
});

describe("hints", () => {
  const p = {
    id: 25, name: "Pikachu", generation: 1, types: ["Electric"], heightM: 0.4, weightKg: 6,
    genus: "Mouse Pokémon",
  } as Pokemon;

  it("go from vague to specific without naming the Pokémon", () => {
    const hints = buildHints(p, 1025);
    expect(hints.map((h) => h.label)).toEqual(["Generation", "Type", "Second type", "Pokédex", "Size", "Category"]);
    expect(hints.find((h) => h.label === "Pokédex")!.value).toBe("Between #0001 and #0050");
    for (const h of hints) expect(h.value.toLowerCase()).not.toContain("pikachu");
  });

  it("skips data that is missing", () => {
    const hints = buildHints({ ...p, heightM: null, weightKg: null, genus: null }, 1025);
    expect(hints.map((h) => h.label)).not.toContain("Size");
    expect(hints.map((h) => h.label)).not.toContain("Category");
  });
});

describe("letter hints", () => {
  const shown = (name: string, hints: number) =>
    namePattern(name, revealedLetterCount(name, hints)).map((c) => (c.letter ? c.char || "_" : c.char)).join("");

  it("reveal one letter per hint, at most three", () => {
    expect(shown("Pikachu", 1)).toBe("P______");
    expect(shown("Pikachu", 2)).toBe("Pi_____");
    expect(shown("Pikachu", 3)).toBe("Pik____");
    expect(shown("Pikachu", 5)).toBe("Pik____");
  });

  it("never give away a short name", () => {
    expect(revealedLetterCount("Mew", 3)).toBe(1);
    expect(revealedLetterCount("Abra", 3)).toBe(2);
    expect(revealedLetterCount("Mew", 0)).toBe(0);
  });

  it("keep spaces and punctuation visible and hide gender symbols", () => {
    expect(shown("Mr. Mime", 3)).toBe("Mr. M___");
    expect(shown("Type: Null", 1)).toBe("T___: ____");
    expect(shown("Nidoran♀", 3)).toBe("Nid_____");
    expect(letterCount("Nidoran♀")).toBe(8);
  });
});
