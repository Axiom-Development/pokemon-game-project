/**
 * Hand-drawn icon set: thick ink outlines to match the UI borders.
 * All icons are decorative (aria-hidden); controls carry their own labels.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export function PokeBall({ empty = false, ...props }: IconProps & { empty?: boolean }) {
  return (
    <Svg {...props}>
      <path d="M2.5 12a9.5 9.5 0 0 1 19 0Z" fill={empty ? "#d9d4c4" : "var(--red)"} />
      <path d="M2.5 12a9.5 9.5 0 0 0 19 0Z" fill={empty ? "#efe9d6" : "#fff"} />
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <path d="M2.5 12h6.3M15.2 12h6.3" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.1" fill="#fff" stroke="var(--ink)" strokeWidth="2" />
    </Svg>
  );
}

export function Flame(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12.4 2.5c.6 3.2 4.9 5.6 4.9 10.6a5.3 5.3 0 0 1-10.6 0c0-2.6 1.4-4.1 2.3-5.2.3 1.4 1 2.3 1.9 2.6-.4-3 .1-5.7 1.5-8Z"
        fill="var(--red)"
        stroke="var(--ink)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 21c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.4-2.6 2.2-4 .9 1.5 3.2 2.3 3.2 4 0 1.5-1.1 2.6-2.7 2.6Z" fill="var(--yellow)" />
    </Svg>
  );
}

export function Clock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="13" r="8.5" fill="#fff" stroke="var(--ink)" strokeWidth="2" />
      <path d="M12 8.5V13l3 2" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9.5 2.5h5" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

export function Play(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5v15l12-7.5Z" fill="currentColor" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}

export function Menu(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#fff" stroke="var(--ink)" strokeWidth="2" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h6" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function Dex(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="2.5" width="16" height="19" rx="2.5" fill="var(--red)" stroke="var(--ink)" strokeWidth="2" />
      <rect x="7" y="8" width="10" height="7.5" rx="1" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" />
      <circle cx="8" cy="5.4" r="1.4" fill="var(--blue)" stroke="var(--ink)" strokeWidth="1.2" />
      <path d="M8 18.5h3" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function Card(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="8" cy="11" r="2.3" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" />
      <path d="M4.9 16.2c.6-1.6 1.8-2.4 3.1-2.4s2.5.8 3.1 2.4" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
      <path d="M13.5 10h5M13.5 13.5h4" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function Gear(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="m10.3 2.8-.5 2.3a7 7 0 0 0-1.9 1.1l-2.2-.8-1.7 3 1.8 1.5a7 7 0 0 0 0 2.2l-1.8 1.5 1.7 3 2.2-.8a7 7 0 0 0 1.9 1.1l.5 2.3h3.4l.5-2.3a7 7 0 0 0 1.9-1.1l2.2.8 1.7-3-1.8-1.5a7 7 0 0 0 0-2.2l1.8-1.5-1.7-3-2.2.8a7 7 0 0 0-1.9-1.1l-.5-2.3Z"
        fill="#fff"
        stroke="var(--ink)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" fill="var(--blue)" stroke="var(--ink)" strokeWidth="1.8" />
    </Svg>
  );
}

export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4.5 12.5 4.5 4.5 10.5-10.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Cross(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </Svg>
  );
}

export function Bulb(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.6.4.9 1 .9 1.6V17h5v-1.5c0-.6.3-1.2.9-1.6A6 6 0 0 0 12 3Z" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.8 20h4.4" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function Speaker({ muted = false, ...props }: IconProps & { muted?: boolean }) {
  return (
    <Svg {...props}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" fill="#fff" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
      {muted ? (
        <path d="m15.5 9.5 5 5m0-5-5 5" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M15.5 9a4 4 0 0 1 0 6M17.8 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      )}
    </Svg>
  );
}

/** Mystery mark for undiscovered Pokédex entries. */
export function Mystery(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.4" />
      <path d="M9.4 9.6a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.9v.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.3" fill="currentColor" />
    </Svg>
  );
}
