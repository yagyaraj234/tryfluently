import { Check, Flame, Play, Sparkle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cardClasses } from "./Card";
import { FloatChip, liftCardClasses } from "./Marketing";
import { VerdictTag } from "./VerdictTag";

// Product illustrations for the landing page. They show the real shapes of the app (Assessment Report, Roadmap,
// Roleplay, Debrief) with example content, so each one is an image to assistive tech and carries a description.

/** The floating pill content used on frames and panels. */
export const floatChips = {
  streak: (
    <>
      <Flame aria-hidden weight="fill" size={13} />
      7-day streak
    </>
  ),
  xp: (
    <>
      <Sparkle aria-hidden weight="fill" size={13} />
      +30 XP
    </>
  ),
};

// The frame's cards sit still; only the cards in feature panels lift.
const cardClassesStatic = `min-w-0 ${cardClasses}`;
const eyebrow = "text-xs font-semibold tracking-wider text-muted uppercase";
const cardTitle = "mt-1 mb-4 text-lg font-bold tracking-tight";

type PanelProps = { label: string; top?: ReactNode; bottom?: ReactNode; road?: boolean; children?: ReactNode };

/** The soft grey box beside a feature's copy. Chips poke out of its top and bottom edges. */
export function MarketingPanel({ label, top, bottom, road, children }: PanelProps) {
  return (
    <div
      className={`relative isolate grid min-w-0 gap-3 rounded-4xl border border-line bg-subtle px-4 py-5.5 sm:p-7 ${road ? "gap-3.5 before:absolute before:top-12 before:bottom-12 before:left-13 before:border-l-2 before:border-dashed before:border-line sm:before:left-16" : ""}`}
      role="img"
      aria-label={label}
    >
      {top && <FloatChip place="tr">{top}</FloatChip>}
      {children}
      {bottom && <FloatChip place="bl">{bottom}</FloatChip>}
    </div>
  );
}

const glass =
  "rounded-2xl border border-on-brand/28 bg-on-brand/18 backdrop-blur-md reduce-transparency:bg-on-brand/30 reduce-transparency:backdrop-blur-none";
// The waveform bars move out of step with each other.
const waveBars = [
  "motion-safe:[animation-delay:-0.13s]",
  "motion-safe:[animation-delay:-0.26s]",
  "motion-safe:[animation-delay:-0.39s]",
  "motion-safe:[animation-delay:-0.52s]",
  "motion-safe:[animation-delay:-0.65s]",
  "motion-safe:[animation-delay:-0.78s]",
];

export function RoleplayMock() {
  return (
    <div
      className="relative isolate flex min-h-100 flex-col justify-between gap-6 overflow-hidden rounded-3xl bg-linear-170 from-brand-mid to-brand p-5.5 text-on-brand md:min-h-115"
      role="img"
      aria-label="A Roleplay: Maya, a friendly colleague, asks about the weekend while the Learner answers by voice."
    >
      <span
        aria-hidden
        className="absolute -top-1/4 -right-1/4 z-behind size-3/4 rounded-full bg-brand-hi/70 blur-3xl"
      />
      <span
        aria-hidden
        className="absolute -right-15 -bottom-20 z-behind size-65 rounded-full bg-brand-hi/35 blur-3xl"
      />
      <div className="grid gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className={`${glass} rounded-full px-2.75 py-1.25 text-xs font-semibold`}>Roleplay · Small talk</span>
          <span className="flex gap-1">
            {[true, true, false, false, false].map((on, i) => (
              <i key={i} className={`h-1 w-4.5 rounded-sm ${on ? "bg-on-brand" : "bg-on-brand/35"}`} />
            ))}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-11 flex-none place-items-center rounded-full bg-white text-lg font-bold text-brand shadow-float ring-3 ring-on-brand/35">
            M
          </span>
          <div>
            <h3 className="text-2xl font-bold tracking-tight">Catch-up with Maya</h3>
            <p className="mt-1 text-sm opacity-85">A friendly colleague on Monday morning</p>
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        <div className={`${glass} px-4 py-3.5 text-lg leading-snug font-semibold tracking-tight`}>
          <small className="mb-1.5 block text-xs tracking-wider opacity-80">MAYA ASKS</small>
          Hi! How was your weekend? Did you do anything fun?
        </div>
        <p className="px-1 text-sm text-on-brand/92">
          <span className="mr-2 text-xs font-semibold tracking-wider uppercase opacity-70">You</span>On Saturday we went
          to the lake and it was <b className="rounded-md bg-on-brand/22 px-1">really</b> relaxing
          <i className="ml-0.5 inline-block h-4 w-0.5 bg-on-brand align-middle motion-safe:animate-blink" />
        </p>
      </div>
      <div className="flex items-center gap-3 self-center rounded-full bg-white py-2 pr-2 pl-4 text-sm font-semibold text-black shadow-float">
        <span className="flex h-5.5 items-center gap-0.75">
          {waveBars.map((delay) => (
            <b
              key={delay}
              className={`h-full w-0.75 scale-y-45 rounded-full bg-brand motion-safe:animate-wave ${delay}`}
            />
          ))}
        </span>
        <span className="tabular-nums">Listening… 0:42</span>
        <span className="grid size-8.5 place-items-center rounded-full bg-black">
          <span className="size-2.5 rounded-xs bg-white" />
        </span>
      </div>
    </div>
  );
}

function Segments({ filled }: { filled: number }) {
  return (
    <div className="grid flex-1 grid-cols-10 gap-0.75">
      {Array.from({ length: 10 }, (_, i) => (
        <i
          key={i}
          className={`h-4.5 rounded-sm ${i < filled ? "bg-linear-to-b from-brand-hi to-primary" : "bg-line"}`}
        />
      ))}
    </div>
  );
}

export function ReportMock() {
  return (
    <div
      className={cardClassesStatic}
      role="img"
      aria-label="An Assessment Report: fluency B1, grammar B2, vocabulary B1, and the weak spot to fix first."
    >
      <div className={eyebrow}>Assessment Report</div>
      <h3 className={cardTitle}>Where you are today</h3>
      <div className="grid gap-2.5">
        {(
          [
            ["Fluency", 6, "B1"],
            ["Grammar", 7, "B2"],
            ["Vocabulary", 5, "B1"],
          ] as const
        ).map(([skill, filled, level]) => (
          <div className="flex items-center gap-2 text-sm sm:gap-3" key={skill}>
            <span className="w-16 shrink-0 text-muted sm:w-19.5">{skill}</span>
            <Segments filled={filled} />
            <span className="rounded-full bg-primary-soft px-2.25 py-0.75 text-xs font-semibold text-primary">
              {level}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-subtle px-3.5 py-3 text-sm">
        Weak spot: <mark className="rounded-md bg-primary-soft px-1.5 py-px font-semibold text-primary">I go</mark> vs{" "}
        <mark className="rounded-md bg-primary-soft px-1.5 py-px font-semibold text-primary">I went</mark> when you talk
        about the past.
      </div>
    </div>
  );
}

export function RoadmapPeekMock() {
  const lesson =
    "rounded-2xl border border-dashed border-line bg-paper px-3.5 py-3 text-sm leading-snug font-semibold shadow-card";
  const tag = "mb-2 block w-fit rounded-md px-2 py-0.5 text-xs font-semibold";
  const meta = "mt-2 block text-xs font-normal text-muted";
  return (
    <div
      className={cardClassesStatic}
      role="img"
      aria-label="Roadmap preview with two Units: past tense for everyday stories, and making small talk."
    >
      <div className={eyebrow}>Your Roadmap</div>
      <h3 className={cardTitle}>Next up, built from your report</h3>
      <div className="grid grid-cols-2 gap-2.5">
        <div className={`${lesson} -rotate-2`}>
          <span className={`${tag} bg-correct-tint text-correct`}>Grammar</span>
          Past tense for everyday stories
          <small className={meta}>Unit · 3 lessons</small>
        </div>
        <div className={`${lesson} translate-y-2 rotate-2`}>
          <span className={`${tag} bg-primary-soft text-primary`}>Speaking</span>
          Making small talk
          <small className={meta}>Unit · 2 lessons</small>
        </div>
      </div>
    </div>
  );
}

const scale = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** One skill on the A1 to C2 scale, with the Learner's level and their target. */
export function LevelCard({ skill, current, target }: { skill: string; current: string; target: string }) {
  return (
    <div className={liftCardClasses}>
      <h3 className="flex items-baseline justify-between gap-2 text-lg font-bold tracking-tight">
        {skill} <span className="text-xs font-normal tracking-normal text-muted">Target {target}</span>
      </h3>
      <div className="mt-6 grid grid-cols-6 gap-1">
        {scale.map((l) => (
          <i
            key={l}
            className={`relative rounded-lg py-1.5 text-center text-xs font-semibold not-italic ${l === current ? "bg-brand text-on-brand" : "bg-line text-muted"} ${l === target ? "inset-ring-2 inset-ring-ink" : ""} ${l === target && l !== current ? "text-ink" : ""}`}
          >
            {l === current && (
              <span className="absolute -top-4.5 left-1/2 -translate-x-1/2 text-xs font-semibold text-primary">
                You
              </span>
            )}
            {l}
          </i>
        ))}
      </div>
    </div>
  );
}

export type UnitRowProps = {
  state: "done" | "now" | "next";
  index: number;
  title: string;
  detail: string;
  status: string;
  progress?: boolean;
};

const unitTone = {
  done: "bg-correct-tint text-correct",
  now: "bg-primary-soft text-primary",
  next: "bg-line text-muted",
};

export function UnitRow({ state, index, title, detail, status, progress }: UnitRowProps) {
  return (
    <div className={`${liftCardClasses} relative flex items-center gap-3.5`}>
      <span className={`grid size-8.5 shrink-0 place-items-center rounded-full text-sm font-bold ${unitTone[state]}`}>
        {state === "done" ? <Check aria-hidden /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-base font-semibold tracking-tight">{title}</strong>
        <small className="text-sm text-muted">{detail}</small>
        {progress && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-line">
            <span className="block h-full w-3/5 rounded-md bg-primary" />
          </div>
        )}
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-0.75 text-xs font-semibold whitespace-nowrap ${unitTone[state]}`}
      >
        {status}
      </span>
    </div>
  );
}

const bubble = "max-w-5/6 rounded-2xl px-3.75 py-3 text-caption leading-snug shadow-card";
const bubbleName = "mb-0.75 block text-xs font-semibold";
const micBars = ["h-2/5", "h-4/5", "h-1/2", "h-full", "h-2/3", "h-5/6"];

export function ChatBubbles() {
  return (
    <>
      <div className={`${bubble} bg-paper`}>
        <b className={`${bubbleName} text-muted`}>Maya · Colleague</b>What did you do at the weekend?
      </div>
      <div className={`${bubble} justify-self-end bg-primary text-on-primary`}>
        <b className={`${bubbleName} text-on-primary/60`}>You</b>I <u className="decoration-2 underline-offset-3">go</u>{" "}
        to the lake <u className="decoration-2 underline-offset-3">yesterday</u>.
      </div>
      <div className={liftCardClasses}>
        <VerdictTag verdict="almost" />
        <p className="mt-2 text-lg leading-snug font-bold tracking-tight">I went to the lake yesterday.</p>
        <p className="mt-1 text-sm text-muted">Use the past tense for things that already happened.</p>
        <span className="mt-3 inline-flex min-h-9.5 items-center gap-2 rounded-full border border-line bg-subtle pr-3.5 pl-1.5 text-sm font-semibold">
          <i className="grid size-6.5 place-items-center rounded-full bg-brand text-xs text-on-brand">
            <Play aria-hidden weight="fill" />
          </i>
          Hear it
          <span className="ml-1 flex h-3.5 items-center gap-0.5">
            {micBars.map((h) => (
              <b key={h} className={`w-0.5 rounded-full bg-muted ${h}`} />
            ))}
          </span>
        </span>
      </div>
    </>
  );
}
