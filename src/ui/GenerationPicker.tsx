const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function roman(gen: number): string {
  return ROMAN[gen - 1] ?? String(gen);
}

interface GenerationPickerProps {
  available: number[];
  selected: number[];
  onChange(generations: number[]): void;
  disabled?: boolean;
  label: string;
}

export function GenerationPicker({ available, selected, onChange, disabled, label }: GenerationPickerProps) {
  const all = available.every((g) => selected.includes(g));
  const toggle = (gen: number) => {
    const next = selected.includes(gen) ? selected.filter((g) => g !== gen) : [...selected, gen];
    // At least one generation must stay selected.
    if (next.length) onChange(next.sort((a, b) => a - b));
  };

  return (
    <fieldset className="gen-picker" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <div className="gen-picker__grid">
        {available.map((gen) => (
          <button
            key={gen}
            type="button"
            className="gen-picker__gen"
            aria-pressed={selected.includes(gen)}
            aria-label={`Generation ${gen}`}
            onClick={() => toggle(gen)}
          >
            {roman(gen)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--link gen-picker__all"
        onClick={() => onChange(all ? [available[0] ?? 1] : [...available])}
      >
        {all ? "Just Gen I" : "Select all"}
      </button>
    </fieldset>
  );
}
