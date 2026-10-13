import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { sfx } from "./audio/sfx";
import { loadPokemon } from "./data/loadPokemon";
import { dateKey } from "./game/daily";
import { buildGameData, GameDataContext, type GameData } from "./game/GameData";
import { ALL_GENERATIONS, type Difficulty, type ModeId } from "./game/rules";
import type { RunCallbacks, RunRequest } from "./game/useRun";
import { useReducedMotion } from "./hooks/useReducedMotion";
import {
  completedOn,
  emptyDaily,
  loadDaily,
  progressOn,
  recordDaily,
  saveDaily,
  type DailyResult,
} from "./persistence/dailyRecord";
import { loadSettings, saveSettings, type Settings } from "./persistence/settings";
import { emptyStats, loadStats, recordRound, saveStats } from "./persistence/stats";
import { Header, type Screen } from "./ui/Header";
import { ModesScreen } from "./ui/ModesScreen";
import { DailyDone } from "./ui/play/DailyDone";
import { PlayScreen } from "./ui/play/PlayScreen";
import { PokedexScreen } from "./ui/PokedexScreen";
import { SettingsScreen } from "./ui/SettingsScreen";
import { StatsScreen } from "./ui/StatsScreen";

const SCREENS: Screen[] = ["play", "modes", "pokedex", "trainer", "options"];

function screenFromHash(): Screen {
  const id = window.location.hash.replace("#", "") as Screen;
  return SCREENS.includes(id) ? id : "play";
}

export function App() {
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPokemon()
      .then((dataset) => setData(buildGameData(dataset)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong loading the game."));
  }, []);

  if (error) {
    return (
      <main className="boot">
        <div className="textbox boot__box" role="alert">
          <p>The Pokédex couldn't be opened.</p>
          <p className="boot__detail">{error}</p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="boot" aria-busy="true">
        <p className="boot__loading pixel">Loading Pokédex…</p>
      </main>
    );
  }
  return (
    <GameDataContext.Provider value={data}>
      <Game />
      <Analytics />
    </GameDataContext.Provider>
  );
}

type AppRequest = RunRequest & { dailyDoneAtStart: DailyResult | null };

function Game() {
  const initial = useMemo(() => ({ settings: loadSettings(), stats: loadStats(), daily: loadDaily() }), []);
  const [settings, setSettings] = useState<Settings>(initial.settings.value);
  const [stats, setStats] = useState(initial.stats.value);
  const [daily, setDaily] = useState(initial.daily.value);
  const [repaired, setRepaired] = useState(
    initial.settings.repaired || initial.stats.repaired || initial.daily.repaired,
  );
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const [status, setStatus] = useState<{ score: number; streak: number } | null>(null);
  const [lastMode, setLastMode] = useState<ModeId>("classic");
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => void saveSettings(settings), [settings]);
  useEffect(() => void saveStats(stats), [stats]);
  useEffect(() => void saveDaily(daily), [daily]);

  useEffect(() => {
    sfx.enabled = settings.sound;
    sfx.volume = settings.volume;
  }, [settings.sound, settings.volume]);

  const reducedMotion = useReducedMotion(settings.motion);
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
  }, [reducedMotion]);

  // ---- Navigation (hash-based so Back works and links are shareable)
  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((next: Screen) => {
    sfx.play("select");
    if (window.location.hash !== `#${next}`) window.location.hash = next;
    setScreen(next);
  }, []);
  useEffect(() => {
    if (screen !== "play") mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screen]);

  // ---- Runs
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const dailyRef = useRef(daily);
  dailyRef.current = daily;
  const nextId = useRef(1);

  const makeRequest = useCallback((mode: ModeId): AppRequest => {
    const s = settingsRef.current;
    const today = dateKey(new Date());
    return {
      id: nextId.current++,
      options: {
        mode,
        difficulty: s.difficulty,
        generations: s.generations,
        challengeGenerations: s.challengeGenerations,
        timedSeconds: s.timedSeconds,
        hardcoreTimer: s.hardcoreTimer,
      },
      today,
      dailyResume: progressOn(dailyRef.current, today),
      dailyDoneAtStart: mode === "daily" ? completedOn(dailyRef.current, today) : null,
    };
  }, []);

  const [request, setRequest] = useState<AppRequest>(() => makeRequest("classic"));

  const startMode = useCallback(
    (mode: ModeId) => {
      setLastMode(mode);
      setRequest(makeRequest(mode));
      navigate("play");
    },
    [makeRequest, navigate],
  );

  // Changing difficulty or generations restarts an ongoing Classic run with the new rules.
  const ruleKey = `${settings.difficulty}|${settings.generations.join(",")}`;
  const firstRuleKey = useRef(ruleKey);
  useEffect(() => {
    if (ruleKey === firstRuleKey.current) return;
    firstRuleKey.current = ruleKey;
    setRequest((current) => (current.options.mode === "classic" ? makeRequest("classic") : current));
  }, [ruleKey, makeRequest]);

  const patchSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setDifficulty = useCallback((difficulty: Difficulty) => {
    setSettings((s) => ({
      ...s,
      difficulty,
      generations:
        difficulty === "easy" ? [1] : s.difficulty === "easy" ? [...ALL_GENERATIONS] : s.generations,
    }));
  }, []);

  // Written to storage straight away (not only via the save effects) so a
  // reload right after answering can't lose the round.
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const callbacks: RunCallbacks = useMemo(
    () => ({
      onRound: (record) => {
        const next = recordRound(statsRef.current, record);
        statsRef.current = next;
        saveStats(next);
        setStats(next);
      },
      onDaily: (result) => {
        const next = recordDaily(dailyRef.current, result);
        dailyRef.current = next;
        saveDaily(next);
        setDaily(next);
      },
      onDailyProgress: (progress) => {
        if (completedOn(dailyRef.current, progress.date)) return;
        const next = { ...dailyRef.current, progress };
        dailyRef.current = next;
        saveDaily(next);
        setDaily(next);
      },
    }),
    [],
  );

  const resetProgress = useCallback(() => {
    setStats(emptyStats());
    setDaily(emptyDaily());
  }, []);

  const dailyResult = completedOn(daily, request.today);
  const dailySummary = dailyResult ? (
    <DailyDone
      result={dailyResult}
      record={daily}
      today={request.today}
      onPlayClassic={() => startMode("classic")}
      onChangeMode={() => navigate("modes")}
    />
  ) : null;
  const showDailyDone = request.options.mode === "daily" && request.dailyDoneAtStart !== null;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <Header screen={screen} onNavigate={navigate} status={screen === "play" && !showDailyDone ? status : null} />

      <main id="main" className="main" ref={mainRef} tabIndex={-1}>
        {repaired && (
          <div className="notice" role="alert">
            <span>Some saved progress couldn't be read, so it was reset.</span>
            <button type="button" className="btn btn--small" onClick={() => setRepaired(false)}>
              OK
            </button>
          </div>
        )}

        <div hidden={screen !== "play"}>
          {showDailyDone ? (
            dailySummary
          ) : (
            <PlayScreen
              key={request.id}
              request={request}
              callbacks={callbacks}
              reducedMotion={reducedMotion}
              visible={screen === "play"}
              onStatus={setStatus}
              onPlayAgain={() => startMode(request.options.mode)}
              onChangeMode={() => navigate("modes")}
              dailySummary={dailySummary}
            />
          )}
        </div>

        {screen === "modes" && (
          <ModesScreen
            settings={settings}
            onSettings={patchSettings}
            onDifficulty={setDifficulty}
            daily={daily}
            today={dateKey(new Date())}
            initialMode={lastMode}
            onStart={startMode}
          />
        )}
        {screen === "pokedex" && <PokedexScreen discovered={stats.discovered} onPlay={() => navigate("play")} />}
        {screen === "trainer" && (
          <StatsScreen stats={stats} daily={daily} today={dateKey(new Date())} onPlay={() => navigate("play")} />
        )}
        {screen === "options" && (
          <SettingsScreen
            settings={settings}
            onSettings={patchSettings}
            onDifficulty={setDifficulty}
            onResetProgress={resetProgress}
          />
        )}
      </main>
    </div>
  );
}
