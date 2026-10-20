import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { House, MapTrifold } from "@phosphor-icons/react";
import { AppShell, PracticeShell, StreakChip, XpChip } from "@fluently/ui";

describe("StreakChip", () => {
  test("reads as the Streak in days", () => {
    expect(render(<StreakChip days={12} />).container.textContent).toBe("12 day streak");
  });
});

describe("XpChip", () => {
  test("reads as the XP total", () => {
    expect(render(<XpChip xp={340} />).container.textContent).toBe("340 XP");
  });
});

describe("AppShell", () => {
  const destinations = [
    { label: "Home", icon: House, render: <a href="/" /> },
    // A router link marks the current destination with aria-current, as TanStack Router's Link does.
    { label: "Roadmap", icon: MapTrifold, render: <a href="/roadmap" aria-current="page" /> },
  ];

  test("puts each destination in the navigation as a link rendered through `render`", () => {
    render(<AppShell destinations={destinations}>Today</AppShell>);
    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Home", "/"],
      ["Roadmap", "/roadmap"],
    ]);
  });

  test("keeps the current destination marked", () => {
    render(<AppShell destinations={destinations}>Today</AppShell>);
    expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Roadmap");
  });

  test("shows the page title as the heading in the top bar with the status, and the screen in main", () => {
    render(
      <AppShell destinations={destinations} title="Home" status={<StreakChip days={3} />}>
        Today
      </AppShell>,
    );
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toBe("Home3 day streak");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Home");
    expect(screen.getByRole("main").textContent).toBe("Today");
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <AppShell destinations={[]} className="x" />;
    // @ts-expect-error style is not a prop
    <AppShell destinations={[]} style={{}} />;
  });
});

describe("PracticeShell", () => {
  test("shows the screen with no navigation, only a close action", () => {
    const onClose = mock();
    render(<PracticeShell onClose={onClose}>Step 1</PracticeShell>);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("main").textContent).toBe("Step 1");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("with closeRender, closing is a link that still calls onClose", () => {
    const onClose = mock();
    render(<PracticeShell closeRender={<a href="/" />} onClose={onClose} />);
    const close = screen.getByRole("link", { name: "Close" });
    expect(close.getAttribute("href")).toBe("/");
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <PracticeShell className="x" />;
    // @ts-expect-error style is not a prop
    <PracticeShell style={{}} />;
  });
});
