import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { LessonComplete } from "@impromptu/ui";

describe("LessonComplete", () => {
  test("celebrates with the XP gained, the Streak and what to do next", () => {
    const { container } = render(<LessonComplete xpGained={50} streak={4} actions={<button>Next Lesson</button>} />);
    expect(screen.getByRole("heading", { name: "Lesson complete" })).toBeDefined();
    expect(screen.getByText("+50 XP")).toBeDefined();
    expect(container.textContent).toContain("4 day streak");
    expect(screen.getByRole("button", { name: "Next Lesson" })).toBeDefined();
  });

  test("leaves out the XP when it isn't known", () => {
    const { container } = render(<LessonComplete streak={4} />);
    expect(container.textContent).not.toContain("XP");
  });
});
