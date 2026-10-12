/**
 * localStorage wrapper. Every read is sanitised field by field, so corrupted
 * or outdated saves fall back to defaults instead of crashing the game.
 */

export interface Loaded<T> {
  value: T;
  /** True when something was stored but could not be fully read. */
  repaired: boolean;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage disabled (privacy mode, sandboxed iframe)
  }
}

export function load<T>(
  key: string,
  sanitise: (raw: unknown) => { value: T; repaired: boolean },
  fallback: () => T,
  store: KeyValueStore | null = defaultStore(),
): Loaded<T> {
  let text: string | null = null;
  try {
    text = store?.getItem(key) ?? null;
  } catch {
    return { value: fallback(), repaired: false };
  }
  if (text === null) return { value: fallback(), repaired: false };
  try {
    return sanitise(JSON.parse(text));
  } catch {
    return { value: fallback(), repaired: true };
  }
}

export function save(key: string, value: unknown, store: KeyValueStore | null = defaultStore()): boolean {
  try {
    store?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota exceeded or storage unavailable — keep playing
  }
}

export function remove(key: string, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Helpers for sanitisers. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FieldReader {
  repaired = false;
  constructor(private readonly raw: Record<string, unknown>) {}

  count(key: string, fallback = 0): number {
    const v = this.raw[key];
    if (v === undefined) return fallback;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
    this.repaired = true;
    return fallback;
  }

  nullableCount(key: string): number | null {
    const v = this.raw[key];
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    this.repaired = true;
    return null;
  }

  oneOf<T extends string | number | boolean>(key: string, options: readonly T[], fallback: T): T {
    const v = this.raw[key];
    if (v === undefined) return fallback;
    if (options.includes(v as T)) return v as T;
    this.repaired = true;
    return fallback;
  }

  number(key: string, min: number, max: number, fallback: number): number {
    const v = this.raw[key];
    if (v === undefined) return fallback;
    if (typeof v === "number" && Number.isFinite(v)) return Math.min(max, Math.max(min, v));
    this.repaired = true;
    return fallback;
  }

  dateKey(key: string): string | null {
    const v = this.raw[key];
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    this.repaired = true;
    return null;
  }

  intList(key: string, min: number, max: number, fallback: number[]): number[] {
    const v = this.raw[key];
    if (v === undefined) return fallback;
    if (!Array.isArray(v)) {
      this.repaired = true;
      return fallback;
    }
    const ok = v.filter((n): n is number => Number.isInteger(n) && n >= min && n <= max);
    if (ok.length !== v.length) this.repaired = true;
    return [...new Set(ok)].sort((a, b) => a - b);
  }

  record(key: string): Record<string, unknown> {
    const v = this.raw[key];
    if (v === undefined) return {};
    if (isRecord(v)) return v;
    this.repaired = true;
    return {};
  }
}
