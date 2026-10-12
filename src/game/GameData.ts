import { createContext, useContext } from "react";
import type { Pokemon, PokemonDataset } from "../data/types";
import { NameIndex } from "./names";

export interface GameData {
  dataset: PokemonDataset;
  pokemon: Pokemon[];
  byId: ReadonlyMap<number, Pokemon>;
  ids: number[];
  maxId: number;
  names: NameIndex;
  /** Generations that actually exist in the dataset. */
  generations: number[];
}

export function buildGameData(dataset: PokemonDataset): GameData {
  const pokemon = dataset.pokemon;
  return {
    dataset,
    pokemon,
    byId: new Map(pokemon.map((p) => [p.id, p])),
    ids: pokemon.map((p) => p.id),
    maxId: pokemon.reduce((m, p) => Math.max(m, p.id), 0),
    names: new NameIndex(pokemon.map((p) => p.name)),
    generations: [...new Set(pokemon.map((p) => p.generation))].sort((a, b) => a - b),
  };
}

export const GameDataContext = createContext<GameData | null>(null);

export function useGameData(): GameData {
  const data = useContext(GameDataContext);
  if (!data) throw new Error("GameDataContext missing");
  return data;
}
