import { useRender } from "@base-ui/react/use-render";
import { CaretDown, type Icon } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./Button";
import { cardClasses } from "./Card";
import { Heading } from "./Heading";
import { LogoMark } from "./Logo";
import { Stack } from "./Stack";
import { Text } from "./Text";

// The public landing page. Server-renderable: no state, no effects, no event handlers, so the HTML is complete.
// Same tokens and components as the app; `render` takes the app's router link, as everywhere else.

/** Marketing cards rise a little under the pointer. */
export const liftCardClasses = `${cardClasses} min-w-0 motion-safe:transition motion-safe:duration-ui motion-safe:ease-press hover:-translate-y-0.5 hover:shadow-lift`;
const wrap = "mx-auto w-full max-w-page";
const h2 = "mx-auto max-w-[20ch] text-center text-4xl leading-none font-bold tracking-tight text-balance sm:text-5xl";
const h3 = "text-xl font-bold tracking-tight";
const fine = "text-sm text-muted";
const logo = "inline-flex items-center gap-2 text-lg font-bold tracking-tighter whitespace-nowrap text-primary";
const wordmark = (
  <>
    <LogoMark className="size-6" />
    get fluency
  </>
);
/** The hero fades up one piece after another. */
const rise = [
  "motion-safe:animate-rise",
  "motion-safe:animate-rise motion-safe:[animation-delay:60ms]",
  "motion-safe:animate-rise motion-safe:[animation-delay:120ms]",
  "motion-safe:animate-rise motion-safe:[animation-delay:180ms]",
];

export type MarketingShellProps = {
  /** In-page anchors shown in the nav. */
  links: { label: string; href: string }[];
  /** The "Start free" link in the nav, a router link. */
  start: ReactElement;
  startLabel: string;
  /** Wordmark link, a router link to `/`. */
  home: ReactElement;
  footerText: string;
  children?: ReactNode;
};

/** The page chrome: a floating pill nav, the main landmark and a footer. */
export function MarketingShell({ links, start, startLabel, home, footerText, children }: MarketingShellProps) {
  const homeLink = useRender({ render: home, props: { className: logo, children: wordmark } });
  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas px-4 text-ink">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-overlay focus:rounded-full focus:bg-paper focus:px-4 focus:py-2"
        href="#main"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-sticky flex justify-center pt-3.5">
        <nav
          className="flex items-center justify-between gap-4 rounded-full border border-line bg-paper/72 py-2 pr-2 pl-5 text-sm shadow-card backdrop-blur-lg backdrop-saturate-180 max-sm:w-full sm:gap-7 reduce-transparency:bg-paper reduce-transparency:backdrop-blur-none"
          aria-label="Main"
        >
          {homeLink}
          {links.map((l) => (
            <a
              key={l.href}
              className="hidden min-h-8 items-center font-medium text-muted transition-colors hover:text-ink sm:inline-flex"
              href={l.href}
            >
              {l.label}
            </a>
          ))}
          <Button size="sm" render={start}>
            {startLabel}
          </Button>
        </nav>
      </header>
      <main id="main" className={wrap}>
        {children}
      </main>
      <footer className={`${wrap} flex flex-wrap justify-between gap-x-6 gap-y-3 pt-8 pb-10 text-sm text-muted`}>
        <div className="grid max-w-[36ch] gap-1">
          <span className={logo}>{wordmark}</span>
          <span>{footerText}</span>
        </div>
        <nav className="flex flex-wrap items-start gap-x-4 gap-y-2 sm:gap-x-5.5" aria-label="Footer">
          {links.map((l) => (
            <a key={l.href} className="transition-colors hover:text-ink" href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}

export type MarketingHeroProps = {
  badge: string;
  /** The headline up to its emphasised ending. */
  title: string;
  /** The underlined end of the headline. */
  emphasis: string;
  description: string;
  cta: ReactElement;
  ctaLabel: string;
  note: string;
  children?: ReactNode;
};

/** The one h1, the pitch and the primary call to action, with the product frame beneath. */
export function MarketingHero({ badge, title, emphasis, description, cta, ctaLabel, note, children }: MarketingHeroProps) {
  return (
    <>
      <section className="relative isolate flex flex-col items-center gap-5.5 pt-16 pb-12 text-center" aria-labelledby="hero-title">
        {/* A dot grid fading out from behind the headline, and a soft sky glow. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 bottom-0 z-behind bg-[radial-gradient(circle,var(--color-ink)_1px,transparent_1.6px)] bg-size-[22px_22px] opacity-20 [mask-image:radial-gradient(ellipse_55%_60%_at_50%_38%,black,transparent)]"
        />
        <div aria-hidden className="pointer-events-none absolute top-10 left-1/2 z-behind h-75 w-9/10 max-w-160 -translate-x-1/2 rounded-full bg-brand-hi opacity-35 blur-3xl" />
        <span className={`inline-flex items-center gap-2 rounded-full border border-line bg-paper py-1.25 pr-3 pl-2 text-sm font-semibold ${rise[0]}`}>
          <span aria-hidden className="size-2 rounded-full bg-primary ring-3 ring-primary-soft" />
          {badge}
        </span>
        <h1
          id="hero-title"
          className={`max-w-[14ch] text-5xl leading-none font-bold tracking-tighter text-balance sm:text-6xl lg:text-7xl ${rise[1]}`}
        >
          {title}{" "}
          <em className="relative inline-block text-primary not-italic">
            {emphasis}
            <svg className="absolute -bottom-[0.1em] left-0 h-[0.16em] w-full overflow-visible" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden>
              <path
                className="stroke-primary motion-safe:animate-draw"
                fill="none"
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                strokeDasharray={1}
                pathLength={1}
                d="M2 8 C 40 2, 70 12, 110 6 S 190 2, 298 7"
              />
            </svg>
          </em>
        </h1>
        <p className={`max-w-[40ch] text-lg text-balance text-muted sm:text-xl ${rise[2]}`}>{description}</p>
        <div className={`mt-1.5 flex flex-col items-center gap-3.5 ${rise[3]}`}>
          <Button glow render={cta}>
            {ctaLabel}
          </Button>
          <span className={fine}>{note}</span>
        </div>
      </section>
      {children}
    </>
  );
}

/** A pill that floats on the top-right or bottom-left edge of a frame or panel. */
export function FloatChip({ place, inset = "panel", children }: { place: "tr" | "bl"; inset?: "panel" | "frame"; children: ReactNode }) {
  const at = {
    panel: { tr: "-top-3 right-5.5", bl: "-bottom-3 left-5.5" },
    frame: { tr: "-top-3.5 right-8.5", bl: "-bottom-3.5 left-8.5" },
  }[inset][place];
  return (
    <span className={`absolute z-sticky inline-flex items-center gap-1.5 rounded-full bg-primary px-3.25 py-1.75 text-xs font-semibold text-on-primary shadow-card motion-safe:animate-bob ${at}`}>
      {children}
    </span>
  );
}

/** The framed product preview under the hero. `chips` float on its corners. */
export function ProductFrame({ chips, label, children }: { chips: [ReactNode, ReactNode]; label: string; children?: ReactNode }) {
  return (
    <section
      className="relative isolate rounded-3xl border border-line bg-subtle p-2.5 shadow-frame inset-ring-6 inset-ring-canvas/45 motion-safe:animate-rise motion-safe:[animation-delay:300ms] sm:rounded-4xl sm:p-3.5"
      aria-label={label}
    >
      <FloatChip place="tr" inset="frame">
        {chips[0]}
      </FloatChip>
      <FloatChip place="bl" inset="frame">
        {chips[1]}
      </FloatChip>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function MarketingColumn({ children }: { children?: ReactNode }) {
  return <div className="grid min-w-0 content-start gap-3">{children}</div>;
}

export function GoalsStrip({ label, goals }: { label: string; goals: string[] }) {
  return (
    <section className="flex flex-col items-center gap-3.5 pt-10 pb-4" aria-label={label}>
      <span className={fine}>{label}</span>
      <ul className="flex flex-wrap justify-center gap-x-7 gap-y-2.5 text-lg font-semibold tracking-tight text-ink/40 sm:text-xl">
        {goals.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </section>
  );
}

export type StepItem = { title: string; body: string };

/** A real sequence, so the steps are an ordered list and carry numbers. */
export function HowItWorks({ id, title, steps }: { id: string; title: string; steps: StepItem[] }) {
  return (
    <section className="grid gap-7 pt-14 pb-4" aria-labelledby={id}>
      <h2 className={h2} id={id}>
        {title}
      </h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li className={`${liftCardClasses} grid content-start gap-2 p-6`} key={s.title}>
            <span className="mb-1.5 grid size-8.5 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary tabular-nums ring-4 ring-primary-soft">
              {i + 1}
            </span>
            <h3 className={h3}>{s.title}</h3>
            <p className="text-base text-pretty text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type FeaturePoint = { icon: Icon; title: string; body: string };

export type FeatureProps = {
  id: string;
  pill: string;
  title: string;
  description: string;
  points: FeaturePoint[];
  /** Puts the copy on the right on desktop. */
  flip?: boolean;
  /** The illustration, normally a MarketingPanel. */
  children?: ReactNode;
};

/** Copy on one side, an illustration on the other. */
export function Feature({ id, pill, title, description, points, flip, children }: FeatureProps) {
  return (
    <section className="grid items-center gap-6 py-10 sm:gap-12 sm:py-16 md:grid-cols-2 lg:gap-18 lg:py-20" id={id} aria-labelledby={`${id}-title`}>
      <div className={`grid min-w-0 gap-4.5 ${flip ? "md:order-2" : ""}`}>
        <span className="justify-self-start rounded-full bg-primary-soft px-2.75 py-1 text-sm font-semibold text-primary">{pill}</span>
        <h2 id={`${id}-title`} className="text-4xl leading-none font-bold tracking-tight text-balance sm:text-5xl">
          {title}
        </h2>
        <p className="max-w-[44ch] text-lg text-pretty text-muted">{description}</p>
        <ul className="mt-1.5 grid gap-3.5">
          {points.map(({ icon: Icon, title: t, body }) => (
            <li key={t} className="flex gap-3">
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <b className="block font-semibold">{t}</b>
                <span className="text-muted">{body}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {children}
    </section>
  );
}

export type FeatureCard = { icon: Icon; title: string; body: string };

export function FeatureTrio({ id, title, items }: { id: string; title: string; items: FeatureCard[] }) {
  return (
    <section className="grid gap-7 pt-6 pb-10" aria-labelledby={id}>
      <h2 className={h2} id={id}>
        {title}
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map(({ icon: Icon, title: t, body }) => (
          <article className={`${liftCardClasses} grid content-start gap-2 p-6`} key={t}>
            <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-xl text-primary">
              <Icon aria-hidden />
            </span>
            <h3 className={h3}>{t}</h3>
            <p className="text-base text-pretty text-muted">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export type FaqItem = { question: string; answer: string };

/** Native <details>: every answer is in the HTML for crawlers, and it opens with no JavaScript. */
export function Faq({ id, title, items }: { id: string; title: string; items: FaqItem[] }) {
  return (
    <section className="grid gap-7 pt-6 pb-12" aria-labelledby={id}>
      <h2 className={h2} id={id}>
        {title}
      </h2>
      <div className="mx-auto grid w-full max-w-180 gap-2">
        {items.map((item, i) => (
          <details
            key={item.question}
            open={i === 0}
            className="group rounded-2xl border border-line bg-paper px-5 shadow-card details-content:h-0 details-content:overflow-hidden open:details-content:h-auto motion-safe:details-content:transition-all motion-safe:details-content:transition-discrete motion-safe:details-content:duration-ui motion-safe:details-content:ease-press"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-body font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
              {item.question}
              <CaretDown aria-hidden className="shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-ui group-open:rotate-180" />
            </summary>
            <p className="max-w-[58ch] pb-4.5 text-base text-pretty text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta({ title, description, cta, ctaLabel }: { title: string; description: string; cta: ReactElement; ctaLabel: string }) {
  return (
    <section
      className="relative isolate grid justify-items-center gap-5 overflow-hidden rounded-4xl bg-brand bg-radial-[90%_120%_at_50%_130%] from-brand-hi to-brand to-62% px-6 py-10 text-center text-on-brand sm:py-20"
      aria-labelledby="final-title"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-behind bg-[radial-gradient(circle,var(--color-white)_1px,transparent_1.6px)] bg-size-[20px_20px] opacity-10 [mask-image:linear-gradient(black,transparent_70%)]"
      />
      <h2 id="final-title" className="max-w-[20ch] text-4xl leading-none font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      <p className="max-w-[40ch] text-lg text-pretty text-on-brand/72">{description}</p>
      <Button variant="inverse" render={cta}>
        {ctaLabel}
      </Button>
    </section>
  );
}

export type AuthPoint = { icon: Icon; title: string; body: string };

export type AuthLayoutProps = {
  /** Wordmark link, a router link to `/`. */
  home: ReactElement;
  storyLabel: string;
  badge: string;
  storyTitle: string;
  storyText: string;
  /** Numbered steps beside the form, for new learners. */
  steps?: AuthPoint[];
  /** A single note shown instead of steps, for returning learners. */
  note?: AuthPoint;
  title: string;
  subtitle: string;
  /** The email form. */
  children: ReactNode;
  footer: ReactNode;
  /** Another way in, such as Google, after an "or" divider. */
  alternative?: ReactNode;
};

const glass = "rounded-2xl border border-on-brand/24 bg-on-brand/12";

/** Sign-in and sign-up: a cobalt story panel beside the form; on phones, just its headline above the form. */
export function AuthLayout(props: AuthLayoutProps) {
  const brand = useRender({
    render: props.home,
    props: {
      className: "flex items-center gap-2 self-start text-xl font-bold tracking-tighter text-on-brand",
      children: (
        <>
          <LogoMark mono className="size-7" />
          get fluency
        </>
      ),
    },
  });
  const note = props.note;
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-8 text-ink">
      <div className="grid w-full max-w-136 rounded-4xl border border-line bg-paper p-2 shadow-card md:min-h-184 md:max-w-296 md:grid-cols-2">
        <section
          className="relative isolate flex min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-3xl bg-linear-160 from-brand-mid to-brand p-5 text-on-brand md:gap-12 md:p-8 lg:p-14"
          aria-label={props.storyLabel}
        >
          <span aria-hidden className="absolute -top-1/4 right-0 z-behind size-3/5 rounded-full bg-brand-hi/85 blur-3xl" />
          <span aria-hidden className="absolute -right-1/4 -bottom-1/4 z-behind size-1/2 rounded-full bg-brand-deep/90 blur-3xl" />
          {brand}
          <div className="max-w-136">
            <span className="hidden rounded-full border border-on-brand/25 bg-on-brand/12 px-3.5 py-2 text-sm md:inline-block">{props.badge}</span>
            <h2 className="mb-2 text-3xl leading-none font-bold tracking-tight text-balance md:mt-5 md:mb-3 md:text-5xl lg:text-7xl">
              {props.storyTitle}
            </h2>
            <p className="hidden text-lg text-on-brand/82 md:block">{props.storyText}</p>
          </div>
          {props.steps && (
            <ol className="hidden grid-cols-3 gap-3 md:grid">
              {props.steps.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className={`${glass} group flex h-44 flex-col gap-3 p-4 text-sm leading-tight first:bg-white first:text-black`}>
                  <div className="flex items-center justify-between">
                    <span className="grid size-8 place-items-center rounded-full border border-on-brand/50 group-first:border-0 group-first:bg-brand group-first:text-on-brand">
                      {i + 1}
                    </span>
                    <Icon aria-hidden className="size-6" />
                  </div>
                  <div className="mt-auto grid gap-1.5">
                    <strong>{title}</strong>
                    <small className="text-xs leading-snug opacity-80">{body}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {note && (
            <div className={`${glass} hidden items-start gap-4 p-5 md:flex`}>
              <note.icon aria-hidden className="size-7 flex-none" />
              <div>
                <strong>{note.title}</strong>
                <p className="mt-1 text-on-brand/82">{note.body}</p>
              </div>
            </div>
          )}
        </section>
        <section className="mx-auto grid w-full max-w-136 content-center px-4 py-6 md:p-8 lg:p-14" aria-label={props.title}>
          <Stack gap={6}>
            <div className="grid gap-2 text-center">
              <Heading level={1}>{props.title}</Heading>
              <Text tone="muted">{props.subtitle}</Text>
            </div>
            {props.children}
            <div className="text-center">{props.footer}</div>
            {props.alternative && (
              <div className="grid gap-5">
                <p className="flex items-center gap-4 text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">or</p>
                {props.alternative}
              </div>
            )}
          </Stack>
        </section>
      </div>
    </main>
  );
}
