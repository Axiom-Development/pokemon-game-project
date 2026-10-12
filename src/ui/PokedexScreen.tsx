import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl } from "../data/loadPokemon";
import type { Pokemon, PokemonStats } from "../data/types";
import { useGameData } from "../game/GameData";
import { formatDexNumber } from "../game/hints";
import { looseKey } from "../game/names";
import { PokemonFacts } from "./play/ResultBox";
import { roman } from "./GenerationPicker";
import { Mystery } from "./icons";

type StatusFilter = "all" | "found" | "missing";

const STAT_LABELS: [keyof PokemonStats, string][] = [
  ["hp", "HP"],
  ["attack", "Attack"],
  ["defense", "Defense"],
  ["specialAttack", "Sp. Atk"],
  ["specialDefense", "Sp. Def"],
  ["speed", "Speed"],
];
const STAT_MAX = 255;

function pct(n: number, d: number): string {
  return d === 0 ? "0%" : `${Math.floor((n / d) * 100)}%`;
}

export function PokedexScreen({ discovered, onPlay }: { discovered: number[]; onPlay(): void }) {
  const data = useGameData();
  const found = useMemo(() => new Set(discovered), [discovered]);
  const [query, setQuery] = useState("");
  const [gen, setGen] = useState<number | "all">("all");
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Pokemon | null>(null);
  const deferredQuery = useDeferredValue(query);

  const list = useMemo(() => {
    const q = deferredQuery.trim();
    const number = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
    const key = looseKey(q);
    return data.pokemon.filter((p) => {
      const isFound = found.has(p.id);
      if (gen !== "all" && p.generation !== gen) return false;
      if (status === "found" && !isFound) return false;
      if (status === "missing" && isFound) return false;
      // Types and names of undiscovered Pokémon stay secret.
      if (type !== "all" && (!isFound || !p.types.includes(type))) return false;
      if (q) {
        if (number !== null) return p.id === number;
        return isFound && looseKey(p.name).includes(key);
      }
      return true;
    });
  }, [data.pokemon, found, gen, type, status, deferredQuery]);

  const genProgress = useMemo(
    () =>
      data.generations.map((g) => {
        const members = data.pokemon.filter((p) => p.generation === g);
        return { gen: g, total: members.length, found: members.filter((p) => found.has(p.id)).length };
      }),
    [data, found],
  );

  const total = data.pokemon.length;
  const filtersOn = query || gen !== "all" || type !== "all" || status !== "all";

  return (
    <section className="dex" aria-labelledby="dex-title">
      <div className="dex__device">
        <header className="dex__top">
          <span className="dex__lens" aria-hidden="true" />
          <h2 id="dex-title" className="dex__title">
            Pokédex
          </h2>
          <p className="dex__count pixel">
            {found.size}/{total} <span className="dex__pct">{pct(found.size, total)}</span>
          </p>
        </header>

        <div className="dex__progress" role="list" aria-label="Completion by generation">
          {genProgress.map((g) => (
            <button
              key={g.gen}
              type="button"
              role="listitem"
              className="dex__gen"
              aria-pressed={gen === g.gen}
              onClick={() => setGen(gen === g.gen ? "all" : g.gen)}
              aria-label={`Generation ${g.gen}: ${g.found} of ${g.total} discovered. Filter`}
            >
              <span className="dex__gen-name pixel">{roman(g.gen)}</span>
              <span className="dex__bar" aria-hidden="true">
                <span style={{ width: pct(g.found, g.total) }} />
              </span>
              <span className="dex__gen-count pixel">
                {g.found}/{g.total}
              </span>
            </button>
          ))}
        </div>

        <div className="dex__filters">
          <label className="dex__search">
            <span className="sr-only">Search by name or number</span>
            <input
              type="search"
              value={query}
              placeholder="Search name or #"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            <span className="sr-only">Generation</span>
            <select value={gen} onChange={(e) => setGen(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">All generations</option>
              {data.generations.map((g) => (
                <option key={g} value={g}>
                  Generation {roman(g)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>
              {data.dataset.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">Seen &amp; unseen</option>
              <option value="found">Discovered</option>
              <option value="missing">Not yet</option>
            </select>
          </label>
        </div>

        <div className="dex__screen">
          {list.length === 0 ? (
            <div className="dex__empty">
              {found.size === 0 && !filtersOn ? (
                <>
                  <p>Your Pokédex is empty.</p>
                  <button type="button" className="btn btn--primary" onClick={onPlay}>
                    Start guessing
                  </button>
                </>
              ) : (
                <p>{found.size === 0 ? "Nothing discovered yet — name a Pokémon to fill this in." : "No matches. Try a different filter."}</p>
              )}
            </div>
          ) : (
            <ul className="dex__grid" aria-label={`${list.length} entries`}>
              {list.map((p) =>
                found.has(p.id) ? (
                  <li key={p.id}>
                    <button type="button" className="dex__cell is-found" onClick={() => setSelected(p)}>
                      <span className="dex__num pixel">{formatDexNumber(p.id)}</span>
                      <img src={assetUrl(p.image.path)} alt="" loading="lazy" decoding="async" width={96} height={96} />
                      <span className="dex__name">{p.name}</span>
                    </button>
                  </li>
                ) : (
                  <li key={p.id}>
                    <div className="dex__cell is-missing" aria-label={`${formatDexNumber(p.id)}, not discovered`}>
                      <span className="dex__num pixel">{formatDexNumber(p.id)}</span>
                      <Mystery size={40} />
                      <span className="dex__name">???</span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>

      {selected && <DexEntry pokemon={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function DexEntry({ pokemon, onClose }: { pokemon: Pokemon; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="entry"
      aria-labelledby="entry-name"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="entry__inner">
        <div className="entry__head">
          <span className="pixel">{formatDexNumber(pokemon.id)}</span>
          <h3 id="entry-name">{pokemon.name}</h3>
          <button type="button" className="btn btn--small" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        <div className="entry__body">
          <div className="entry__art">
            <img src={assetUrl(pokemon.image.path)} alt={pokemon.name} width={pokemon.image.width} height={pokemon.image.height} />
          </div>
          <div className="entry__info">
            <PokemonFacts pokemon={pokemon} />
            <table className="entry__stats">
              <caption className="sr-only">Base stats</caption>
              <tbody>
                {STAT_LABELS.map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td className="pixel">{pokemon.stats[key]}</td>
                    <td className="entry__bar" aria-hidden="true">
                      <span style={{ width: `${(pokemon.stats[key] / STAT_MAX) * 100}%` }} />
                    </td>
                  </tr>
                ))}
                <tr className="entry__total">
                  <th scope="row">Total</th>
                  <td className="pixel">{pokemon.baseStatTotal}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </dialog>
  );
}
