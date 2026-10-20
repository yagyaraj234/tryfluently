const feather =
  "M-2 -10Q0 -11.5 2 -10C8 -16 16 -24 16.5 -31C17 -38 12 -42 6 -41.5C3 -41.3 1.2 -40 0 -38.5C-1.2 -40 -3 -41.3 -6 -41.5C-12 -42 -17 -38 -16.5 -31C-16 -24 -8 -16 -2 -10Z";
// Rotate around a point in the drawing, not around the shape's own box.
const pivot = "[transform-box:view-box]";

export type PollyWalkingProps = {
  /** Spoken name. Leave out when Polly is only decoration next to text. */
  label?: string;
  className?: string;
};

/** Polly the bird, walking in place. Stands still when the person prefers reduced motion. */
export function PollyWalking({ label, className = "size-32" }: PollyWalkingProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <g className="motion-safe:animate-polly-bob">
        <g className={`motion-safe:animate-polly-tail ${pivot} origin-[42px_50px]`}>
          <path d={feather} fill="#ff2e6e" transform="translate(40 34) rotate(-28) scale(0.4)" />
          <path d={feather} fill="#f0711a" transform="translate(40 34) rotate(28) scale(0.4)" />
          <path d={feather} fill="#2f3bd6" transform="translate(40 34) scale(0.4)" />
        </g>
        <circle cx="50" cy="60" r="28" fill="#6a3df0" />
        <ellipse cx="54" cy="70" rx="15" ry="13" fill="#ccbdfa" />
        <path d={feather} fill="#1f6feb" transform="translate(28 64) rotate(110) scale(0.5)" />
        <ellipse cx="56" cy="50" rx="3.2" ry="4" fill="#0e0e0f" />
        <circle cx="55.04" cy="48.56" r="1.024" fill="#fff" />
        <path d="M66 50C76 49 80 56 76 62C74 58 70 57 66 58Z" fill="#f0711a" />
        <ellipse cx="46" cy="58" rx="3.5" ry="2.1" fill="#ff2e6e" opacity="0.5" />
      </g>
      <g stroke="#f0711a" strokeWidth="3" strokeLinecap="round">
        <line
          x1="44"
          y1="84"
          x2="44"
          y2="92"
          className={`motion-safe:animate-polly-step ${pivot} origin-[44px_84px]`}
        />
        <line
          x1="56"
          y1="84"
          x2="56"
          y2="92"
          className={`motion-safe:animate-polly-step ${pivot} origin-[56px_84px] [animation-delay:-0.3s]`}
        />
      </g>
    </svg>
  );
}
