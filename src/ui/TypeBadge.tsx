const DARK_TEXT = new Set(["Electric", "Ice", "Ground", "Steel", "Fairy", "Normal", "Bug", "Rock", "Grass"]);

export function TypeBadge({ type }: { type: string }) {
  const key = type.toLowerCase();
  return (
    <span
      className="type-badge"
      style={{
        background: `var(--t-${key}, var(--ink-soft))`,
        color: DARK_TEXT.has(type) ? "var(--ink)" : "var(--white)",
      }}
    >
      {type}
    </span>
  );
}

export function TypeList({ types }: { types: string[] }) {
  return (
    <span className="type-list">
      {types.map((t) => (
        <TypeBadge key={t} type={t} />
      ))}
    </span>
  );
}
