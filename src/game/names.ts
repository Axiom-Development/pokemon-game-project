/**
 * Answer normalisation.
 *
 * Lenient matching ignores case, accents, spacing and punctuation, so
 * "mr mime", "Farfetchd", "ho oh", "Flabebe", "type null" and "nidoran f"
 * are all accepted.
 *
 * Strict matching (Hardcore) only forgives case, accents, apostrophe style and
 * repeated spaces — punctuation and spacing must be right ("Mr. Mime",
 * "Ho-Oh", "Type: Null"). Gender symbols may be typed as "-f"/"-m" or " f"/" m"
 * because ♀/♂ are not on most keyboards.
 */

const GENDER_SYMBOLS: Record<string, string> = { "♀": "f", "♂": "m" };

function foldAccents(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "");
}

export function looseKey(text: string): string {
  let t = text.normalize("NFKC").toLowerCase();
  t = t.replace(/[♀♂]/g, (s) => ` ${GENDER_SYMBOLS[s]} `);
  t = t.replace(/\bfemale\b/g, "f").replace(/\bmale\b/g, "m");
  return foldAccents(t).replace(/[^a-z0-9]/g, "");
}

export function strictKey(text: string): string {
  return foldAccents(text.normalize("NFKC").toLowerCase())
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** All strict spellings accepted for a name. */
export function strictVariants(name: string): string[] {
  const base = strictKey(name);
  if (!/[♀♂]/.test(base)) return [base];
  const variants = new Set([base]);
  for (const [symbol, letter] of Object.entries(GENDER_SYMBOLS)) {
    if (!base.includes(symbol)) continue;
    const stem = base.replace(symbol, "").trim();
    variants.add(`${stem}-${letter}`);
    variants.add(`${stem} ${letter}`);
  }
  return [...variants];
}

export function isCorrectGuess(guess: string, name: string, strict: boolean): boolean {
  if (strict) return strictVariants(name).includes(strictKey(guess));
  const key = looseKey(guess);
  return key.length > 0 && key === looseKey(name);
}

/** Fast lookup of whether a guess names any known Pokémon (lenient). */
export class NameIndex {
  private readonly keys: Map<string, string>;

  constructor(names: string[]) {
    this.keys = new Map(names.map((n) => [looseKey(n), n]));
  }

  isKnown(guess: string): boolean {
    return this.keys.has(looseKey(guess));
  }
}

/**
 * Autocomplete suggestions. Ordered alphabetically within "starts with" and
 * "contains" groups so the order never hints at the answer.
 */
export function suggestNames(
  query: string,
  names: readonly string[],
  limit: number,
  minChars: number,
): string[] {
  const key = looseKey(query);
  if (key.length < minChars) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const nameKey = looseKey(name);
    if (nameKey.startsWith(key)) starts.push(name);
    else if (nameKey.includes(key)) contains.push(name);
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}
