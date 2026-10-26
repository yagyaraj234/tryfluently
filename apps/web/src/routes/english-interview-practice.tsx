import { Button, Card, Grid, Heading, Stack, Text, TextLink } from "@fluently/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "../components/landing/PublicPage";
import { learningPages } from "../content/landing";
import { publicPageHead } from "../lib/site";

const page = learningPages.interview;
export const Route = createFileRoute("/english-interview-practice")({
  head: () => publicPageHead(page.path, page.title, page.description),
  component: InterviewGuide,
});

function InterviewGuide() {
  return (
    <PublicPage
      title="Practise English for your next job interview"
      description="A useful answer explains your work clearly. Start with your role, add one concrete example, then practise answering the next question without a script."
    >
      <TextLink render={<Link to="/demo" />}>Try the free English practice sample</TextLink>
      <section aria-labelledby="introduction-title">
        <h2 id="introduction-title">How to introduce yourself in an interview</h2>
        <p>Use a simple structure: what you do, what you have worked on, and what you want to do next.</p>
        <Card>
          <Stack gap={4}>
            <Heading level={3}>A worked example</Heading>
            <Text>
              “I am a frontend developer. I have worked on customer-facing web apps for two years. Recently, I helped
              simplify our signup flow so customers could get started more easily. I am looking for a role where I can
              build useful products and take more responsibility.”
            </Text>
            <Text tone="muted">
              “I am” describes your current role. “I have worked” connects past experience to now. “I helped” introduces
              a finished project. Replace the details with your own experience; you do not need impressive numbers to
              give a clear answer.
            </Text>
          </Stack>
        </Card>
      </section>
      <section aria-labelledby="explain-work-title">
        <h2 id="explain-work-title">How to explain your work in English</h2>
        <Grid>
          <Card>
            <Stack gap={3}>
              <Heading level={3}>Make the action specific</Heading>
              <Text>Vague: “I did many things in the project.”</Text>
              <Text>
                Clearer: “I built the signup form and worked with a designer to make error messages easier to
                understand.”
              </Text>
              <Text tone="muted">
                Name your contribution. Use “we” for the team outcome and “I” for the part you owned.
              </Text>
            </Stack>
          </Card>
          <Card>
            <Stack gap={3}>
              <Heading level={3}>Prepare for the follow-up</Heading>
              <Text>“What was the hardest part?”</Text>
              <Text>“How did you decide what to change?”</Text>
              <Text>“What would you do differently next time?”</Text>
              <Text tone="muted">
                Say each answer out loud. If you get stuck, explain the same idea in a shorter sentence.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </section>
      <section aria-labelledby="interview-practice-title">
        <h2 id="interview-practice-title">Turn the example into your own practice</h2>
        <p>
          Set a Goal around job interviews and describe your role or the work you want to do. Take a Voice or Written
          Assessment, then use your Roadmap to practise the grammar and vocabulary you need.
        </p>
        <p>
          In a Mock Interview Roleplay, the AI plays an interviewer and responds to what you say. Finish the
          conversation to review your Debrief and corrections. Text practice is available; live voice uses your shared
          monthly allowance.
        </p>
        <p>AI coaching helps you practise language. It cannot predict interview questions or guarantee a job offer.</p>
        <div>
          <Button render={<Link to="/sign-up" />}>Build my practice Roadmap</Button>
        </div>
        <TextLink render={<Link to="/english-level-assessment" />}>
          Not sure where to start? Explore the level assessment
        </TextLink>
      </section>
    </PublicPage>
  );
}
