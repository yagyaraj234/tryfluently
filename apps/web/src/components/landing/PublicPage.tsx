import { MarketingShell, MarketingDocument } from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicLinks } from "./PublicLinks";
import { learningPages } from "../../content/landing";

export const publicNavigation = [
  ...Object.values(learningPages).map(({ label, path }) => ({ label, href: path, render: <Link to={path} /> })),
  { label: "Try a sample", href: "/demo", render: <Link to="/demo" /> },
  { label: "Free beta", href: "/#free", render: <Link to="/" hash="free" /> },
];

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
      links={publicNavigation}
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
