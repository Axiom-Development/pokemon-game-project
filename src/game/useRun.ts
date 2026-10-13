import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { preloadArtwork } from "../assets/preload";
import { sfx } from "../audio/sfx";
import type { Pokemon } from "../data/types";
import { useNow } from "../hooks/useNow";
import type { DailyProgress, DailyResult } from "../persistence/dailyRecord";
import type { RoundRecord } from "../persistence/stats";
import { dailyPokemonId } from "./daily";
import type { GameData } from "./GameData";
import { buildHints } from "./hints";
import { Deck } from "./random";
import { buildRunConfig, type RunOptions } from "./rules";
import { createRun, createRunReducer, isRunComplete, type RunAction, type RunState } from "./run";

export type RevealStep = "hold" | "flash" | "named" | "done";

export interface RunRequest {
  /** Changes whenever a new run should start. */
  id: number;
  options: RunOptions;
  /** Today's key for the Daily mode. */
  today: string;
  dailyResume: DailyProgress | null;
}

export interface RunCallbacks {
  onRound(record: RoundRecord): void;
  onDaily(result: DailyResult): void;
  onDailyProgress(progress: DailyProgress): void;
}

/** Reveal timeline in ms: silhouette hold → flash → name. */
const TIMELINE = { hold: 520, flash: 260, named: 900 };
const QUICK_TIMELINE = { hold: 160, flash: 200, named: 650 };
const TIMED_ADVANCE_MS = 750;
const STREAK_MILESTONE = 5;

export function useRun(data: GameData, request: RunRequest, callbacks: RunCallbacks, reducedMotion: boolean) {
  const reducer = useMemo(() => createRunReducer({ byId: data.byId, names: data.names }), [data]);

  const setup = useMemo(() => {
    const config = buildRunConfig(request.options);
    if (config.mode === "daily") {
      return { config, deck: null, first: dailyPokemonId(request.today, data.ids) };
    }
    const pool = data.pokemon.filter((p) => config.generations.includes(p.generation)).map((p) => p.id);
    const deck = new Deck(pool.length ? pool : data.ids);
    return { config, deck, first: deck.draw() };
  }, [data, request]);

  const [state, rawDispatch] = useReducer(reducer, undefined, () =>
    createRun(`run${request.id}`, setup.config, setup.first, Date.now(),
      setup.config.mode === "daily" ? request.dailyResume ?? undefined : undefined),
  );

  // The Play screen is keyed by request.id, so a new run remounts this hook.
  const stateRef = useRef<RunState>(state);
  stateRef.current = state;

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  /**
   * Progress is saved at the moment an action happens, not in an effect after
   * the next paint — otherwise a reload in that gap could lose a daily guess
   * (and let it be retried) or drop a finished round from the stats.
   */
  const persist = useCallback(
    (prev: RunState, next: RunState) => {
      const r = next.round;
      const cb = callbacksRef.current;
      const daily = next.config.mode === "daily";
      if (r.outcome && !prev.round.outcome) {
        if (r.outcome !== "timeup") {
          cb.onRound({
            key: r.key,
            pokemonId: r.pokemonId,
            generation: data.byId.get(r.pokemonId)?.generation ?? 0,
            correct: r.outcome === "correct",
            guesses: r.guesses.length,
            durationMs: r.answeredMs,
          });
        }
        if (daily) {
          cb.onDaily({
            date: request.today,
            pokemonId: r.pokemonId,
            solved: r.outcome === "correct",
            guesses: r.guesses.length,
            hintsUsed: r.hintsUsed,
            points: r.score?.total ?? 0,
          });
        }
      } else if (daily && !r.outcome && (r.guesses !== prev.round.guesses || r.hintsUsed !== prev.round.hintsUsed)) {
        cb.onDailyProgress({ date: request.today, guesses: r.guesses, hintsUsed: r.hintsUsed });
      }
    },
    [data, request.today],
  );

  const dispatch = useCallback(
    (action: RunAction) => {
      const prev = stateRef.current;
      const next = reducer(prev, action); // pure: identical to what useReducer will compute
      if (next !== prev) {
        stateRef.current = next;
        persist(prev, next);
      }
      rawDispatch(action);
    },
    [reducer, persist],
  );

  const pokemon: Pokemon = data.byId.get(state.round.pokemonId)!;
  const hints = useMemo(() => buildHints(pokemon, data.maxId), [pokemon, data.maxId]);

  // ---- Next Pokémon is chosen in advance so its artwork can preload.
  const nextId = useRef<number | null>(null);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setImageError(false);
    preloadArtwork(pokemon.image.path).then(
      () => !cancelled && dispatch({ type: "ROUND_READY", now: Date.now() }),
      () => !cancelled && setImageError(true),
    );
    if (setup.deck) {
      nextId.current = setup.deck.draw();
      const next = data.byId.get(nextId.current);
      if (next) preloadArtwork(next.image.path).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [state.round.key, pokemon, setup, data]);

  const drawNext = useCallback((): number => {
    const id = nextId.current ?? setup.deck?.draw() ?? state.round.pokemonId;
    nextId.current = null;
    return id;
  }, [setup, state.round.pokemonId]);

  // ---- Clocks
  const { config } = state;
  const running = state.phase !== "over";
  const now = useNow(running && (config.timeLimitSeconds !== null || config.rules.roundSeconds !== null), 100);
  const timeLeftMs = state.endsAt === null ? null : Math.max(0, state.endsAt - now);
  const roundDeadline =
    config.rules.roundSeconds !== null && state.round.startedAt !== null
      ? state.round.startedAt + config.rules.roundSeconds * 1000
      : null;
  const roundTimeLeftMs = roundDeadline === null ? null : Math.max(0, roundDeadline - now);

  useEffect(() => {
    if (state.endsAt !== null && now >= state.endsAt) dispatch({ type: "TIME_UP", now });
  }, [now, state.endsAt]);
  useEffect(() => {
    if (state.phase === "guessing" && roundDeadline !== null && now >= roundDeadline) {
      dispatch({ type: "ROUND_TIMEOUT", now });
    }
  }, [now, roundDeadline, state.phase]);

  // Countdown ticks for the last few seconds.
  const lastTick = useRef<number | null>(null);
  const secondsLeft = (timeLeftMs ?? roundTimeLeftMs) === null ? null : Math.ceil((timeLeftMs ?? roundTimeLeftMs)! / 1000);
  useEffect(() => {
    if (state.phase !== "guessing" || secondsLeft === null || secondsLeft > 5 || secondsLeft <= 0) return;
    if (lastTick.current !== secondsLeft) {
      lastTick.current = secondsLeft;
      sfx.play("tick");
    }
  }, [secondsLeft, state.phase]);

  // ---- Reveal timeline
  // Keyed by round so a new reveal never starts from a stale "done" frame.
  const [reveal, setReveal] = useState<{ key: string; step: RevealStep }>({ key: "", step: "hold" });
  const roundKey = state.round.key;
  const revealStep: RevealStep =
    reveal.key === roundKey ? reveal.step : reducedMotion ? "named" : "hold";
  useEffect(() => {
    if (state.phase !== "revealing") return;
    const t = config.rules.quickReveal ? QUICK_TIMELINE : TIMELINE;
    const step = (s: RevealStep) => setReveal({ key: roundKey, step: s });
    if (reducedMotion) {
      step("named");
      const id = window.setTimeout(() => dispatch({ type: "REVEAL_DONE" }), 450);
      return () => window.clearTimeout(id);
    }
    // Chained, not scheduled up front: each step starts its own countdown only
    // once it has run, so a busy main thread can't merge the flash and the
    // name into one render and skip the flash.
    let timer = window.setTimeout(() => {
      step("flash");
      sfx.play("reveal");
      timer = window.setTimeout(() => {
        step("named");
        timer = window.setTimeout(() => dispatch({ type: "REVEAL_DONE" }), t.named);
      }, t.flash);
    }, t.hold);
    return () => window.clearTimeout(timer);
  }, [state.phase, roundKey, config.rules.quickReveal, reducedMotion]);

  // ---- Round resolution sounds (once per round key; saving happens in dispatch)
  const handled = useRef(new Set<string>());
  useEffect(() => {
    const { round } = state;
    if (!round.outcome || handled.current.has(round.key)) return;
    handled.current.add(round.key);

    if (round.outcome === "correct") {
      sfx.play(state.streak > 0 && state.streak % STREAK_MILESTONE === 0 ? "streak" : "correct");
    } else if (round.outcome !== "timeup") {
      sfx.play("wrong");
    }
  }, [state]);

  // Wrong-guess buzz.
  useEffect(() => {
    if (state.feedback?.kind === "wrong") sfx.play("wrong");
  }, [state.feedback]);

  // Game over jingle for modes that can be lost.
  useEffect(() => {
    if (state.phase === "over" && (config.lives !== null || config.timeLimitSeconds !== null)) sfx.play("gameover");
  }, [state.phase, config.lives, config.timeLimitSeconds]);

  // ---- Actions
  const next = useCallback(() => {
    dispatch({ type: "NEXT", pokemonId: drawNext(), now: Date.now() });
  }, [drawNext]);

  // Timed mode keeps moving.
  useEffect(() => {
    if (state.phase !== "result" || !config.rules.quickReveal) return;
    const id = window.setTimeout(next, TIMED_ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [state.phase, config.rules.quickReveal, next]);

  const actions = useMemo(
    () => ({
      submit: (guess: string) => dispatch({ type: "SUBMIT", guess, now: Date.now() }),
      hint: () => {
        if (stateRef.current.phase !== "guessing") return;
        sfx.play("hint");
        dispatch({ type: "HINT", available: hints.length });
      },
      giveUp: () => dispatch({ type: "GIVE_UP", now: Date.now() }),
      skipReveal: () => {
        if (stateRef.current.phase === "revealing") dispatch({ type: "REVEAL_DONE" });
      },
      next,
      end: () => dispatch({ type: "END", now: Date.now() }),
      replaceBrokenRound: () => {
        const id = setup.deck ? drawNext() : null;
        if (id !== null) dispatch({ type: "REPLACE_ROUND", pokemonId: id });
      },
      retryImage: () => {
        setImageError(false);
        preloadArtwork(pokemon.image.path).then(
          () => dispatch({ type: "ROUND_READY", now: Date.now() }),
          () => setImageError(true),
        );
      },
    }),
    [hints.length, next, drawNext, setup, pokemon],
  );

  return {
    state,
    pokemon,
    hints,
    revealStep: state.phase === "revealing" ? revealStep : ("done" as RevealStep),
    timeLeftMs,
    roundTimeLeftMs,
    imageError,
    complete: isRunComplete(state),
    actions,
  };
}
