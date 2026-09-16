import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandLogo } from "@/components/app/brand-logo";

describe("BrandLogo", () => {
  it("uses purpose-built artwork for each color theme", () => {
    const markup = renderToStaticMarkup(<BrandLogo className="w-48" />);

    expect(markup).toContain('src="/family-daybook-logo.svg"');
    expect(markup).toContain('class="h-auto dark:hidden w-48"');
    expect(markup).toContain('src="/family-daybook-logo-dark.svg"');
    expect(markup).toContain('class="hidden h-auto dark:block w-48"');
    expect(markup.match(/alt="Family Daybook"/g)).toHaveLength(2);
  });

  it("keeps both theme variants decorative when requested", () => {
    const markup = renderToStaticMarkup(<BrandLogo decorative />);

    expect(markup.match(/alt=""/g)).toHaveLength(2);
    expect(markup.match(/aria-hidden="true"/g)).toHaveLength(2);
  });
});
