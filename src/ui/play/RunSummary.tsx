import { useEffect, useRef } from "react";
import { assetUrl } from "../../data/loadPokemon";
import { useGameData } from "../../game/GameData";
import { modeInfo } from "../../game/rules";
import type { RunState } from "../../game/run";
import { Check, Cross } from "../icons";

function headline(state: RunState): string {
  const { config } = state;
  if (config.lives !== null && (state.lives ?? 0) <= 0) return "Out of lives!";
  if (config.timeLimitSeconds !== null && state.timeUp) return "Time's up!";
  if (config.roundLimit !== null && state.history.length >= config.roundLimit) return "Challenge complete!";
  return "Run over";
}

interface RunSummaryProps {
  state: RunState;
  onPlayAgain(): void;
  onChangeMode(): void;
}

export function RunSummary({ state, onPlayAgain, onChangeMode }: RunSummaryProps) {
  const data = useGameData();
  const againRef = useRef<HTMLButtonElement>(null);
  const counted = state.history.filter((h) => h.outcome !== "timeup");
  const accuracy = counted.length ? Math.round((state.correct / counted.length) * 100) : null;

  useEffect(() => againRef.current?.focus({ preventScroll: true }), []);

  return (
    <section className="summary panel" aria-labelledby="summary-title">
      <div className="panel__bar">
        <h2 id="summary-title">{headline(state)}</h2>
        <span className="pixel">{modeInfo(state.config.mode).name}</span>
      </div>

      <div className="summary__body">
        <div className="summary__score">
          <span className="summary__label pixel">Score</span>
          <span className="summary__total outlined">{state.score.toLocaleString("en")}</span>
        </div>

        <dl className="summary__stats">
          <div>
            <dt>Correct</dt>
            <dd>
              {state.correct} of {counted.length}
            </dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{accuracy === null ? "—" : `${accuracy}%`}</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>{state.bestStreak}</dd>
          </div>
        </dl>

        {counted.length > 0 ? (
          <ol className="summary__seen" aria-label="Pokémon this run">
            {/* A Pokémon cut off by the Timed clock wasn't a miss, so it isn't listed. */}
            {counted.map((h, i) => {
              const p = data.byId.get(h.pokemonId);
              if (!p) return null;
              const good = h.outcome === "correct";
              return (
                <li key={i} className={`seen ${good ? "seen--good" : "seen--bad"}`}>
                  <img src={assetUrl(p.image.path)} alt="" loading="lazy" decoding="async" width={64} height={64} />
                  <span className="seen__name">{p.name}</span>
                  <span className="seen__mark" aria-label={good ? "correct" : "missed"}>
                    {good ? <Check size={14} /> : <Cross size={14} />}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="summary__empty">No Pokémon this time. The next one's waiting.</p>
        )}

        <div className="summary__actions">
          <button ref={againRef} type="button" className="btn btn--primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="btn" onClick={onChangeMode}>
            Change mode
          </button>
        </div>
      </div>
    </section>
  );
}
