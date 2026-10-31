import { TextLink } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "../components/landing/PublicPage";
import { freeAccess } from "../content/landing";
import { publicPageHead } from "../lib/site";

const description =
  "Terms for Fluently's Free, Pro and minute packs, including billing, usage limits and account deletion.";
export const Route = createFileRoute("/terms")({
  head: () => publicPageHead("/terms", "Terms", description),
  component: Terms,
});

function Terms() {
  return (
    <PublicPage title="Terms" description={description}>
      <p>Updated 31 October 2026 · Fluently is operated by Yagyaraj Lodhi.</p>
      <section aria-labelledby="use-title">
        <h2 id="use-title">Using Fluently</h2>
        <p>
          By creating an account and using Fluently, you agree to these terms. Keep your sign-in details secure. Only
          submit content you have permission to use. Do not use the service unlawfully, impersonate others, bypass usage
          limits or interfere with other Learners’ access. Access may be restricted for abuse.
        </p>
      </section>
      <section aria-labelledby="beta-title">
        <h2 id="beta-title">Plans and usage limits</h2>
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
      <section aria-labelledby="billing-title">
        <h2 id="billing-title">Payments, cancellation and refunds</h2>
        <p>
          Dodo Payments handles checkout, billing and invoices. Paid minutes and benefits begin only after payment is
          confirmed. Pro renews monthly; cancel renewal from Profile to keep access through the paid period. A failed
          renewal has no grace period. Purchased minutes never expire and remain available after cancellation.
        </p>
        <p>
          Monthly minutes are used before purchased minutes. Monthly subscription minutes expire at the end of their
          billing period. Live calls include both speakers and silence. Calls using purchased or subscription minutes
          end at the applicable renewal boundary; start another call to use the new allowance.
        </p>
        <p>
          Pro access includes unlimited daily Lesson starts and Lesson/Unit skipping. Skipping grants no completion
          credit or streak activity. Manual streak recovery can restore the latest gap of up to two missed days, once
          per paid billing period or calendar month for pack-only access. Restored days grant no XP or completed
          Lessons.
        </p>
        <p>
          For billing disputes or refund requests, contact hey@yagyaraj.com. Refunds are reviewed manually. A successful
          refund removes remaining benefits from that purchase; other purchased balances remain. Refund requests do not
          automatically cancel future subscription renewals.
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
          undone. We cancel future subscription charges. If billing access is unavailable, cancellation is queued until
          access returns. Any remaining minutes and paid access are forfeited when you delete your account.
        </p>
        <p>
          Questions about these terms or changes to them? Email{" "}
          <TextLink render={<a href="mailto:hey@yagyaraj.com" />}>hey@yagyaraj.com</TextLink>.
        </p>
      </section>
    </PublicPage>
  );
}
