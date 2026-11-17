// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShellSkeleton, PageSkeleton } from "@/components/app/page-skeleton";

describe("page loading placeholders", () => {
  it.each(["dashboard", "list", "settings"] as const)("renders accessible %s placeholders without fake controls", (variant) => {
    const { container } = render(<PageSkeleton label="appointments" variant={variant} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading appointments...");
    expect(screen.getByRole("region", { name: "Loading appointments" })).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
    expect(container.querySelectorAll(".motion-safe\\:animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders an initial shell without exposing account information", () => {
    render(<AppShellSkeleton />);
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Loading page...");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
