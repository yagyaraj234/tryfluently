import { Heading } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/_practice/roleplays/$roleplayId")({ component: Roleplay });

// A placeholder until #94 and #95 build this screen.
function Roleplay() {
  return <Heading level={1}>Roleplay</Heading>;
}
