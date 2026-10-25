import { MarketingShell, MarketingDocument } from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicLinks } from "./PublicLinks";

export function PublicPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell
      links={[]}
      home={<Link to="/" />}
      start={<Link to="/sign-up" />}
      startLabel="Start free"
      footerText="An AI coach for speaking and writing English."
      footerLinks={<PublicLinks />}
    >
      <MarketingDocument title={title} description={description}>
        {children}
      </MarketingDocument>
    </MarketingShell>
  );
}
