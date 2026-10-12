import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import type { Pokemon } from "../../data/types";
import { formatDexNumber, formatHeight, formatWeight } from "../../game/hints";
import type { Outcome } from "../../game/run";
import type { ScoreBreakdown } from "../../game/scoring";
import { Check, Cross, Flame } from "../icons";
import { TypeList } from "../TypeBadge";

const HEADLINES: Record<Outcome, string> = {
  correct: "Correct!",
  wrong: "Not quite!",
  gaveup: "Better luck next time!",
  timeout: "Too slow!",
  timeup: "Time's up!",
};

interface ResultBoxProps {
  pokemon: Pokemon;
  outcome: Outcome;
  score: ScoreBreakdown | null;
  streak: number;
  attempt: number;
  nextLabel: string;
  onNext(): void;
  autoAdvancing: boolean;
  extra?: ReactNode;
  secondary?: ReactNode;
}

export function PokemonFacts({ pokemon }: { pokemon: Pokemon }) {
  const size = [formatHeight(pokemon.heightM), formatWeight(pokemon.weightKg)].filter(Boolean).join(" · ");
  return (
    <dl className="facts">
      <div>
        <dt>No.</dt>
        <dd className="pixel">{formatDexNumber(pokemon.id)}</dd>
      </div>
      <div>
        <dt>Type</dt>
        <dd>
          <TypeList types={pokemon.types} />
        </dd>
      </div>
      <div>
        <dt>Gen</dt>
        <dd>{pokemon.generation}</dd>
      </div>
      {pokemon.genus && (
        <div>
          <dt>Category</dt>
          <dd>{pokemon.genus}</dd>
        </div>
      )}
      {size && (
        <div>
          <dt>Size</dt>
          <dd>{size}</dd>
        </div>
      )}
    </dl>
  );
}

export function ResultBox(props: ResultBoxProps) {
  const { pokemon, outcome, score, streak, attempt, nextLabel, onNext, autoAdvancing, extra, secondary } = props;
  const nextRef = useRef<HTMLButtonElement>(null);
  const shownAt = useRef(performance.now());
  const correct = outcome === "correct";

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  // Mashing Enter through the reveal shouldn't also skip the result.
  // (detail === 0 means keyboard activation; pointer clicks are always deliberate.)
  const handleNext = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0 && performance.now() - shownAt.current < 350) return;
    onNext();
  };

  const parts: string[] = [];
  if (score && correct) {
    parts.push(`${score.base} for ${["first", "second", "third"][attempt - 1] ?? "a later"} try`);
    if (score.hintPenalty) parts.push(`−${score.hintPenalty} hints`);
    if (score.streakBonus) parts.push(`+${score.streakBonus} streak`);
  }

  return (
    <div className={`result result--${correct ? "good" : "bad"}`}>
      <div className="result__head">
        <p className="result__verdict" role="status">
          <span className="result__icon">{correct ? <Check size={22} /> : <Cross size={22} />}</span>
          {HEADLINES[outcome]}
          <span className="sr-only"> It's {pokemon.name}.</span>
        </p>
        {correct && score && (
          <p className="result__points pixel" aria-label={`${score.total} points`}>
            +{score.total}
          </p>
        )}
      </div>

      {(parts.length > 0 || streak > 1) && (
        <p className="result__detail">
          {parts.join(" · ")}
          {streak > 1 && (
            <span className="result__streak">
              <Flame size={18} /> {streak} in a row!
            </span>
          )}
        </p>
      )}

      <PokemonFacts pokemon={pokemon} />
      {extra}

      <div className="result__actions">
        {!autoAdvancing && (
          <button ref={nextRef} type="button" className="btn btn--primary" onClick={handleNext}>
            {nextLabel}
          </button>
        )}
        {secondary}
      </div>
    </div>
  );
}
