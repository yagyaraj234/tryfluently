import { Button, Card, Grid, Heading, Stack, Text, TextLink } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "../components/landing/PublicPage";
import { assessmentTiming, learningPages } from "../content/landing";
import { publicPageHead } from "../lib/site";

const page = learningPages.assessment;
export const Route = createFileRoute("/english-level-assessment")({
  head: () => publicPageHead(page.path, page.title, page.description),
  component: AssessmentGuide,
});

function AssessmentGuide() {
  return (
    <PublicPage
      title="An English level assessment you can talk through"
      description="You do not need to know your level before you start. Talk or type about familiar situations, then use your report to choose what to practise next."
    >
      <section aria-labelledby="choose-mode-title">
        <h2 id="choose-mode-title">Choose voice or written practice</h2>
        <p>{assessmentTiming}</p>
        <p>
          A Voice Assessment estimates spoken fluency, grammar and vocabulary. A Written Assessment estimates grammar
          and vocabulary; it does not measure speaking fluency. Voice uses your shared monthly live-minute allowance and
          needs at least four minutes to count.
        </p>
        <TextLink render={<Link to="/" hash="free" />}>See free beta access and voice limits</TextLink>
        <div>
          <Button render={<Link to="/sign-up" />}>Start your free assessment</Button>
        </div>
        <p>
          An account is required for the assessment. You can{" "}
          <TextLink render={<Link to="/demo" />}>try a sample without signing up</TextLink>.
        </p>
      </section>
      <section aria-labelledby="assessment-examples-title">
        <h2 id="assessment-examples-title">What might you be asked?</h2>
        <p>These are example prompts, not a fixed test paper. Your assessment conversation can follow what you say.</p>
        <Grid>
          <Card>
            <Stack gap={3}>
              <Heading level={3}>Describe your everyday work</Heading>
              <Text>“What do you do, and what does a typical day look like?”</Text>
              <Text tone="muted">
                Try: “I work in customer support. I help customers solve account problems and explain the next steps.”
                Use details from your own life.
              </Text>
            </Stack>
          </Card>
          <Card>
            <Stack gap={3}>
              <Heading level={3}>Tell a short story</Heading>
              <Text>“Tell me about a problem you solved recently.”</Text>
              <Text tone="muted">
                Try: “Last week, a customer could not sign in. I checked their account, found the issue and helped them
                reset their password.” Notice the past-tense verbs.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </section>
      <section aria-labelledby="read-report-title">
        <h2 id="read-report-title">Use your report as a starting point</h2>
        <p>
          CEFR describes language ability from A1 to C2. Fluently uses AI to estimate measured skills from a short
          sample of your answers. These are learning estimates, not certified exam results. Short or unusual answers can
          affect accuracy.
        </p>
        <p>
          Your report is prepared after you finish. Read the corrections and look for patterns, rather than treating one
          strong sentence as proof of a higher overall level.
        </p>
        <p>
          Your Goals and Skill Profile shape a stable Roadmap outline. Each Lesson's content adapts to earlier practice.
          Read the Pages, answer the Quiz, then review all feedback together. A Unit completes when you finish every
          outlined Lesson.
        </p>
        <TextLink render={<Link to="/english-interview-practice" />}>
          See interview practice and worked examples
        </TextLink>
      </section>
    </PublicPage>
  );
}
