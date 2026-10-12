import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PokemonDataset } from "../data/types";
import { isCorrectGuess, looseKey, NameIndex, suggestNames } from "./names";

const dataset = JSON.parse(
  readFileSync(new URL("../../public/data/pokemon.json", import.meta.url), "utf8"),
) as PokemonDataset;
const names = dataset.pokemon.map((p) => p.name);
const nameOf = (id: number) => dataset.pokemon.find((p) => p.id === id)!.name;

describe("lenient matching", () => {
  it.each([
    ["mr mime", "Mr. Mime"],
    ["MR.MIME", "Mr. Mime"],
    ["farfetchd", nameOf(83)],
    ["Farfetch'd", nameOf(83)],
    ["ho oh", "Ho-Oh"],
    ["hooh", "Ho-Oh"],
    ["flabebe", "Flabébé"],
    ["FLABÉBÉ", "Flabébé"],
    ["type null", "Type: Null"],
    ["nidoran f", "Nidoran♀"],
    ["Nidoran female", "Nidoran♀"],
    ["nidoran-m", "Nidoran♂"],
    ["  pikachu  ", "Pikachu"],
    ["porygon z", "Porygon-Z"],
  ])("%s → %s", (guess, name) => {
    expect(isCorrectGuess(guess, name, false)).toBe(true);
  });

  it("rejects near misses and empty input", () => {
    expect(isCorrectGuess("nidorino", "Nidorina", false)).toBe(false);
    expect(isCorrectGuess("nidoran m", "Nidoran♀", false)).toBe(false);
    expect(isCorrectGuess("", "Mew", false)).toBe(false);
    expect(isCorrectGuess("...", "Mew", false)).toBe(false);
  });

  it("gives every Pokémon in the dataset a unique lenient key", () => {
    const keys = new Set(names.map(looseKey));
    expect(keys.size).toBe(names.length);
  });

  it("matches every dataset name against itself and its slug", () => {
    for (const p of dataset.pokemon) {
      expect(isCorrectGuess(p.name, p.name, false)).toBe(true);
      expect(isCorrectGuess(p.slug, p.name, false)).toBe(true);
      expect(isCorrectGuess(p.name, p.name, true)).toBe(true);
    }
  });
});

describe("strict matching (Hardcore)", () => {
  it("forgives case, accents and apostrophe style only", () => {
    expect(isCorrectGuess("mr. mime", "Mr. Mime", true)).toBe(true);
    expect(isCorrectGuess("Flabebe", "Flabébé", true)).toBe(true);
    expect(isCorrectGuess("Farfetch'd", "Farfetch’d", true)).toBe(true);
    expect(isCorrectGuess("ho-oh", "Ho-Oh", true)).toBe(true);
    expect(isCorrectGuess("Nidoran-F", "Nidoran♀", true)).toBe(true);
  });

  it("requires punctuation and spacing", () => {
    expect(isCorrectGuess("mr mime", "Mr. Mime", true)).toBe(false);
    expect(isCorrectGuess("hooh", "Ho-Oh", true)).toBe(false);
    expect(isCorrectGuess("type null", "Type: Null", true)).toBe(false);
    expect(isCorrectGuess("Farfetchd", "Farfetch’d", true)).toBe(false);
  });
});

describe("NameIndex and suggestions", () => {
  const index = new NameIndex(names);

  it("knows real names regardless of formatting", () => {
    expect(index.isKnown("mr mime")).toBe(true);
    expect(index.isKnown("Pikachoo")).toBe(false);
  });

  it("orders suggestions alphabetically, prefix matches first", () => {
    expect(suggestNames("pi", ["Pikachu", "Pichu", "Spinda", "Pidgey"], 6, 2)).toEqual([
      "Pichu",
      "Pidgey",
      "Pikachu",
      "Spinda",
    ]);
  });

  it("respects minimum length and limit", () => {
    expect(suggestNames("p", names, 6, 2)).toEqual([]);
    expect(suggestNames("char", names, 3, 2)).toHaveLength(3);
  });
});
