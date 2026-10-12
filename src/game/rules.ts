/**
 * Game modes, difficulty levels and the per-round rules they produce.
 */

export type Difficulty = "easy" | "normal" | "hard" | "expert";
export type ModeId = "classic" | "timed" | "generation" | "survival" | "daily" | "hardcore";
export type AutocompleteLevel = "full" | "reduced" | "off";
export type TimedSeconds = 30 | 60 | 120;

export const ALL_GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const TIMED_OPTIONS: TimedSeconds[] = [30, 60, 120];
export const GENERATION_CHALLENGE_ROUNDS = 10;
export const SURVIVAL_LIVES = 3;
export const HARDCORE_ROUND_SECONDS = 15;

export interface DifficultyRules {
  label: string;
  guesses: number;
  autocomplete: AutocompleteLevel;
  maxHints: number;
  roundSeconds: number | null;
  /** Expert always plays every generation. */
  allGenerations: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyRules> = {
  easy: { label: "Easy", guesses: 3, autocomplete: "full", maxHints: 5, roundSeconds: null, allGenerations: false },
  normal: { label: "Normal", guesses: 3, autocomplete: "full", maxHints: 3, roundSeconds: null, allGenerations: false },
  hard: { label: "Hard", guesses: 2, autocomplete: "reduced", maxHints: 1, roundSeconds: null, allGenerations: false },
  expert: { label: "Expert", guesses: 2, autocomplete: "off", maxHints: 0, roundSeconds: 20, allGenerations: true },
};

/** Generations a difficulty switches to when it is picked. */
export function defaultGenerationsFor(difficulty: Difficulty): number[] {
  return difficulty === "easy" ? [1] : [...ALL_GENERATIONS];
}

export interface RoundRules {
  guesses: number;
  autocomplete: AutocompleteLevel;
  maxHints: number;
  /** Per-round answer timer. */
  roundSeconds: number | null;
  strict: boolean;
  multiplier: number;
  streakBonus: boolean;
  /** Keep the reveal short and move on automatically (Timed). */
  quickReveal: boolean;
}

export interface RunConfig {
  mode: ModeId;
  difficulty: Difficulty;
  rules: RoundRules;
  /** Generations Pokémon are drawn from. */
  generations: number[];
  roundLimit: number | null;
  lives: number | null;
  timeLimitSeconds: number | null;
}

export interface ModeInfo {
  id: ModeId;
  name: string;
  /** Compact label for the in-game HUD. */
  short: string;
  blurb: string;
  usesDifficulty: boolean;
}

export const MODES: ModeInfo[] = [
  { id: "classic", short: "Classic", name: "Classic", blurb: "Guess as many as you like. Keep the streak alive.", usesDifficulty: true },
  { id: "timed", short: "Timed", name: "Timed Challenge", blurb: "Name as many as you can before the clock runs out.", usesDifficulty: true },
  { id: "generation", short: "Gen Challenge", name: "Generation Challenge", blurb: `${GENERATION_CHALLENGE_ROUNDS} Pokémon from the generations you pick.`, usesDifficulty: true },
  { id: "survival", short: "Survival", name: "Survival", blurb: `${SURVIVAL_LIVES} lives. Every wrong answer costs one.`, usesDifficulty: true },
  { id: "daily", short: "Daily", name: "Daily Pokémon", blurb: "One Pokémon a day, the same for everyone.", usesDifficulty: false },
  { id: "hardcore", short: "Hardcore", name: "Hardcore", blurb: "Exact spelling, no suggestions, no hints, two guesses.", usesDifficulty: false },
];

export function modeInfo(id: ModeId): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export interface RunOptions {
  mode: ModeId;
  difficulty: Difficulty;
  generations: number[];
  challengeGenerations: number[];
  timedSeconds: TimedSeconds;
  hardcoreTimer: boolean;
}

function sanitiseGenerations(gens: number[]): number[] {
  const valid = [...new Set(gens)].filter((g) => (ALL_GENERATIONS as readonly number[]).includes(g)).sort((a, b) => a - b);
  return valid.length ? valid : [...ALL_GENERATIONS];
}

export function buildRunConfig(options: RunOptions): RunConfig {
  const diff = DIFFICULTIES[options.difficulty];
  const fromDifficulty: RoundRules = {
    guesses: diff.guesses,
    autocomplete: diff.autocomplete,
    maxHints: diff.maxHints,
    roundSeconds: diff.roundSeconds,
    strict: false,
    multiplier: 1,
    streakBonus: true,
    quickReveal: false,
  };
  const playerGenerations = diff.allGenerations ? [...ALL_GENERATIONS] : sanitiseGenerations(options.generations);
  const base: RunConfig = {
    mode: options.mode,
    difficulty: options.difficulty,
    rules: fromDifficulty,
    generations: playerGenerations,
    roundLimit: null,
    lives: null,
    timeLimitSeconds: null,
  };

  switch (options.mode) {
    case "classic":
      return base;
    case "timed":
      // The run clock replaces any per-round timer.
      return {
        ...base,
        rules: { ...fromDifficulty, roundSeconds: null, quickReveal: true },
        timeLimitSeconds: options.timedSeconds,
      };
    case "generation":
      return {
        ...base,
        generations: diff.allGenerations ? [...ALL_GENERATIONS] : sanitiseGenerations(options.challengeGenerations),
        roundLimit: GENERATION_CHALLENGE_ROUNDS,
      };
    case "survival":
      // One answer per round: each wrong answer is a lost life.
      return { ...base, rules: { ...fromDifficulty, guesses: 1 }, lives: SURVIVAL_LIVES };
    case "daily":
      return {
        ...base,
        difficulty: "normal",
        rules: { guesses: 3, autocomplete: "full", maxHints: 3, roundSeconds: null, strict: false, multiplier: 1, streakBonus: false, quickReveal: false },
        generations: [...ALL_GENERATIONS],
        roundLimit: 1,
      };
    case "hardcore":
      return {
        ...base,
        difficulty: "expert",
        rules: {
          guesses: 2,
          autocomplete: "off",
          maxHints: 0,
          roundSeconds: options.hardcoreTimer ? HARDCORE_ROUND_SECONDS : null,
          strict: true,
          multiplier: 1.5,
          streakBonus: true,
          quickReveal: false,
        },
        generations: [...ALL_GENERATIONS],
      };
  }
}

export function autocompleteSettings(level: AutocompleteLevel): { minChars: number; limit: number } | null {
  if (level === "off") return null;
  return level === "full" ? { minChars: 2, limit: 6 } : { minChars: 4, limit: 3 };
}
