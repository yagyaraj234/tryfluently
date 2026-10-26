import { TextLink } from "@fluently/ui";
import { Link } from "@tanstack/react-router";

export function PublicLinks() {
  return (
    <>
      <TextLink render={<Link to="/privacy" />}>Privacy</TextLink>
      <TextLink render={<Link to="/terms" />}>Terms</TextLink>
      <TextLink render={<Link to="/contact" />}>Contact</TextLink>
    </>
  );
}
