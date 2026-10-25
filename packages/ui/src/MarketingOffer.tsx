import type { ReactElement } from "react";
import { Button } from "./Button";
import { TextLink } from "./TextLink";

export function MarketingOffer({
  start,
  includes,
  afterLimit,
  pricing,
}: {
  start: ReactElement;
  includes: string[];
  afterLimit: string;
  pricing: string;
}) {
  return (
    <section
      id="free"
      aria-labelledby="free-title"
      className="my-8 grid gap-6 rounded-3xl border border-line bg-paper p-6 sm:p-8 md:grid-cols-2"
    >
      <div className="grid content-start justify-items-start gap-4">
        <span className="text-sm font-semibold text-primary">Free during beta · No card needed</span>
        <h2 id="free-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Know what’s included
        </h2>
        <p className="text-muted">{afterLimit}</p>
        <p className="text-sm text-muted">{pricing}</p>
        <Button render={start}>Create a free account</Button>
        <TextLink render={<a href="mailto:hey@yagyaraj.com" />}>Ask about more voice credits</TextLink>
      </div>
      <ul className="grid content-start gap-4 text-muted">
        {includes.map((item) => (
          <li key={item} className="border-b border-line pb-4 last:border-0">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
