# Who's That Pokémon?

A browser game built around the anime's "Who's That Pokémon?" segment. A black silhouette sits on a ray-burst title card. You guess the name, the rays wind up, the screen flashes white, and the reveal reads *"It's Pikachu!"*

React + TypeScript + Vite. It needs no backend and makes no runtime API calls: all Pokémon data and artwork ship with the project.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # typecheck + build into dist/
npm run preview    # serve dist/ on http://localhost:4173
```

`dist/` is fully self-contained, with relative paths throughout, so it can be hosted from any folder or sub-path. It must be served over HTTP: browsers block ES modules and `fetch` from `file://`.

## Source assets and the asset pipeline

The two uploaded files are the source of truth:

| File | Location | In git? |
|---|---|---|
| `Data Set - NOT NORMALISED - pokemon.csv` | `source_assets/` (read-only) | yes |
| `images.zip` (132 MB) | `source_assets/` (read-only) | **no**: over GitHub's 100 MB file limit |

`tools/process_assets.py` (Python 3, standard library only) is the repeatable pipeline:

```bash
npm run assets     # or: python3 tools/process_assets.py [--csv PATH] [--archive PATH]
```

It finds the CSV and zip in `source_assets/` without assuming their names, then:

1. Reads the CSV and infers and validates its schema (required columns, numbers, booleans, the 18 types, stat ranges, unique number/name/slug, Pokédex gaps).
2. Extracts the zip safely into `build/extracted/`, rejecting path traversal and symlinks and checking every CRC.
3. Discovers the folder layout and image types without assuming either.
4. Validates every PNG fully: signature, every chunk CRC, IHDR, and complete IDAT decompression to the exact expected size. It also checks scanline filters and detects transparency.
5. Matches records to artwork via the CSV's `image_path`. The fallbacks are filename, then Pokédex number (with slug tie-break). It reports mismatched numbers or slugs, missing, duplicate (by number and byte-identical), orphaned and corrupted files.
6. Copies artwork byte-for-byte to `public/assets/pokemon/`. There's no re-encoding, so transparency, resolution and aspect ratio are untouched. Files get **opaque content-hash names**, so an image URL never gives away the answer. `reports/artwork-mapping.json` maps each copy back to its archive filename.
7. Writes the normalised dataset `public/data/pokemon.json` (typed numbers and booleans, a `types[]` array, a `stats{}` object, image size and alpha) and the reports `reports/asset-validation.{md,json}`.
8. Re-hashes both source files at the end to prove they weren't modified.

It exits non-zero if any errors are found. The repo already contains its output, so you only need the zip to *regenerate* assets. Put it back in `source_assets/` first.

### Validation summary (current assets)

- **CSV:** 1,025 rows, 23 columns, Pokédex #1–#1025 with no gaps or duplicates.
- **Data:** generations 1–9 and all 18 types. `type_2` is empty for 499 single-type Pokémon; every other column is fully populated. There's one row per species and **no alternate forms**.
- **Archive:** a single `images/` folder of 1,025 PNGs named `NNNN_slug.png`.
- **Matching:** all 1,025 matched through `image_path`, with number and slug cross-checks passing.
- **Images:** all 475×475 RGBA with transparency. Nothing is corrupted, duplicated, missing or orphaned.
- **Result:** 0 errors, 0 warnings. See `reports/asset-validation.md`.
- **Excluded field:** `image_url` (a PokeAPI link) is consistency-checked but deliberately left out of the game data, so gameplay never depends on it.

## Search engines and sharing

- **Built in:** `index.html` carries the title, description, Open Graph/Twitter preview tags (`public/og-image.png`), icons and a web manifest. It also includes a short readable description inside `#root` for crawlers, which React replaces when the game starts.
- **Added at build time** by the `seo` plugin in `vite.config.ts`, using the site's public address:
  - canonical link
  - absolute image URLs
  - `VideoGame` structured data (JSON-LD)
  - `robots.txt`
  - `sitemap.xml`
- **The address** comes from `SITE_URL` if set (use this for a custom domain), otherwise from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`.
- **Previews:** preview deployments are marked `noindex` and disallowed in `robots.txt`, so only production is indexed.
- **Search Console:** set `GOOGLE_SITE_VERIFICATION` to add Google's verification meta tag.

## Game modes

| Mode | Rules |
|---|---|
| **Classic** | Endless, using the chosen difficulty and generations. Changing either restarts the run. |
| **Timed Challenge** | 30, 60 or 120 seconds. The clock starts at the first silhouette, and reveals are quick and auto-advance. |
| **Generation Challenge** | 10 Pokémon from the generations you tick, then a results screen. |
| **Survival** | 3 lives and one answer per Pokémon. Each wrong answer costs a life. |
| **Daily Pokémon** | Same Pokémon for everyone on a given local date (FNV-1a hash of the date). 3 guesses, scored once. Reloading keeps your guesses. Tracks a daily streak. |
| **Hardcore** | No suggestions, no hints, 2 guesses, optional 15 s timer, ×1.5 score. Strict spelling: case, accents and apostrophe style are forgiven, but `Mr. Mime`, `Ho-Oh` and `Type: Null` need their punctuation. |

### Difficulty (Classic, Timed, Generation, Survival)

| | Guesses | Suggestions | Hints | Timer | Generations |
|---|---|---|---|---|---|
| Easy | 3 | from 2 letters, 6 shown | 5 | none | defaults to Gen I |
| Normal | 3 | from 2 letters, 6 shown | 3 | none | your pick |
| Hard | 2 | from 4 letters, 3 shown | 1 | none | your pick |
| Expert | 2 | off | 0 | 20 s per Pokémon | all |

Survival always allows one answer per Pokémon, and the Timed run clock replaces the per-round timer.

### Answers

Lenient matching ignores case, accents, spaces and punctuation, so `mr mime`, `farfetchd`, `ho oh`, `flabebe`, `type null` and `nidoran f` / `nidoran female` all count. The tests check that every name in the dataset keeps a unique key under these rules.

Outside Hardcore, three kinds of input don't use up a guess: names that aren't a Pokémon, repeats, and empty input. Suggestions are alphabetical and come from the active pool, so their order never hints at the answer.

### Scoring

| Event | Points |
|---|---|
| Correct on 1st / 2nd / 3rd+ try | 100 / 70 / 40 |
| Each hint | −15 (a correct answer is always worth at least 10) |
| Streak bonus | +10 per consecutive correct answer after the first, capped at +50 |
| Hardcore | base × 1.5 |
| Daily | no streak bonus |

Hints, from vague to specific: generation → primary type → second type → Pokédex band of 50 → height and weight → category. Hints only use data that exists in the dataset.

Each hint also reveals one more letter of the name, shown as tiles (`P _ _ _ _ _ _`), up to three letters. At least two letters always stay hidden, so short names like Mew only ever show their first letter. Spaces and punctuation are visible from the first hint.

## Progress and storage

Everything lives in `localStorage` under versioned keys (`wtp.settings.v1`, `wtp.stats.v1`, `wtp.daily.v1`).

- **Validation:** every load is checked field by field. Corrupt or tampered data is repaired to safe values and the player gets a short notice instead of a crash.
- **No double counting:** rounds are recorded once, keyed by round ID, and a daily result is recorded once per date.
- **What's tracked:** stats come only from real play. They are:
  - rounds, correct, missed, accuracy and guesses
  - current and best streak, and the fastest correct answer
  - time spent answering
  - per-generation accuracy, the daily streak, and Pokédex discoveries

## Project layout

```
source_assets/          original uploads (read-only; zip not in git)
tools/process_assets.py asset pipeline
reports/                validation report + artwork mapping
public/data/            generated pokemon.json
public/assets/pokemon/  generated artwork (hashed names)
src/
  data/                 dataset types + loader
  assets/               image preloading (current + next only)
  game/                 rules, run state machine, scoring, names, hints, daily, RNG, useRun hook
  persistence/          localStorage wrapper, settings, stats, daily record
  audio/                Web Audio synthesised sound effects
  hooks/                clock + reduced-motion hooks
  ui/                   screens and components (Stage = the reveal)
  styles/               tokens, base, layout, stage, play, screens
tests/e2e/              Playwright end-to-end tests
```

The round logic is a pure reducer (`src/game/run.ts`): `loading → guessing → revealing → result → over`. Each phase accepts only its own actions, so double submissions and out-of-order clicks are no-ops by construction.

## Tests

```bash
npm test                          # 71 unit tests (Vitest): matching, scoring, rules, run flow, daily, persistence
npm run build && npm run test:e2e # 18 end-to-end tests (Playwright) against the production build
```

The end-to-end suite runs against Playwright's bundled Chromium (`npx playwright install chromium`). To use an installed Chrome instead, run it as `PW_CHANNEL=chrome npm run test:e2e`.

It covers:

- **Answer secrecy:** the silhouette stays secret (filter, alt text and URL).
- **Guessing:** wrong, unknown and correct answers, and rapid double submissions.
- **Controls:** the autocomplete keyboard flow, and the reveal sequence and skip.
- **Persistence:** stats survive a reload, the Pokédex keeps undiscovered entries secret, and corrupted saves are repaired.
- **Modes:** Timed expiry, Survival game over, Generation filtering, Hardcore restrictions, and Daily consistency, reload-resume and one-time scoring.
- **Defaults and layout:** Easy defaults to Gen I, and there's no horizontal overflow on a phone.

## Design notes

The art direction is a Gen-3 handheld (FireRed/LeafGreen) crossed with the anime title card. It deliberately isn't a web app.

- **Colour:** Pokémon Yellow and Blue lead; Red is kept for the Guess button and the Pokédex shell. Everything uses solid fills with 3px ink outlines and flat offset shadows. There are no gradients beyond the hard-edged ray stripes, no glass effects and no glows.
- **Type:** Lilita One for display, Rubik for UI text, and Silkscreen strictly for numbers and readouts. All three are OFL-licensed and bundled locally.
- **Screens:**
  - The guess input lives in a dialogue box.
  - Modes is a start-menu list with a ▶ cursor.
  - Stats is a Trainer Card.
  - Settings is an Options menu.
  - The Pokédex is a red device frame.
- **Icons:** all hand-drawn SVGs; no icon library or emoji.
- **Motion:** only the reveal really animates (rays wind up, white flash, name pops in). The "Reduced motion" setting and the OS preference both swap this for an instant reveal.
- **Sound:** original chiptune blips synthesised with Web Audio, with no recorded audio. It's off until the first user interaction, and there's a toggle and volume control. No music is included.

## Known limitations

- **Artwork rights:** the official artwork belongs to Nintendo / Game Freak / The Pokémon Company. This project is for personal use and shouldn't be published publicly.
- **Client-side answers:** a determined player can find the answer in dev tools by matching the hashed image against `pokemon.json`. Normal play never reveals it.
- **Pokédex image weight:** the Pokédex lazy-loads the full 475 px artwork (about 125 KB each), because no image library was available to make thumbnails. Scrolling the full list on mobile data downloads a fair amount.
- **No forms:** the dataset has one entry per species, so regional and alternate forms aren't part of the game.
- **Timed clock:** the clock keeps running if you switch screens mid-run.
- **Accessibility testing:** screen-reader support (labels, live regions, combobox and dialog roles) was checked through the automated accessibility tree, not with a physical screen reader. Sound effects were not checked by ear.
- **Daily date:** the daily challenge uses the device's local date.
