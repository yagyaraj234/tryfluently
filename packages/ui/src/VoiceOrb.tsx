import { cva } from "class-variance-authority";
import type { CSSProperties } from "react";

export type VoicePhase = "connecting" | "ready" | "listening" | "thinking" | "speaking";

// Keep loop speeds steady across turns so changing phase cannot jump their progress.
const looks: Record<VoicePhase, { amp: number; rings: boolean }> = {
  connecting: { amp: 0.2, rings: false },
  ready: { amp: 0.35, rings: false },
  listening: { amp: 0.8, rings: true },
  thinking: { amp: 0.5, rings: false },
  speaking: { amp: 1, rings: true },
};

const frame = cva("relative grid size-48 place-items-center sm:size-64");
const ring = cva("absolute inset-0 rounded-full border-2 opacity-0 motion-safe:animate-orb-ring", {
  variants: { learner: { true: "border-live", false: "border-brand-mid" } },
});
const body = cva("relative size-full overflow-hidden rounded-full shadow-card motion-safe:animate-orb-breathe", {
  variants: { dim: { true: "opacity-60", false: "" } },
});
// Blue is the coach; it crossfades to pink while the Learner is speaking, the same pink as the LiveBar's live microphone.
const tint = cva("absolute inset-0 transition-opacity duration-ui");

/**
 * The face of a live voice call: a glowing orb that breathes, with waves moving inside it. It swells and rings out
 * while someone speaks (pink for the Learner, blue for the coach) and settles when it's quiet.
 */
export function VoiceOrb({ phase, label }: VoiceOrbProps) {
  const look = looks[phase];
  const learner = phase === "listening";
  const wave = (i: number): CSSProperties => ({ animationDuration: `${5 * (1 + i * 0.45)}s`, animationDirection: i === 1 ? "reverse" : "normal" });
  return (
    <div className="flex flex-col items-center gap-6">
      <div className={frame()} aria-hidden>
        {look.rings && (
          <>
            <span className={ring({ learner })} />
            <span className={ring({ learner })} style={{ animationDelay: "1.2s" }} />
          </>
        )}
        <div className={body({ dim: phase === "connecting" })}>
          <span className={tint()} style={{ background: "radial-gradient(circle at 35% 30%, var(--color-brand-hi), var(--color-brand) 55%, var(--color-brand-deep))" }} />
          <span
            className={tint()}
            style={{ opacity: learner ? 1 : 0, background: "radial-gradient(circle at 35% 30%, #ffc2d6, var(--color-live) 55%, #b30f4d)" }}
          />
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
            <g className="motion-safe:transition-transform motion-safe:duration-ui motion-safe:ease-press motion-reduce:transform-none!" style={{ transform: `scaleY(${look.amp})`, transformOrigin: "50% 62%" }}>
              {[
                { a: 22, y: 100, o: 0.16 },
                { a: 16, y: 112, o: 0.13 },
                { a: 11, y: 124, o: 0.1 },
              ].map(({ a, y, o }, i) => (
                <path
                  key={y}
                  d={`M0 ${y}Q50 ${y - a} 100 ${y}T200 ${y}T300 ${y}T400 ${y}V1000H0Z`}
                  fill="#fff"
                  fillOpacity={o}
                  className="motion-safe:animate-orb-wave"
                  style={wave(i)}
                />
              ))}
            </g>
            <ellipse cx="72" cy="52" rx="34" ry="18" fill="#fff" fillOpacity={0.18} transform="rotate(-25 72 52)" />
          </svg>
        </div>
      </div>
      <p role="status" className="text-body font-bold text-muted">
        {label}
      </p>
    </div>
  );
}

export type VoiceOrbProps = {
  phase: VoicePhase;
  /** What's happening, in words, for example "Your interviewer is speaking". */
  label: string;
};
