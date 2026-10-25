import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MarketingSample } from "@fluently/ui";

test("sample explains wrong and right answers, completes and restarts without signup", () => {
  render(<MarketingSample start={<a href="/sign-up" />} />);
  expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Next question" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "I work here since two years." }));
  expect(screen.getByText("Here’s a more natural option.")).toBeTruthy();
  expect(screen.getByText(/Use the present perfect/)).toBeTruthy();
  expect(screen.getByRole("group").hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  expect(screen.getByText("Question 2 of 2")).toBeTruthy();
  expect(screen.queryByText(/Use the present perfect/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Could we move the deadline/ }));
  expect(screen.getByText("That works well.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Finish sample" }));
  expect(screen.getByRole("heading", { name: "You’ve finished the sample" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Start your free assessment" }).getAttribute("href")).toBe("/sign-up");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByText("Question 1 of 2")).toBeTruthy();
  expect(screen.queryByText("That works well.")).toBeNull();
});
