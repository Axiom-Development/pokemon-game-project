import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { suggestNames } from "../../game/names";
import type { Hint, PatternCell } from "../../game/hints";
import { autocompleteSettings, type RoundRules } from "../../game/rules";
import type { Feedback } from "../../game/run";
import { HINT_PENALTY } from "../../game/scoring";
import { Bulb, Cross, PokeBall } from "../icons";

interface GuessBoxProps {
  rules: RoundRules;
  /** Names offered by autocomplete (the current pool, alphabetised). */
  names: readonly string[];
  guessesUsed: number;
  feedback: Feedback | null;
  hints: Hint[];
  hintsUsed: number;
  /** Name with only the hint-revealed letters filled in (never the full answer). */
  pattern: PatternCell[] | null;
  active: boolean;
  focusKey: string;
  onSubmit(guess: string): void;
  onHint(): void;
  onGiveUp(): void;
}

/** Screen-reader description of the letter hint, e.g. "Starts with Pi, 7 letters". */
function patternLabel(pattern: PatternCell[]): string {
  const letters = pattern.filter((c) => c.letter);
  const shown = letters.filter((c) => !c.hidden).map((c) => c.char).join("");
  return `Starts with ${shown}, ${letters.length} letters`;
}

export function GuessBox(props: GuessBoxProps) {
  const { rules, names, guessesUsed, feedback, hints, hintsUsed, pattern, active, focusKey, onSubmit, onHint, onGiveUp } = props;
  const [value, setValue] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();
  const feedbackId = useId();

  const ac = autocompleteSettings(rules.autocomplete);
  const limit = ac?.limit ?? 0;
  const minChars = ac?.minChars ?? 0;
  const suggestions = useMemo(
    () => (limit ? suggestNames(value, names, limit, minChars) : []),
    [limit, minChars, value, names],
  );
  const showList = open && suggestions.length > 0;

  // New round: clear and focus the input.
  useEffect(() => {
    setValue("");
    setOpen(false);
    setActiveIndex(-1);
    if (active) inputRef.current?.focus({ preventScroll: true });
  }, [focusKey, active]);

  // Clear after every counted guess so the next one starts fresh.
  useEffect(() => {
    if (feedback?.kind === "wrong") setValue("");
  }, [feedback, guessesUsed]);

  const submit = (guess: string) => {
    if (!active) return;
    setOpen(false);
    setActiveIndex(-1);
    onSubmit(guess);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.repeat) return;
      const chosen = showList && activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      if (chosen) setValue(chosen);
      submit(chosen ?? value);
    }
  };

  const guessesLeft = rules.guesses - guessesUsed;
  const hintLimit = Math.min(rules.maxHints, hints.length);
  const hintsLeft = hintLimit - hintsUsed;

  return (
    <div className="guess">
      <form
        className="guess__row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Your guess
        </label>
        <div className="guess__field">
          <input
            ref={inputRef}
            id={inputId}
            className="guess__input"
            type="text"
            value={value}
            placeholder="Name that Pokémon…"
            disabled={!active}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={40}
            role={ac ? "combobox" : undefined}
            aria-autocomplete={ac ? "list" : undefined}
            aria-expanded={ac ? showList : undefined}
            aria-controls={ac ? listId : undefined}
            aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-describedby={feedbackId}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setOpen(false)}
            onFocus={() => setOpen(true)}
          />
          {ac && (
            <ul id={listId} role="listbox" className="guess__list" hidden={!showList} aria-label="Suggestions">
              {suggestions.map((name, i) => (
                <li
                  key={name}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className="guess__option"
                  // mousedown so the input doesn't blur before the click lands
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setValue(name);
                    submit(name);
                  }}
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className="btn btn--go guess__go" disabled={!active}>
          Guess
        </button>
      </form>

      <div className="guess__meta">
        <span className="guess__balls" aria-label={`${guessesLeft} of ${rules.guesses} guesses left`} role="img">
          {Array.from({ length: rules.guesses }, (_, i) => (
            <PokeBall key={i} size={20} empty={i >= guessesLeft} />
          ))}
        </span>
        <span className="guess__tools">
          {hintLimit > 0 && (
            <button type="button" className="btn btn--small" onClick={onHint} disabled={!active || hintsLeft <= 0}>
              <Bulb size={18} />
              Hint <span className="guess__cost">−{HINT_PENALTY}</span>
              <span className="sr-only">
                points, {hintsLeft} {hintsLeft === 1 ? "hint" : "hints"} left
              </span>
            </button>
          )}
          <button type="button" className="btn btn--link" onClick={onGiveUp} disabled={!active}>
            Give up
          </button>
        </span>
      </div>

      <p id={feedbackId} className={`guess__feedback guess__feedback--${feedback?.kind ?? "none"}`} role="status" aria-live="polite">
        {feedback && (
          <>
            {feedback.kind === "wrong" && <Cross size={18} />}
            {feedback.message}
          </>
        )}
      </p>

      {hintsUsed > 0 && pattern && (
        <p className="name-pattern">
          <span className="hint__label">Name</span>
          <span className="name-pattern__cells" aria-label={patternLabel(pattern)} role="img">
            {pattern.map((cell, i) =>
              cell.letter ? (
                <span key={i} className={`name-pattern__cell ${cell.hidden ? "is-hidden" : ""}`} aria-hidden="true">
                  {cell.char}
                </span>
              ) : (
                <span key={i} className="name-pattern__gap" aria-hidden="true">
                  {cell.char.trim()}
                </span>
              ),
            )}
          </span>
        </p>
      )}

      {hintsUsed > 0 && (
        <ol className="hints" aria-label="Hints">
          {hints.slice(0, hintsUsed).map((h) => (
            <li key={h.label} className="hint">
              <span className="hint__label">{h.label}</span>
              <span className="hint__value">{h.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
