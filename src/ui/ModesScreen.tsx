import { useState } from "react";
import { useGameData } from "../game/GameData";
import {
  DIFFICULTIES,
  GENERATION_CHALLENGE_ROUNDS,
  HARDCORE_ROUND_SECONDS,
  MODES,
  TIMED_OPTIONS,
  type Difficulty,
  type ModeId,
} from "../game/rules";
import { completedOn, liveStreak, type DailyRecord } from "../persistence/dailyRecord";
import { DIFFICULTY_IDS, type Settings } from "../persistence/settings";
import { GenerationPicker } from "./GenerationPicker";
import { Flame } from "./icons";

interface ModesScreenProps {
  settings: Settings;
  onSettings(patch: Partial<Settings>): void;
  onDifficulty(difficulty: Difficulty): void;
  daily: DailyRecord;
  today: string;
  initialMode: ModeId;
  onStart(mode: ModeId): void;
}

const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  easy: "3 guesses · suggestions · 5 hints",
  normal: "3 guesses · suggestions · 3 hints",
  hard: "2 guesses · fewer suggestions · 1 hint",
  expert: "2 guesses · no help · 20 s per Pokémon · all generations",
};

export function DifficultyChoice({ value, onChange }: { value: Difficulty; onChange(d: Difficulty): void }) {
  return (
    <div className="field">
      <span className="field__label" id="difficulty-label">
        Difficulty
      </span>
      <div className="choice" role="radiogroup" aria-labelledby="difficulty-label">
        {DIFFICULTY_IDS.map((d) => (
          <button key={d} type="button" role="radio" aria-checked={value === d} onClick={() => onChange(d)}>
            {DIFFICULTIES[d].label}
          </button>
        ))}
      </div>
      <span className="field__note">{DIFFICULTY_NOTES[value]}</span>
    </div>
  );
}

export function ModesScreen({ settings, onSettings, onDifficulty, daily, today, initialMode, onStart }: ModesScreenProps) {
  const data = useGameData();
  const [selected, setSelected] = useState<ModeId>(initialMode);
  const mode = MODES.find((m) => m.id === selected)!;
  const dailyDone = completedOn(daily, today);
  const expert = settings.difficulty === "expert";

  return (
    <section className="modes" aria-labelledby="modes-title">
      <h2 id="modes-title" className="screen-title">
        Choose a mode
      </h2>
      <div className="modes__layout">
        <ul className="modes__menu panel" role="list">
          {MODES.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="modes__item"
                aria-current={m.id === selected ? "true" : undefined}
                onClick={() => setSelected(m.id)}
                onDoubleClick={() => onStart(m.id)}
              >
                <span className="modes__cursor" aria-hidden="true">
                  ▶
                </span>
                <span className="modes__name">{m.name}</span>
                {m.id === "daily" && dailyDone && <span className="modes__tag pixel">Done</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className="modes__detail textbox">
          <h3 className="modes__detail-title">{mode.name}</h3>
          <p className="modes__blurb">{mode.blurb}</p>

          {mode.usesDifficulty && <DifficultyChoice value={settings.difficulty} onChange={onDifficulty} />}

          {selected === "timed" && (
            <div className="field">
              <span className="field__label" id="timed-label">
                Clock
              </span>
              <div className="choice" role="radiogroup" aria-labelledby="timed-label">
                {TIMED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={settings.timedSeconds === s}
                    onClick={() => onSettings({ timedSeconds: s })}
                  >
                    {s} s
                  </button>
                ))}
              </div>
            </div>
          )}

          {(selected === "classic" || selected === "timed" || selected === "survival") && (
            <div className="field">
              <span className="field__label">Generations</span>
              {expert ? (
                <span className="field__note">Expert plays every generation.</span>
              ) : (
                <GenerationPicker
                  label="Generations"
                  available={data.generations}
                  selected={settings.generations}
                  onChange={(generations) => onSettings({ generations })}
                />
              )}
            </div>
          )}

          {selected === "generation" && (
            <div className="field">
              <span className="field__label">Pick generations</span>
              {expert ? (
                <span className="field__note">Expert plays every generation.</span>
              ) : (
                <GenerationPicker
                  label="Generations for the challenge"
                  available={data.generations}
                  selected={settings.challengeGenerations}
                  onChange={(challengeGenerations) => onSettings({ challengeGenerations })}
                />
              )}
              <span className="field__note">{GENERATION_CHALLENGE_ROUNDS} Pokémon, then your result.</span>
            </div>
          )}

          {selected === "daily" && (
            <div className="field">
              <span className="field__label">Today</span>
              <span className="modes__daily">
                {dailyDone ? (dailyDone.solved ? "Solved" : "Missed") : "Not played yet"}
                <span className="with-icon">
                  <Flame size={18} /> {liveStreak(daily, today)} day streak
                </span>
              </span>
              <span className="field__note">3 guesses and up to 3 hints. Counts once per day.</span>
            </div>
          )}

          {selected === "hardcore" && (
            <div className="field">
              <span className="field__label" id="hc-timer">
                {HARDCORE_ROUND_SECONDS}-second timer
              </span>
              <div className="choice" role="radiogroup" aria-labelledby="hc-timer">
                {[true, false].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    role="radio"
                    aria-checked={settings.hardcoreTimer === on}
                    onClick={() => onSettings({ hardcoreTimer: on })}
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <span className="field__note">Scores ×1.5. Punctuation counts: "Mr. Mime", "Ho-Oh".</span>
            </div>
          )}

          <button type="button" className="btn btn--go modes__start" onClick={() => onStart(selected)}>
            {selected === "daily" && dailyDone ? "See today's result" : "Start"}
          </button>
        </div>
      </div>
    </section>
  );
}
