import { TextLink } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "../components/landing/PublicPage";
import { publicPageHead } from "../lib/site";

const description = "How Fluently processes your account, learning data and voice, and how to request deletion.";
export const Route = createFileRoute("/privacy")({
  head: () => publicPageHead("/privacy", "Privacy", description),
  component: Privacy,
});

function Privacy() {
  return (
    <PublicPage title="Privacy" description={description}>
      <p>Updated 25 October 2026 · Fluently is operated by Yagyaraj Lodhi.</p>
      <section aria-labelledby="data-title">
        <h2 id="data-title">What we keep and why</h2>
        <p>
          We store your account details, sign-in records, Goals and Goal Context, conversation transcripts, answers,
          feedback, learning summaries, progress and usage records. These let you sign in, resume practice, personalise
          Lessons and manage usage limits. Share only information you are comfortable having processed; avoid sensitive
          personal or workplace information.
        </p>
        <p>
          Authentication uses cookies to keep you signed in. If you choose Google sign-in, Google supplies your account
          identity. We use Resend to send verification and reminder emails. You can turn off Streak reminders using the
          unsubscribe link in a reminder email.
        </p>
      </section>
      <section aria-labelledby="billing-privacy-title">
        <h2 id="billing-privacy-title">Payments</h2>
        <p>
          Dodo Payments processes checkout and payment details. We send your account name, email and internal account
          identifier to link purchases to your account. Fluently stores provider customer/subscription identifiers,
          payment grants, balances, reservations and refund adjustments. Card details are entered with the payment
          provider and are not stored by Fluently.
        </p>
        <p>
          Deleting your Fluently account removes its linked billing records from the application database after future
          subscription charges are cancelled. Dodo Payments retains its own payment and invoice records under its
          retention rules. Webhook delivery identifiers may remain to prevent duplicate processing.
        </p>
      </section>
      <section aria-labelledby="voice-title">
        <h2 id="voice-title">Voice recording and AI processing</h2>
        <p>
          Voice is optional. Live Voice Assessments and voice Roleplays send audio to OpenAI or Rime, depending on the
          configured provider. Uploaded recorded answers are sent to OpenAI for transcription. Fluently does not store
          raw learner audio on its servers; transcripts, feedback and usage information are saved with your account.
        </p>
        <p>
          Some speaking exercises use your browser’s speech recognition, which may send audio to the browser’s speech
          service. Replay audio is held temporarily in your browser and released when you leave the Lesson. You can type
          instead.
        </p>
        <p>
          AI coaching processes relevant learning context through OpenAI or Google, depending on the configured model.
          Kenpath Svara receives the text of words or corrections you ask to hear. Generated Reference Pronunciation
          clips may be cached; these are synthetic speech, not your voice.
        </p>
        <p>
          Providers have their own retention rules. Deleting your Fluently account does not itself delete provider logs.
          OpenAI describes its API retention in its{" "}
          <TextLink render={<a href="https://developers.openai.com/api/docs/guides/your-data" />}>
            data controls documentation
          </TextLink>
          . Contact us for details about the providers used for your data.
        </p>
      </section>
      <section aria-labelledby="delete-title">
        <h2 id="delete-title">Retention and deletion</h2>
        <p>
          Learning records remain linked to your account until you delete it. In Profile, choose “Delete your account”
          and confirm. This permanently removes your account and linked Goals, Assessments, transcripts, Lessons,
          reports and progress from the active application database.
        </p>
        <p>
          Do not assume this also erases infrastructure backups or provider records immediately. For backup retention
          details, a data access or correction request, or help deleting data when you cannot sign in, contact{" "}
          <TextLink render={<a href="mailto:hey@yagyaraj.com" />}>hey@yagyaraj.com</TextLink>. We may need to verify
          account ownership before handling a request.
        </p>
      </section>
      <TextLink render={<Link to="/contact" />}>Contact Fluently about your data</TextLink>
    </PublicPage>
  );
}
