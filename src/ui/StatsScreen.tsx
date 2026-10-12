import { useGameData } from "../game/GameData";
import { liveStreak, type DailyRecord } from "../persistence/dailyRecord";
import { accuracy, type Stats } from "../persistence/stats";
import { roman } from "./GenerationPicker";
import { PokeBall } from "./icons";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (totalMinutes > 0) return `${m} min`;
  return `${Math.floor(ms / 1000)} s`;
}

function formatSeconds(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
}

interface StatsScreenProps {
  stats: Stats;
  daily: DailyRecord;
  today: string;
  onPlay(): void;
}

export function StatsScreen({ stats, daily, today, onPlay }: StatsScreenProps) {
  const data = useGameData();
  const total = data.pokemon.length;
  const dexPct = total ? stats.discovered.length / total : 0;

  const rows: [string, string][] = [
    ["Rounds played", stats.roundsPlayed.toLocaleString("en")],
    ["Correct", stats.correct.toLocaleString("en")],
    ["Missed", stats.incorrect.toLocaleString("en")],
    ["Accuracy", formatPercent(accuracy(stats.correct, stats.roundsPlayed))],
    ["Guesses made", stats.guessesSubmitted.toLocaleString("en")],
    ["Current streak", String(stats.currentStreak)],
    ["Best streak", String(stats.bestStreak)],
    ["Fastest answer", formatSeconds(stats.fastestCorrectMs)],
    ["Time played", formatDuration(stats.playtimeMs)],
    ["Daily streak", `${liveStreak(daily, today)} (best ${daily.bestStreak})`],
    ["Dailies solved", `${daily.solved} of ${daily.played}`],
  ];

  return (
    <section className="trainer" aria-labelledby="trainer-title">
      <div className="trainer__card">
        <header className="trainer__head">
          <h2 id="trainer-title">Trainer Card</h2>
          <PokeBall size={30} />
        </header>

        {stats.roundsPlayed === 0 ? (
          <div className="trainer__empty">
            <p>No rounds on the card yet. Every Pokémon you name gets recorded here.</p>
            <button type="button" className="btn btn--primary" onClick={onPlay}>
              Play a round
            </button>
          </div>
        ) : (
          <div className="trainer__body">
            <dl className="trainer__rows">
              {rows.map(([label, value]) => (
                <div key={label} className="trainer__row">
                  <dt>{label}</dt>
                  <dd className="pixel">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="trainer__side">
              <div className="trainer__dex">
                <span className="trainer__dex-label">Pokédex</span>
                <span className="trainer__dex-num pixel">
                  {stats.discovered.length}
                  <small>/{total}</small>
                </span>
                <span className="trainer__meter" aria-hidden="true">
                  <span style={{ width: `${dexPct * 100}%` }} />
                </span>
                <span className="sr-only">{Math.floor(dexPct * 100)}% complete</span>
              </div>

              <h3 className="trainer__sub">Accuracy by generation</h3>
              <ul className="trainer__badges">
                {data.generations.map((g) => {
                  const tally = stats.byGeneration[String(g)];
                  const played = tally?.played ?? 0;
                  return (
                    <li key={g} className={`badge ${played ? "is-earned" : ""}`}>
                      <span className="badge__gen pixel">{roman(g)}</span>
                      <span className="badge__value pixel">{played ? formatPercent(accuracy(tally!.correct, played)) : "—"}</span>
                      <span className="sr-only">
                        Generation {g}: {played ? `${tally!.correct} of ${played} correct` : "not played"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
