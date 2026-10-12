import type { ReactNode } from "react";
import { assetUrl } from "../../data/loadPokemon";
import type { Pokemon } from "../../data/types";
import type { RevealStep } from "../../game/useRun";
import type { Phase } from "../../game/run";

interface StageProps {
  pokemon: Pokemon;
  roundKey: string;
  phase: Phase;
  step: RevealStep;
  hud?: ReactNode;
  imageError: boolean;
  onSkip(): void;
  onRetryImage(): void;
  onReplaceImage?: () => void;
}

export function Stage({ pokemon, roundKey, phase, step, hud, imageError, onSkip, onRetryImage, onReplaceImage }: StageProps) {
  const revealing = phase === "revealing";
  const revealed = (revealing && step !== "hold") || phase === "result" || phase === "over";
  const named = (revealing && step === "named") || phase === "result" || phase === "over";
  const loading = phase === "loading" && !imageError;

  return (
    <section
      className={`stage ${revealed ? "stage--revealed" : "stage--mystery"}`}
      data-step={revealing ? step : phase}
      aria-label="Who's That Pokémon?"
      aria-busy={loading}
      onClick={revealing ? onSkip : undefined}
    >
      <div className="stage__rays" aria-hidden="true" />
      {hud && <div className="stage__hud">{hud}</div>}

      <h1 className="stage__title outlined" aria-hidden={named}>
        <span>Who's That</span> <span>Pokémon?</span>
      </h1>

      <div className="stage__art">
        {!imageError && (
          <img
            key={roundKey}
            className="stage__img"
            src={assetUrl(pokemon.image.path)}
            width={pokemon.image.width}
            height={pokemon.image.height}
            // The name is only exposed once it has been revealed.
            alt={revealed ? pokemon.name : "Mystery Pokémon silhouette"}
            draggable={false}
            decoding="async"
            style={{ visibility: loading ? "hidden" : "visible" }}
          />
        )}
      </div>

      <div className="stage__flash" aria-hidden="true" />

      {named && (
        <p className="stage__name outlined" key={roundKey}>
          It's {pokemon.name}!
        </p>
      )}

      {revealing && (
        <button
          type="button"
          className="stage__skip btn btn--small"
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
        >
          Skip
        </button>
      )}

      {imageError && (
        <div className="stage__error textbox" role="alert">
          <p>This Pokémon's picture didn't load.</p>
          <div className="stage__error-actions">
            <button type="button" className="btn btn--small btn--primary" onClick={onRetryImage}>
              Try again
            </button>
            {onReplaceImage && (
              <button type="button" className="btn btn--small" onClick={onReplaceImage}>
                Different Pokémon
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
