import { expect, test } from "bun:test";
import { reportEmail } from "../src/mailer";

test("the first Report email is readable as HTML or text, escapes model output, and links to Home", () => {
  const email = reportEmail(
    "learner@example.com",
    {
      overallLevel: "B1",
      partial: true,
      skills: { grammar: { score: 45, level: "B1" }, vocabulary: { score: 55, level: "B2" }, fluency: null },
      strengths: ["Clear ideas", "Useful examples", "<script>alert('unsafe')</script>"],
      weaknesses: [{ label: "Tenses", quote: "I work since 2023.", betterVersion: "I've worked since 2023." }],
      firstUnit: { title: "Your experience", objective: "Describe work that continues today." },
    },
    "https://fluently.example",
  );
  expect(email.html).not.toContain("<script>");
  expect(email.html).toContain("&#60;script&#62;");
  expect(email.html).toContain('href="https://fluently.example/"');
  expect(email.text).toContain("Grammar: 45/100 · B1");
  expect(email.text).toContain("Fluency: Not measured yet");
  expect(email.text).toContain("partial Report");
  expect(email.text).toContain("Start your first Lesson: https://fluently.example/");
});
