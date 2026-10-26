import { TextLink } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "../components/landing/PublicPage";
import { freeAccess } from "../content/landing";
import { publicPageHead } from "../lib/site";

const description = "Terms for using Fluently’s free beta, including AI feedback, usage limits and account deletion.";
export const Route = createFileRoute("/terms")({
  head: () => publicPageHead("/terms", "Terms", description),
  component: Terms,
});

function Terms() {
  return (
    <PublicPage title="Terms" description={description}>
      <p>Updated 25 October 2026 · Fluently is operated by Yagyaraj Lodhi.</p>
      <section aria-labelledby="use-title">
        <h2 id="use-title">Using Fluently</h2>
        <p>
          By creating an account and using Fluently, you agree to these terms. Keep your sign-in details secure. Only
          submit content you have permission to use. Do not use the service unlawfully, impersonate others, bypass usage
          limits or interfere with other Learners’ access. Access may be restricted for abuse.
        </p>
      </section>
      <section aria-labelledby="beta-title">
        <h2 id="beta-title">Free beta and limits</h2>
        <p>{freeAccess.pricing}</p>
        {freeAccess.includes.map((item) => (
          <p key={item}>{item}</p>
        ))}
        <p>{freeAccess.afterLimit}</p>
        <p>
          Beta features may change or be unavailable. Temporary request limits also protect the service from overload.
          Save anything you need separately; Fluently is not a permanent archive.
        </p>
      </section>
      <section aria-labelledby="feedback-title">
        <h2 id="feedback-title">AI feedback has limits</h2>
        <p>
          Fluently provides learning practice, not official certification. Feedback and CEFR levels are AI estimates and
          may be inaccurate. Written Assessments do not measure spoken fluency. We do not guarantee a specific score,
          level, job outcome or time to improve. Use your judgement when applying suggestions.
        </p>
      </section>
      <section aria-labelledby="account-title">
        <h2 id="account-title">Your content and account</h2>
        <p>
          You keep your rights to content you submit. You allow Fluently and its service providers to process it to
          deliver coaching and save your progress, as described in{" "}
          <TextLink render={<Link to="/privacy" />}>Privacy</TextLink>. You can stop using Fluently or delete your
          account from Profile. Deletion removes linked records from the active application database and cannot be
          undone.
        </p>
        <p>
          Questions about these terms or changes to them? Email{" "}
          <TextLink render={<a href="mailto:hey@yagyaraj.com" />}>hey@yagyaraj.com</TextLink>.
        </p>
      </section>
    </PublicPage>
  );
}
