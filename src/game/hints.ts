import type { Pokemon } from "../data/types";

export interface Hint {
  label: string;
  value: string;
}

const DEX_BAND = 50;

export function formatDexNumber(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

export function formatHeight(m: number | null): string | null {
  return m === null ? null : `${m.toLocaleString("en", { maximumFractionDigits: 1 })} m`;
}

export function formatWeight(kg: number | null): string | null {
  return kg === null ? null : `${kg.toLocaleString("en", { maximumFractionDigits: 1 })} kg`;
}

/** Each hint also reveals one more letter of the name, up to this many. */
export const MAX_REVEALED_LETTERS = 3;

/** Characters that count as letters of a name (♀/♂ included); spaces and punctuation stay visible. */
const isLetter = (ch: string) => /[\p{L}\p{N}♀♂]/u.test(ch);

export function letterCount(name: string): number {
  return [...name].filter(isLetter).length;
}

/**
 * Letters revealed after `hintsUsed` hints: one per hint, at most three, and
 * always at least two hidden so a short name like "Mew" is never given away.
 */
export function revealedLetterCount(name: string, hintsUsed: number): number {
  return Math.max(0, Math.min(hintsUsed, MAX_REVEALED_LETTERS, letterCount(name) - 2));
}

export interface PatternCell {
  char: string;
  hidden: boolean;
  /** Spaces and punctuation are shown as-is. */
  letter: boolean;
}

/** Hangman-style view of the name with the first `revealed` letters shown. */
export function namePattern(name: string, revealed: number): PatternCell[] {
  let shown = 0;
  return [...name].map((char) => {
    if (!isLetter(char)) return { char, hidden: false, letter: false };
    if (shown < revealed) {
      shown++;
      return { char, hidden: false, letter: true };
    }
    return { char: "", hidden: true, letter: true };
  });
}

/**
 * Hints in order of how much they give away. Only data that exists in the
 * dataset is used; missing values are skipped rather than invented.
 */
export function buildHints(p: Pokemon, maxId: number): Hint[] {
  const hints: Hint[] = [{ label: "Generation", value: `Generation ${p.generation}` }];
  const [primary, secondary] = p.types;
  if (primary) hints.push({ label: "Type", value: primary });
  hints.push({ label: "Second type", value: secondary ?? "None — single type" });

  const start = Math.floor((p.id - 1) / DEX_BAND) * DEX_BAND + 1;
  const end = Math.min(start + DEX_BAND - 1, maxId);
  hints.push({ label: "Pokédex", value: `Between ${formatDexNumber(start)} and ${formatDexNumber(end)}` });

  const size = [formatHeight(p.heightM), formatWeight(p.weightKg)].filter(Boolean).join(" · ");
  if (size) hints.push({ label: "Size", value: size });
  if (p.genus) hints.push({ label: "Category", value: `The ${p.genus}` });
  return hints;
}
