import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Debrief, type DebriefProps } from "@impromptu/ui";

const debrief: DebriefProps = {
  overallImpression: "You kept the conversation going and explained your project clearly.",
  questions: [
    {
      question: "Tell me about yourself.",
      quote: "I am working here since 2020.",
      strongerPhrasing: "I've been working here since 2020.",
      languageIssues: ["Present perfect continuous with since"],
    },
    {
      question: "Why this role?",
      quote: "Because I like the product.",
      strongerPhrasing: "I'm drawn to the product.",
      languageIssues: [],
    },
  ],
  phrasesToLearn: ["walk you through", "on the same page", "a quick win"],
  skillChanges: { grammar: { from: 54, to: 58 }, vocabulary: { from: null, to: 61 } },
};

describe("Debrief", () => {
  test("labels a text Roleplay without suggesting fluency was measured", () => {
    render(<Debrief {...debrief} textMode />);
    expect(screen.getByText("Text mode · Fluency wasn't measured in this Roleplay.")).toBeDefined();
  });
  test("shows the overall impression", () => {
    render(<Debrief {...debrief} />);
    expect(screen.getByText(debrief.overallImpression)).toBeDefined();
  });

  test("shows each question with the Learner's quote, a stronger phrasing and the language issues", () => {
    render(<Debrief {...debrief} />);
    const first = screen.getByRole("heading", { name: "Tell me about yourself." }).closest("section")!;
    expect(within(first).getByText("I am working here since 2020.").closest("blockquote")).not.toBeNull();
    expect(within(first).getByText("I've been working here since 2020.")).toBeDefined();
    expect(within(first).getByRole("listitem").textContent).toBe("Present perfect continuous with since");
    const second = screen.getByRole("heading", { name: "Why this role?" }).closest("section")!;
    expect(within(second).queryByRole("list")).toBeNull();
  });

  test("lists the phrases to learn, each with Hear it when it can be played", () => {
    const onHear = mock();
    render(<Debrief {...debrief} onHear={onHear} />);
    const phrases = screen.getByRole("list", { name: "Phrases to learn" });
    expect(
      within(phrases)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["walk you throughHear it", "on the same pageHear it", "a quick winHear it"]);
    fireEvent.click(within(phrases).getAllByRole("button", { name: "Hear it" })[1]!);
    expect(onHear).toHaveBeenCalledWith("on the same page");
  });

  test("has no Hear it without onHear", () => {
    render(<Debrief {...debrief} />);
    expect(screen.queryByRole("button", { name: "Hear it" })).toBeNull();
  });

  test("shows each skill change from → to, and a first score as new", () => {
    render(<Debrief {...debrief} />);
    const changes = screen.getByRole("list", { name: "Skill changes" });
    expect(
      within(changes)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Grammar54 → 58", "VocabularyNew → 61"]);
  });

  test("leaves out skill changes when none were measured, and shows the actions", () => {
    render(<Debrief {...debrief} skillChanges={{}} actions={<button type="button">Back to Home</button>} />);
    expect(screen.queryByRole("list", { name: "Skill changes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to Home" })).toBeDefined();
  });
});
