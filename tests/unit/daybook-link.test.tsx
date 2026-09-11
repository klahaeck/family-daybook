import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DaybookLink } from "@/components/marketing/daybook-link";

describe("DaybookLink", () => {
  it("invites signed-out visitors to create a daybook", () => {
    const markup = renderToStaticMarkup(<DaybookLink signedIn={false} />);

    expect(markup).toContain('href="/sign-up"');
    expect(markup).toContain("Start your daybook");
  });

  it("takes signed-in users to their existing daybook", () => {
    const markup = renderToStaticMarkup(<DaybookLink signedIn />);

    expect(markup).toContain('href="/app"');
    expect(markup).toContain("View your daybook");
  });

  it("keeps the full accessible name when a compact mobile label is shown", () => {
    const markup = renderToStaticMarkup(
      <DaybookLink signedIn={false} compactLabel="Start" />,
    );

    expect(markup).toContain('aria-label="Start your daybook"');
    expect(markup).toContain('class="sm:hidden">Start</span>');
  });
});
