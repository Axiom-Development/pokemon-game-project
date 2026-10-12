import { assetUrl } from "../../data/loadPokemon";
import { useGameData } from "../../game/GameData";
import { useNow } from "../../hooks/useNow";
import type { DailyRecord, DailyResult } from "../../persistence/dailyRecord";
import { liveStreak } from "../../persistence/dailyRecord";
import { Check, Cross, Flame } from "../icons";
import { PokemonFacts } from "./ResultBox";

function untilMidnight(now: number): string {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const mins = Math.max(0, Math.ceil((midnight - now) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

interface DailyDoneProps {
  result: DailyResult;
  record: DailyRecord;
  today: string;
  onPlayClassic(): void;
  onChangeMode(): void;
}

export function DailyDone({ result, record, today, onPlayClassic, onChangeMode }: DailyDoneProps) {
  const data = useGameData();
  const now = useNow(true, 30000);
  const p = data.byId.get(result.pokemonId);
  if (!p) return null;
  const streak = liveStreak(record, today);

  return (
    <section className="daily-done panel" aria-labelledby="daily-title">
      <div className="panel__bar">
        <h2 id="daily-title">Daily Pokémon</h2>
        <span className="pixel">{today}</span>
      </div>
      <div className="daily-done__body">
        <div className="daily-done__art stage--revealed" aria-hidden="true">
          <div className="stage__rays" />
          <img src={assetUrl(p.image.path)} alt="" width={p.image.width} height={p.image.height} />
        </div>
        <div className="daily-done__info">
          <p className={`result__verdict ${result.solved ? "is-good" : "is-bad"}`}>
            <span className="result__icon">{result.solved ? <Check size={22} /> : <Cross size={22} />}</span>
            {result.solved
              ? `${result.guesses === 1 ? "First try!" : `Got it in ${result.guesses} tries!`} It's ${p.name}.`
              : `Today's Pokémon was ${p.name}.`}
          </p>
          <PokemonFacts pokemon={p} />
          <dl className="summary__stats">
            <div>
              <dt>Points</dt>
              <dd>{result.points}</dd>
            </div>
            <div>
              <dt>Daily streak</dt>
              <dd className="with-icon">
                <Flame size={18} /> {streak}
              </dd>
            </div>
            <div>
              <dt>Best</dt>
              <dd>{record.bestStreak}</dd>
            </div>
          </dl>
          <p className="daily-done__next">
            Next Pokémon in <strong className="pixel">{untilMidnight(now)}</strong>
          </p>
          <div className="summary__actions">
            <button type="button" className="btn btn--primary" onClick={onPlayClassic}>
              Play Classic
            </button>
            <button type="button" className="btn" onClick={onChangeMode}>
              Other modes
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
