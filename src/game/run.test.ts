import { describe, expect, it } from "vitest";
import type { Pokemon } from "../data/types";
import { NameIndex } from "./names";
import { buildRunConfig, type RunOptions } from "./rules";
import { createRun, createRunReducer, isRunComplete, type RunAction, type RunState } from "./run";

function mon(id: number, name: string, generation = 1): Pokemon {
  return {
    id, name, slug: name.toLowerCase(), genus: null, generation, types: ["Normal"],
    stats: { hp: 1, attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1 },
    baseStatTotal: 6, heightM: null, weightKg: null, baseExperience: null, captureRate: null,
    baseHappiness: null, isBaby: false, isLegendary: false, isMythical: false,
    image: { path: `x/${id}.png`, width: 1, height: 1, hasAlpha: true },
  };
}

const roster = [mon(1, "Bulbasaur"), mon(25, "Pikachu"), mon(122, "Mr. Mime"), mon(250, "Ho-Oh", 2)];
const reducer = createRunReducer({
  byId: new Map(roster.map((p) => [p.id, p])),
  names: new NameIndex(roster.map((p) => p.name)),
});

const options: RunOptions = {
  mode: "classic", difficulty: "normal", generations: [1, 2], challengeGenerations: [1],
  timedSeconds: 30, hardcoreTimer: false,
};

function start(overrides: Partial<RunOptions> = {}, first = 25): RunState {
  const s = createRun("t", buildRunConfig({ ...options, ...overrides }), first, 0);
  return reducer(s, { type: "ROUND_READY", now: 1000 });
}

const play = (s: RunState, ...actions: RunAction[]) => actions.reduce(reducer, s);
const guess = (g: string, now = 2000): RunAction => ({ type: "SUBMIT", guess: g, now });

describe("classic round flow", () => {
  it("scores a correct first guess and reveals", () => {
    const s = play(start(), guess("pikachu", 3500));
    expect(s.phase).toBe("revealing");
    expect(s.score).toBe(100);
    expect(s.streak).toBe(1);
    expect(s.round.answeredMs).toBe(2500);
    expect(s.round.outcome).toBe("correct");
  });

  it("ignores repeated submissions after the round resolves", () => {
    const once = play(start(), guess("pikachu"));
    const again = play(once, guess("pikachu"), guess("pikachu"));
    expect(again).toBe(once);
    expect(again.history).toHaveLength(1);
  });

  it("does not consume a guess for empty, unknown or repeated names", () => {
    let s = play(start(), guess("   "));
    expect(s.feedback?.kind).toBe("empty");
    s = play(s, guess("Pikachoo"));
    expect(s.feedback?.kind).toBe("unknown");
    s = play(s, guess("Bulbasaur"));
    expect(s.feedback?.kind).toBe("wrong");
    s = play(s, guess("bulbasaur"));
    expect(s.feedback?.kind).toBe("repeat");
    expect(s.round.guesses).toEqual(["Bulbasaur"]);
  });

  it("awards fewer points on later attempts and ends after the last guess", () => {
    const second = play(start(), guess("Bulbasaur"), guess("Pikachu"));
    expect(second.score).toBe(70);
    const failed = play(start(), guess("Bulbasaur"), guess("Mr. Mime"), guess("Ho-Oh"));
    expect(failed.phase).toBe("revealing");
    expect(failed.round.outcome).toBe("wrong");
    expect(failed.missed).toBe(1);
    expect(failed.streak).toBe(0);
  });

  it("limits hints and charges for them", () => {
    let s = start({ difficulty: "hard" });
    s = play(s, { type: "HINT", available: 6 }, { type: "HINT", available: 6 });
    expect(s.round.hintsUsed).toBe(1);
    s = play(s, guess("pikachu"));
    expect(s.score).toBe(85);
  });

  it("only advances from the result phase", () => {
    let s = play(start(), { type: "NEXT", pokemonId: 1, now: 0 });
    expect(s.phase).toBe("guessing");
    s = play(s, guess("pikachu"), { type: "REVEAL_DONE" }, { type: "NEXT", pokemonId: 1, now: 0 });
    expect(s.phase).toBe("loading");
    expect(s.round.pokemonId).toBe(1);
    expect(s.round.index).toBe(1);
  });

  it("builds the streak across rounds with a bonus", () => {
    let s = play(start(), guess("pikachu"), { type: "REVEAL_DONE" }, { type: "NEXT", pokemonId: 1, now: 0 });
    s = play(s, { type: "ROUND_READY", now: 0 }, guess("bulbasaur"));
    expect(s.streak).toBe(2);
    expect(s.score).toBe(100 + 110);
  });

  it("can give up, which counts as a miss", () => {
    const s = play(start(), { type: "GIVE_UP", now: 0 });
    expect(s.round.outcome).toBe("gaveup");
    expect(s.missed).toBe(1);
  });

  it("replaces a round whose artwork failed without scoring", () => {
    const s = play(start(), { type: "REPLACE_ROUND", pokemonId: 1 });
    expect(s.phase).toBe("loading");
    expect(s.history).toHaveLength(0);
    expect(s.round.pokemonId).toBe(1);
  });
});

describe("modes", () => {
  it("survival loses a life per wrong answer and ends at zero", () => {
    let s = start({ mode: "survival" });
    expect(s.lives).toBe(3);
    for (let i = 0; i < 3; i++) {
      s = play(s, guess("Bulbasaur"));
      expect(s.phase).toBe("revealing"); // one answer per round
      s = play(s, { type: "REVEAL_DONE" });
      if (i < 2) s = play(s, { type: "NEXT", pokemonId: 25, now: 0 }, { type: "ROUND_READY", now: 0 });
    }
    expect(s.lives).toBe(0);
    expect(isRunComplete(s)).toBe(true);
    expect(play(s, { type: "NEXT", pokemonId: 1, now: 9 }).phase).toBe("over");
  });

  it("timed mode starts the clock on the first silhouette and stops on time up", () => {
    const s = start({ mode: "timed", timedSeconds: 30 });
    expect(s.endsAt).toBe(31000);
    const up = play(s, { type: "TIME_UP", now: 31000 });
    expect(up.round.outcome).toBe("timeup");
    expect(up.missed).toBe(0);
    expect(up.streak).toBe(s.streak);
    expect(isRunComplete(up)).toBe(true);
  });

  it("time up during a reveal finishes after the result", () => {
    let s = play(start({ mode: "timed" }), guess("pikachu"), { type: "TIME_UP", now: 99999 });
    expect(s.score).toBe(100);
    s = play(s, { type: "REVEAL_DONE" }, { type: "NEXT", pokemonId: 1, now: 0 });
    expect(s.phase).toBe("over");
  });

  it("generation challenge ends after its round limit", () => {
    let s = start({ mode: "generation", challengeGenerations: [1] });
    for (let i = 0; i < 10; i++) {
      s = play(s, guess("pikachu"), { type: "REVEAL_DONE" }, { type: "NEXT", pokemonId: 25, now: 0 });
      if (i < 9) s = play(s, { type: "ROUND_READY", now: 0 });
    }
    expect(s.phase).toBe("over");
    expect(s.correct).toBe(10);
  });

  it("hardcore uses strict spelling and every submission counts", () => {
    let s = start({ mode: "hardcore" }, 122);
    s = play(s, guess("mr mime"));
    expect(s.round.guesses).toHaveLength(1);
    expect(s.feedback?.kind).toBe("wrong");
    s = play(s, guess("Mr. Mime"));
    expect(s.round.outcome).toBe("correct");
    expect(s.score).toBe(105); // 70 × 1.5
  });

  it("hardcore never grants hints", () => {
    const s = play(start({ mode: "hardcore" }), { type: "HINT", available: 6 });
    expect(s.round.hintsUsed).toBe(0);
  });

  it("per-round timer expiry counts as a miss", () => {
    const s = play(start({ difficulty: "expert" }), { type: "ROUND_TIMEOUT", now: 50000 });
    expect(s.round.outcome).toBe("timeout");
    expect(s.missed).toBe(1);
  });

  it("daily resumes saved guesses so a reload can't reset them", () => {
    const config = buildRunConfig({ ...options, mode: "daily" });
    const s = createRun("d", config, 25, 0, { guesses: ["Bulbasaur", "Ho-Oh", "Mew"], hintsUsed: 9 });
    expect(s.round.guesses).toEqual(["Bulbasaur", "Ho-Oh"]); // always one guess left
    expect(s.round.hintsUsed).toBe(3);
  });
});
