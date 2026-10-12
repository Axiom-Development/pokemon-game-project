import { useEffect, useRef, useState } from "react";
import { sfx } from "../audio/sfx";
import { useGameData } from "../game/GameData";
import type { Difficulty } from "../game/rules";
import type { MotionPreference, Settings } from "../persistence/settings";
import { GenerationPicker } from "./GenerationPicker";
import { Speaker } from "./icons";
import { DifficultyChoice } from "./ModesScreen";

interface SettingsScreenProps {
  settings: Settings;
  onSettings(patch: Partial<Settings>): void;
  onDifficulty(difficulty: Difficulty): void;
  onResetProgress(): void;
}

const MOTION: [MotionPreference, string][] = [
  ["system", "Device"],
  ["reduced", "Reduced"],
  ["full", "Full"],
];

export function SettingsScreen({ settings, onSettings, onDifficulty, onResetProgress }: SettingsScreenProps) {
  const data = useGameData();
  const [confirming, setConfirming] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (confirming && !d.open) d.showModal();
    if (!confirming && d.open) d.close();
  }, [confirming]);

  return (
    <section className="options" aria-labelledby="options-title">
      <div className="panel options__panel">
        <div className="panel__bar">
          <h2 id="options-title">Options</h2>
        </div>

        <div className="options__rows">
          <div className="options__row">
            <DifficultyChoice value={settings.difficulty} onChange={onDifficulty} />
          </div>

          <div className="options__row">
            <div className="field">
              <span className="field__label">Generations</span>
              {settings.difficulty === "expert" ? (
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
          </div>

          <div className="options__row">
            <div className="field">
              <span className="field__label" id="sound-label">
                Sound effects
              </span>
              <div className="choice" role="radiogroup" aria-labelledby="sound-label">
                {[true, false].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    role="radio"
                    aria-checked={settings.sound === on}
                    onClick={() => {
                      onSettings({ sound: on });
                      if (on) {
                        sfx.enabled = true;
                        sfx.play("select");
                      }
                    }}
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="options__row">
            <div className="field">
              <label className="field__label" htmlFor="volume">
                Volume
              </label>
              <div className="options__volume">
                <Speaker size={22} muted={!settings.sound || settings.volume === 0} />
                <input
                  id="volume"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(settings.volume * 100)}
                  disabled={!settings.sound}
                  onChange={(e) => onSettings({ volume: Number(e.target.value) / 100 })}
                  onPointerUp={() => sfx.play("select")}
                  onKeyUp={() => sfx.play("select")}
                />
                <span className="pixel options__value">{Math.round(settings.volume * 100)}</span>
                <button type="button" className="btn btn--small" disabled={!settings.sound} onClick={() => sfx.play("correct")}>
                  Test
                </button>
              </div>
            </div>
          </div>

          <div className="options__row">
            <div className="field">
              <span className="field__label" id="motion-label">
                Animations
              </span>
              <div className="choice" role="radiogroup" aria-labelledby="motion-label">
                {MOTION.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={settings.motion === value}
                    onClick={() => onSettings({ motion: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="field__note">"Reduced" swaps the flash and spin for a quick fade.</span>
            </div>
          </div>

          <div className="options__row options__row--danger">
            <div className="field">
              <span className="field__label">Progress</span>
              <button type="button" className="btn btn--small" onClick={() => setConfirming(true)}>
                Reset progress…
              </button>
              {resetDone && (
                <span className="field__note" role="status">
                  Progress cleared.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <dialog ref={dialogRef} className="confirm" onClose={() => setConfirming(false)} aria-labelledby="confirm-title">
        <div className="confirm__inner textbox">
          <h3 id="confirm-title">Erase all progress?</h3>
          <p>Your stats, Pokédex and daily streak will be wiped. Options stay as they are.</p>
          <div className="confirm__actions">
            <button
              type="button"
              className="btn btn--go"
              onClick={() => {
                onResetProgress();
                setResetDone(true);
                setConfirming(false);
              }}
            >
              Erase
            </button>
            <button type="button" className="btn" autoFocus onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
