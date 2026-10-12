import { hashString } from "./random";

/** Bump only if the daily selection must change for everyone. */
export const DAILY_SEED_VERSION = 1;

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function previousDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y!, m! - 1, d! - 1));
}

/** Deterministic Pokédex number for a date. `ids` must be sorted ascending. */
export function dailyPokemonId(key: string, ids: readonly number[]): number {
  if (ids.length === 0) throw new Error("No Pokémon available for the daily challenge.");
  const index = hashString(`whos-that-pokemon:daily:v${DAILY_SEED_VERSION}:${key}`) % ids.length;
  return ids[index]!;
}
