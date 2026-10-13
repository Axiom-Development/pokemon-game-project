import type { ReactNode } from "react";
import { Card, Dex, Flame, Gear, Menu, Play } from "./icons";

export type Screen = "play" | "modes" | "pokedex" | "trainer" | "options";

const NAV: { id: Screen; label: string; icon: ReactNode }[] = [
  { id: "play", label: "Play", icon: <Play size={20} /> },
  { id: "modes", label: "Modes", icon: <Menu size={20} /> },
  { id: "pokedex", label: "Pokédex", icon: <Dex size={20} /> },
  { id: "trainer", label: "Trainer", icon: <Card size={20} /> },
  { id: "options", label: "Options", icon: <Gear size={20} /> },
];

interface HeaderProps {
  screen: Screen;
  onNavigate(screen: Screen): void;
  status: { score: number; streak: number } | null;
}

export function Header({ screen, onNavigate, status }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a
          className="brand"
          href="#play"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("play");
          }}
        >
          <span className="brand__lens" aria-hidden="true" />
          <span className="brand__lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand__text">
            Who's That <span>Pokémon?</span>
          </span>
        </a>

        {status && (
          <div className="score" aria-label={`Score ${status.score}, streak ${status.streak}`}>
            <span className="score__item">
              <span className="score__label">Score</span>
              <span className="score__value pixel">{status.score.toLocaleString("en")}</span>
            </span>
            <span className="score__item score__item--streak">
              <Flame size={18} />
              <span className="score__value pixel">{status.streak}</span>
            </span>
          </div>
        )}

        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="nav__item"
              aria-current={screen === item.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.id);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
