import { ALL_GENERATIONS, TIMED_OPTIONS, type Difficulty, type TimedSeconds } from "../game/rules";
import { FieldReader, isRecord, load, save } from "./storage";

export const SETTINGS_KEY = "wtp.settings.v1";

export type MotionPreference = "system" | "reduced" | "full";

export interface Settings {
  difficulty: Difficulty;
  generations: number[];
  challengeGenerations: number[];
  timedSeconds: TimedSeconds;
  hardcoreTimer: boolean;
  sound: boolean;
  volume: number;
  motion: MotionPreference;
}

export const DIFFICULTY_IDS: readonly Difficulty[] = ["easy", "normal", "hard", "expert"];

export function defaultSettings(): Settings {
  return {
    difficulty: "normal",
    generations: [...ALL_GENERATIONS],
    challengeGenerations: [1],
    timedSeconds: 60,
    hardcoreTimer: true,
    sound: true,
    volume: 0.6,
    motion: "system",
  };
}

export function sanitiseSettings(raw: unknown): { value: Settings; repaired: boolean } {
  const d = defaultSettings();
  if (!isRecord(raw)) return { value: d, repaired: true };
  const r = new FieldReader(raw);
  const gens = (key: string, fallback: number[]) => {
    const list = r.intList(key, 1, ALL_GENERATIONS.length, fallback);
    return list.length ? list : fallback;
  };
  const value: Settings = {
    difficulty: r.oneOf("difficulty", DIFFICULTY_IDS, d.difficulty),
    generations: gens("generations", d.generations),
    challengeGenerations: gens("challengeGenerations", d.challengeGenerations),
    timedSeconds: r.oneOf("timedSeconds", TIMED_OPTIONS, d.timedSeconds),
    hardcoreTimer: r.oneOf("hardcoreTimer", [true, false], d.hardcoreTimer),
    sound: r.oneOf("sound", [true, false], d.sound),
    volume: r.number("volume", 0, 1, d.volume),
    motion: r.oneOf("motion", ["system", "reduced", "full"] as const, d.motion),
  };
  return { value, repaired: r.repaired };
}

export const loadSettings = () => load(SETTINGS_KEY, sanitiseSettings, defaultSettings);
export const saveSettings = (settings: Settings) => save(SETTINGS_KEY, settings);
