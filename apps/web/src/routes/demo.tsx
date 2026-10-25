import { MarketingSample } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "../components/landing/PublicPage";
import { publicPageHead } from "../lib/site";

const description = "Try two short English practice questions with sample feedback. No account or microphone needed.";
export const Route = createFileRoute("/demo")({
  head: () => publicPageHead("/demo", "Try a 1-minute sample", description),
  component: Demo,
});

function Demo() {
  return (
    <PublicPage title="Try a 1-minute sample" description={description}>
      <MarketingSample start={<Link to="/sign-up" />} />
    </PublicPage>
  );
}
