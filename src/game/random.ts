/** FNV-1a 32-bit string hash — stable across browsers and versions. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Shuffle-bag draw: every Pokémon in the pool appears once before any repeats,
 * and a new bag never starts with the Pokémon that ended the previous one.
 */
export class Deck<T> {
  private bag: T[] = [];
  private last: T | undefined;

  constructor(
    private readonly items: readonly T[],
    private readonly random: () => number = Math.random,
  ) {
    if (items.length === 0) throw new Error("Cannot draw from an empty pool.");
  }

  draw(): T {
    if (this.bag.length === 0) {
      this.bag = shuffle(this.items, this.random);
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) {
        this.bag.unshift(this.bag.pop()!);
      }
    }
    this.last = this.bag.pop()!;
    return this.last;
  }
}
