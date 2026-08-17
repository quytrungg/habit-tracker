import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { XpDashboard } from "@/components/rewards/xp-dashboard";

const points = Array.from({ length: 31 }, (_, index) => ({
  date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  earnedXp: index % 2 ? 10 : 0,
  totalXp: Math.floor(index / 2) * 10,
}));

describe("XpDashboard", () => {
  it("renders a cumulative XP chart and allows changing the time range", async () => {
    const user = userEvent.setup();
    render(<XpDashboard points={points} />);

    expect(screen.getByRole("img", { name: "Cumulative XP line chart ending at 150 XP" })).toBeInTheDocument();
    expect(screen.getByText("+150 XP in this range")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "7D" }));
    expect(screen.getByText("+30 XP in this range")).toBeInTheDocument();
  });

  it("explains how to begin when there is no XP history", () => {
    render(<XpDashboard points={[]} />);

    expect(screen.getByText("Check in to start your XP history.")).toBeInTheDocument();
  });
});
