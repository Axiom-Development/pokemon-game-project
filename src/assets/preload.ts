import { assetUrl } from "../data/loadPokemon";

const cache = new Map<string, Promise<void>>();

/**
 * Fetch and decode an artwork file once. Only the current and next Pokémon
 * are preloaded — nothing is decoded in bulk at startup.
 */
export function preloadArtwork(path: string): Promise<void> {
  const url = assetUrl(path);
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (typeof img.decode === "function") img.decode().then(() => resolve(), () => resolve());
        else resolve();
      };
      img.onerror = () => reject(new Error(`Artwork failed to load: ${url}`));
      img.src = url;
    });
    pending.catch(() => cache.delete(url)); // allow a retry later
    cache.set(url, pending);
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return pending;
}
