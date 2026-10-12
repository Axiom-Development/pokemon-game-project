import type { Pokemon, PokemonDataset } from "./types";

const SUPPORTED_SCHEMA = 1;

/** Resolve a project-relative asset path against the app's base URL. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function isPokemon(value: unknown): value is Pokemon {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const image = p.image as Record<string, unknown> | undefined;
  return (
    typeof p.id === "number" &&
    typeof p.name === "string" &&
    typeof p.generation === "number" &&
    Array.isArray(p.types) &&
    typeof p.stats === "object" &&
    !!image &&
    typeof image.path === "string"
  );
}

export async function loadPokemon(): Promise<PokemonDataset> {
  const response = await fetch(assetUrl("data/pokemon.json"));
  if (!response.ok) {
    throw new Error(`Pokémon data could not be loaded (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as PokemonDataset;
  if (data.schemaVersion !== SUPPORTED_SCHEMA || !Array.isArray(data.pokemon)) {
    throw new Error("Pokémon data has an unexpected format. Re-run `npm run assets`.");
  }
  const pokemon = data.pokemon.filter(isPokemon).sort((a, b) => a.id - b.id);
  if (pokemon.length === 0) throw new Error("Pokémon data is empty.");
  return { ...data, pokemon, count: pokemon.length };
}
