import { MarketingOffer } from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import { freeAccess } from "../../content/landing";

export function FreeSection() {
  return <MarketingOffer start={<Link to="/sign-up" />} {...freeAccess} />;
}
