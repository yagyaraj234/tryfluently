import { TextLink } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "../components/landing/PublicPage";
import { publicPageHead } from "../lib/site";

const description = "Get help with Fluently, report feedback, ask about billing or refunds or ask about your data.";
export const Route = createFileRoute("/contact")({
  head: () => publicPageHead("/contact", "Contact", description),
  component: Contact,
});

function Contact() {
  return (
    <PublicPage title="Talk to the builder" description={description}>
      <p>
        Fluently is built and operated by Yagyaraj Lodhi. For support, product feedback, billing and refund requests or
        privacy questions, email <TextLink render={<a href="mailto:hey@yagyaraj.com" />}>hey@yagyaraj.com</TextLink>.
      </p>
      <p>
        For an account issue, write from the email you used to sign up. Include the page and what happened, but do not
        send passwords or sensitive recordings. Refunds are reviewed manually; see Terms for billing details.
      </p>
      <p>
        Want to share how practice went? Tell us what helped and what needs work. We will ask permission before
        publishing your feedback with your name.
      </p>
      <TextLink render={<Link to="/privacy" />}>How to delete your account and learning data</TextLink>
    </PublicPage>
  );
}
