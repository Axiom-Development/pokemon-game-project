import { useEffect, useMemo, type ReactNode } from "react";
import { useGameData } from "../../game/GameData";
import { modeInfo, DIFFICULTIES } from "../../game/rules";
import { useRun, type RunCallbacks, type RunRequest } from "../../game/useRun";
import { Clock, PokeBall } from "../icons";
import { GuessBox } from "./GuessBox";
import { ResultBox } from "./ResultBox";
import { RunSummary } from "./RunSummary";
import { Stage } from "./Stage";

interface PlayScreenProps {
  request: RunRequest;
  callbacks: RunCallbacks;
  reducedMotion: boolean;
  visible: boolean;
  onStatus(status: { score: number; streak: number } | null): void;
  onPlayAgain(): void;
  onChangeMode(): void;
  /** Shown instead of the run summary when a Daily run finishes. */
  dailySummary: ReactNode;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function PlayScreen({ request, callbacks, reducedMotion, visible, onStatus, onPlayAgain, onChangeMode, dailySummary }: PlayScreenProps) {
  const data = useGameData();
  const run = useRun(data, request, callbacks, reducedMotion);
  const { state, pokemon, hints, revealStep, actions } = run;
  const { config, round, phase } = state;
  const mode = modeInfo(config.mode);

  const poolNames = useMemo(
    () =>
      data.pokemon
        .filter((p) => config.generations.includes(p.generation))
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b)),
    [data, config.generations],
  );

  useEffect(() => {
    onStatus(phase === "over" ? null : { score: state.score, streak: state.streak });
  }, [state.score, state.streak, phase, onStatus]);

  // Space / Enter skip the reveal.
  useEffect(() => {
    if (!visible || phase !== "revealing") return;
    // The Enter that submitted the guess is still bubbling when this listener
    // is attached; only key presses that start after the reveal may skip it.
    const revealStarted = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.timeStamp <= revealStarted || e.repeat) return;
      if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        actions.skipReveal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, phase, actions]);

  if (phase === "over") {
    if (config.mode === "daily" && dailySummary) return <>{dailySummary}</>;
    return <RunSummary state={state} onPlayAgain={onPlayAgain} onChangeMode={onChangeMode} />;
  }

  const timeLeft = run.timeLeftMs ?? run.roundTimeLeftMs;
  const hud = (
    <>
      <span className="hud-chip">
        {mode.short}
        {mode.usesDifficulty && <span className="hud-chip__sub"> · {DIFFICULTIES[config.difficulty].label}</span>}
      </span>
      {config.roundLimit !== null && config.roundLimit > 1 && (
        <span className="hud-chip hud-chip--count" aria-label={`Pokémon ${Math.min(round.index + 1, config.roundLimit)} of ${config.roundLimit}`}>
          {Math.min(round.index + 1, config.roundLimit)}/{config.roundLimit}
        </span>
      )}
      {state.lives !== null && (
        <span className="hud-chip hud-lives" role="img" aria-label={`${state.lives} of ${config.lives} lives left`}>
          {Array.from({ length: config.lives ?? 0 }, (_, i) => (
            <PokeBall key={i} size={20} empty={i >= (state.lives ?? 0)} />
          ))}
        </span>
      )}
      {timeLeft !== null && (
        <span
          className={`hud-chip hud-chip--time ${timeLeft <= 5000 ? "hud-chip--urgent" : ""}`}
          role="timer"
          aria-label={`${Math.ceil(timeLeft / 1000)} seconds left`}
        >
          <Clock size={18} /> {formatClock(timeLeft)}
        </span>
      )}
    </>
  );

  const isDaily = config.mode === "daily";
  const endless = config.roundLimit === null && config.lives === null && config.timeLimitSeconds === null;
  const nextLabel = run.complete ? (isDaily ? "See today's result" : "See results") : "Next Pokémon";

  return (
    <div className="play">
      <Stage
        pokemon={pokemon}
        roundKey={round.key}
        phase={phase}
        step={revealStep}
        hud={hud}
        imageError={run.imageError}
        onSkip={actions.skipReveal}
        onRetryImage={actions.retryImage}
        onReplaceImage={isDaily ? undefined : actions.replaceBrokenRound}
      />

      <div className="textbox play__box">
        {(phase === "guessing" || phase === "loading") && (
          <GuessBox
            rules={config.rules}
            names={poolNames}
            guessesUsed={round.guesses.length}
            feedback={state.feedback}
            hints={hints}
            hintsUsed={round.hintsUsed}
            active={phase === "guessing" && visible}
            focusKey={round.key}
            onSubmit={actions.submit}
            onHint={actions.hint}
            onGiveUp={actions.giveUp}
          />
        )}

        {phase === "revealing" && (
          <p className="play__waiting" aria-live="polite">
            {round.outcome === "correct" || round.guesses.length > 0 ? (
              <>
                <span className="pixel">▶</span> {round.guesses[round.guesses.length - 1] ?? ""}…
              </>
            ) : (
              <>
                <span className="pixel">▶</span> {round.outcome === "timeup" ? "Time's up…" : "Let's see…"}
              </>
            )}
          </p>
        )}

        {phase === "result" && round.outcome && (
          <ResultBox
            pokemon={pokemon}
            outcome={round.outcome}
            score={round.score}
            streak={state.streak}
            attempt={round.guesses.length}
            nextLabel={nextLabel}
            onNext={actions.next}
            autoAdvancing={config.rules.quickReveal && !run.complete}
            secondary={
              endless ? (
                <button type="button" className="btn btn--link" onClick={actions.end}>
                  End run
                </button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
