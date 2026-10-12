/**
 * Run state machine. Pure and deterministic: time is passed in with actions.
 *
 *   loading ──ROUND_READY──▶ guessing ──(correct | out of guesses | give up | timeout)──▶ revealing
 *   revealing ──REVEAL_DONE──▶ result ──NEXT──▶ loading … or over
 *
 * Each phase only accepts its own actions, so repeated clicks or key presses
 * can never score a round twice.
 */
import type { Pokemon } from "../data/types";
import { isCorrectGuess, looseKey, NameIndex, strictKey } from "./names";
import type { RunConfig } from "./rules";
import { scoreRound, type ScoreBreakdown } from "./scoring";

export type Phase = "loading" | "guessing" | "revealing" | "result" | "over";
/** "timeup" = the Timed run clock ran out mid-round (not counted as a miss). */
export type Outcome = "correct" | "wrong" | "timeout" | "gaveup" | "timeup";

export interface RoundState {
  key: string;
  index: number;
  pokemonId: number;
  guesses: string[];
  hintsUsed: number;
  startedAt: number | null;
  outcome: Outcome | null;
  score: ScoreBreakdown | null;
  answeredMs: number | null;
}

export interface Feedback {
  kind: "empty" | "unknown" | "repeat" | "wrong";
  message: string;
}

export interface HistoryEntry {
  pokemonId: number;
  outcome: Outcome;
  points: number;
}

export interface RunState {
  runId: string;
  config: RunConfig;
  phase: Phase;
  round: RoundState;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  missed: number;
  lives: number | null;
  history: HistoryEntry[];
  startedAt: number;
  endsAt: number | null;
  timeUp: boolean;
  endedAt: number | null;
  feedback: Feedback | null;
}

export type RunAction =
  | { type: "ROUND_READY"; now: number }
  | { type: "SUBMIT"; guess: string; now: number }
  | { type: "HINT"; available: number }
  | { type: "GIVE_UP"; now: number }
  | { type: "ROUND_TIMEOUT"; now: number }
  | { type: "TIME_UP"; now: number }
  | { type: "REVEAL_DONE" }
  | { type: "NEXT"; pokemonId: number; now: number }
  | { type: "REPLACE_ROUND"; pokemonId: number }
  | { type: "END"; now: number };

export interface RunContext {
  byId: ReadonlyMap<number, Pokemon>;
  names: NameIndex;
}

function newRound(runId: string, index: number, pokemonId: number): RoundState {
  return {
    key: `${runId}:${index}`,
    index,
    pokemonId,
    guesses: [],
    hintsUsed: 0,
    startedAt: null,
    outcome: null,
    score: null,
    answeredMs: null,
  };
}

export function createRun(
  runId: string,
  config: RunConfig,
  firstPokemonId: number,
  now: number,
  /** Restores an unfinished round (Daily), so a reload can't reset guesses. */
  resume?: { guesses: string[]; hintsUsed: number },
): RunState {
  const round = newRound(runId, 0, firstPokemonId);
  if (resume) {
    round.guesses = resume.guesses.slice(0, Math.max(0, config.rules.guesses - 1));
    round.hintsUsed = Math.min(resume.hintsUsed, config.rules.maxHints);
  }
  return {
    runId,
    config,
    phase: "loading",
    round,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    missed: 0,
    lives: config.lives,
    history: [],
    startedAt: now,
    endsAt: null,
    timeUp: false,
    endedAt: null,
    feedback: null,
  };
}

export function isRunComplete(state: RunState): boolean {
  const { config } = state;
  return (
    state.timeUp ||
    (state.lives !== null && state.lives <= 0) ||
    (config.roundLimit !== null && state.history.length >= config.roundLimit)
  );
}

export function guessesLeft(state: RunState): number {
  return Math.max(0, state.config.rules.guesses - state.round.guesses.length);
}

function resolve(state: RunState, outcome: Outcome, now: number): RunState {
  const { round, config } = state;
  const correct = outcome === "correct";
  const counted = outcome !== "timeup";
  const score = scoreRound({
    correct,
    attempt: round.guesses.length,
    hintsUsed: round.hintsUsed,
    streakBefore: state.streak,
    streakBonus: config.rules.streakBonus,
    multiplier: config.rules.multiplier,
  });
  const streak = correct ? state.streak + 1 : counted ? 0 : state.streak;
  return {
    ...state,
    phase: "revealing",
    feedback: null,
    score: state.score + score.total,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correct: state.correct + (correct ? 1 : 0),
    missed: state.missed + (counted && !correct ? 1 : 0),
    lives: state.lives !== null && counted && !correct ? state.lives - 1 : state.lives,
    timeUp: state.timeUp || outcome === "timeup",
    round: {
      ...round,
      outcome,
      score,
      answeredMs: round.startedAt === null ? null : Math.max(0, now - round.startedAt),
    },
    history: [...state.history, { pokemonId: round.pokemonId, outcome, points: score.total }],
  };
}

export function createRunReducer(ctx: RunContext) {
  return function runReducer(state: RunState, action: RunAction): RunState {
    switch (action.type) {
      case "ROUND_READY": {
        if (state.phase !== "loading") return state;
        const limit = state.config.timeLimitSeconds;
        return {
          ...state,
          phase: "guessing",
          round: { ...state.round, startedAt: action.now },
          // The Timed clock starts when the first silhouette is on screen.
          endsAt: state.endsAt ?? (limit ? action.now + limit * 1000 : null),
        };
      }

      case "SUBMIT": {
        if (state.phase !== "guessing") return state;
        const guess = action.guess.trim();
        const { rules } = state.config;
        if (!guess) return { ...state, feedback: { kind: "empty", message: "Type a name first." } };

        const target = ctx.byId.get(state.round.pokemonId);
        if (!target) return state;
        const toKey = rules.strict ? strictKey : looseKey;
        if (state.round.guesses.some((g) => toKey(g) === toKey(guess))) {
          return { ...state, feedback: { kind: "repeat", message: "You already tried that one." } };
        }
        const correct = isCorrectGuess(guess, target.name, rules.strict);
        // Outside strict mode a misspelled name doesn't cost a guess.
        if (!correct && !rules.strict && !ctx.names.isKnown(guess)) {
          return { ...state, feedback: { kind: "unknown", message: "No Pokémon goes by that name. Check the spelling?" } };
        }
        const withGuess: RunState = {
          ...state,
          round: { ...state.round, guesses: [...state.round.guesses, guess] },
        };
        if (correct) return resolve(withGuess, "correct", action.now);
        const left = guessesLeft(withGuess);
        if (left === 0) return resolve(withGuess, "wrong", action.now);
        return {
          ...withGuess,
          feedback: { kind: "wrong", message: `Not quite! ${left} ${left === 1 ? "guess" : "guesses"} left.` },
        };
      }

      case "HINT": {
        if (state.phase !== "guessing") return state;
        const allowed = Math.min(state.config.rules.maxHints, action.available);
        if (state.round.hintsUsed >= allowed) return state;
        return { ...state, round: { ...state.round, hintsUsed: state.round.hintsUsed + 1 } };
      }

      case "GIVE_UP":
        return state.phase === "guessing" ? resolve(state, "gaveup", action.now) : state;

      case "ROUND_TIMEOUT":
        return state.phase === "guessing" ? resolve(state, "timeout", action.now) : state;

      case "TIME_UP":
        if (state.timeUp || state.phase === "over") return state;
        if (state.phase === "guessing" || state.phase === "loading") return resolve(state, "timeup", action.now);
        return { ...state, timeUp: true };

      case "REVEAL_DONE":
        return state.phase === "revealing" ? { ...state, phase: "result" } : state;

      case "NEXT": {
        if (state.phase !== "result") return state;
        if (isRunComplete(state)) return { ...state, phase: "over", endedAt: action.now };
        return {
          ...state,
          phase: "loading",
          feedback: null,
          round: newRound(state.runId, state.round.index + 1, action.pokemonId),
        };
      }

      case "REPLACE_ROUND": {
        // Artwork failed to load: swap the Pokémon without scoring anything.
        if (state.phase !== "loading" && state.phase !== "guessing") return state;
        return {
          ...state,
          phase: "loading",
          feedback: null,
          round: { ...newRound(state.runId, state.round.index, action.pokemonId), key: `${state.round.key}r` },
        };
      }

      case "END":
        if (state.phase === "over") return state;
        return { ...state, phase: "over", endedAt: action.now };
    }
  };
}
