import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MarketingShell } from "@/components/marketing/marketing-shell";

vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));

describe("MarketingShell", () => {
  it("shows sign-in links to signed-out visitors", () => {
    const markup = renderToStaticMarkup(<MarketingShell>Content</MarketingShell>);

    expect(markup.match(/Sign in/g)).toHaveLength(3);
    expect(markup.match(/href="\/pricing"/g)).toHaveLength(3);
    expect(markup.match(/href="\/agent-access"/g)).toHaveLength(3);
    expect(markup).toContain('href="/support"');
    expect(markup).not.toContain("Sign out");
  });

  it("shows explicit sign-out controls to signed-in visitors", () => {
    const markup = renderToStaticMarkup(
      <MarketingShell signedIn>Content</MarketingShell>,
    );

    expect(markup.match(/Sign out/g)).toHaveLength(3);
    expect(markup).not.toContain("Sign in");
  });
});
