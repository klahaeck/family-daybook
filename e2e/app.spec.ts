import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public homepage presents the Family Daybook brochure", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A calmer way to keep the days that matter clear." })).toBeVisible();
  await expect(page.locator('[aria-label="Example Family Daybook dashboard"]')).toBeVisible();
  const startLinks = page.getByRole("link", { name: "Start your daybook" });
  await expect(startLinks).toHaveCount(3);
  for (const link of await startLinks.all()) {
    await expect(link).toHaveAttribute("href", "/sign-up");
  }
  await expect(page.getByRole("link", { name: "View your daybook" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/sign-in");
  await expect(page.getByRole("link", { name: "Privacy", exact: true }).last()).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Agent access", exact: true }).first()).toHaveAttribute("href", "/agent-access");
  await expect(page.getByRole("link", { name: "Support", exact: true })).toHaveAttribute("href", "/support");
  await expect(page.getByText(/local demo workspace/i)).toHaveCount(0);
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd ?? "{}")["@graph"]).toHaveLength(3);
});

test("appearance follows the system by default and saves an override", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const root = page.locator("html");
  const appearance = page.getByRole("button", { name: "Choose appearance" }).first();
  await expect(root).toHaveClass(/\bdark\b/);

  await appearance.click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(root).not.toHaveClass(/\bdark\b/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(root).not.toHaveClass(/\bdark\b/);

  await appearance.click();
  await page.getByRole("menuitemradio", { name: "System" }).click();
  await expect(root).toHaveClass(/\bdark\b/);
});

test("public pages have no serious accessibility violations", async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of [
    "/",
    "/pricing",
    "/co-parenting-recordkeeping",
    "/agent-access",
    "/features/record-integrity",
    "/features/report-packages",
    "/features/reviewer-access",
    "/guides/factual-family-records",
    "/privacy",
    "/terms",
    "/support",
  ]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(
        (violation) => violation.impact === "critical" || violation.impact === "serious",
      ),
      `${path} should have no serious accessibility violations`,
    ).toEqual([]);
  }
});

test("public pricing explains owner billing and reviewer coverage", async ({ page }) => {
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", { name: "Choose the plan for your family daybook." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reviewers are included" })).toBeVisible();
  await expect(page.getByText("Billing preview unavailable")).toBeVisible();
});

test("public legal pages use the private support form without prohibited identity details", async ({ page }) => {
  await page.goto("/privacy", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "About this service" })).toBeVisible();
  await expect(page.getByRole("link", { name: /support form/i }).first()).toHaveAttribute("href", "/support");
  let legalText = await page.locator("main").innerText();
  expect(legalText).not.toMatch(/Draft placeholders|mailing address|governing law|jurisdiction/i);
  expect(legalText).not.toMatch(/[A-Z0-9._%+-]+@myfamilydaybook\.com/i);

  await page.goto("/terms", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
  await expect(page.getByRole("link", { name: /support form/i }).first()).toHaveAttribute("href", "/support");
  legalText = await page.locator("main").innerText();
  expect(legalText).not.toMatch(/Draft placeholders|mailing address|governing law|jurisdiction/i);
  expect(legalText).not.toMatch(/[A-Z0-9._%+-]+@myfamilydaybook\.com/i);
});

test("support is a private noindex form with bounded fields", async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Family Daybook support" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex, follow/);
  await expect(page.getByLabel("Name (optional)")).toHaveAttribute("maxlength", "100");
  await expect(page.getByLabel("Reply email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Topic")).toBeVisible();
  await expect(page.getByLabel("Message")).toHaveAttribute("minlength", "10");
  await expect(page.getByLabel("Message")).toHaveAttribute("maxlength", "4000");
});

test("agent access documents the live catalog and safety contract", async ({ page }) => {
  await page.goto("/agent-access");
  await expect(page.getByRole("heading", { name: "Let an authorized assistant help with the daybook." })).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:3100/mcp", { exact: true })).toBeVisible();
  await expect(page.locator("code", { hasText: /^get_/ })).toHaveCount(3);
  await expect(page.locator("code", { hasText: /^create_|^update_|^preview_|^confirm_/ })).toHaveCount(7);
  await expect(page.getByText(/cannot cross workspace boundaries/i)).toBeVisible();
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd ?? "{}")["@graph"]).toHaveLength(2);
});

test("feature evidence pages state their evidence and limits", async ({ page, request }) => {
  test.setTimeout(60_000);
  const expectations = [
    ["/features/record-integrity", "Record integrity without hidden rewrites", /do not make the service.*tamper-proof/i],
    ["/features/report-packages", "Organized report packages with a stable snapshot", /snapshot, not a live view/i],
    ["/features/reviewer-access", "Read-only reviewer access with clear boundaries", /cannot retract files/i],
    ["/guides/factual-family-records", "How to write clear, factual family records", /Synthetic example/i],
  ] as const;

  for (const [path, heading, limit] of expectations) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(limit).first()).toBeVisible();
  }

  const sample = await request.get("/samples/report-package-manifest.json");
  expect(sample.ok()).toBe(true);
  await expect(sample.json()).resolves.toMatchObject({
    schemaVersion: 2,
    workspaceId: "workspace_synthetic_example",
  });
});

test("public routes expose the intended crawler metadata", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://127.0.0.1:3100",
  );

  await page.goto("/app");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex, nofollow/);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /app");
  expect(robots).toContain("Disallow: /api");
  expect(robots).toContain("Disallow: /.well-known/workflow/");
  expect(robots).toContain("Allow: /.well-known/oauth-protected-resource/mcp");
  expect(robots).not.toContain("Disallow: /.well-known\n");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/pricing</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/privacy</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/terms</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/agent-access</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/features/record-integrity</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/features/report-packages</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/features/reviewer-access</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/guides/factual-family-records</loc>");
  expect(sitemap).not.toContain("/app</loc>");
  expect(sitemap).not.toContain("/support</loc>");
  expect(sitemap).not.toContain("<lastmod>");

  const capabilities = await request.get("/agent-capabilities.json");
  expect(capabilities.ok()).toBe(true);
  expect(capabilities.headers()["access-control-allow-origin"]).toBe("*");
  const capabilityBody = await capabilities.json();
  expect(capabilityBody.mcp.endpoint).toBe("http://127.0.0.1:3100/mcp");
  expect(capabilityBody.tools).toHaveLength(10);

  const llms = await request.get("/llms.txt");
  expect(llms.ok()).toBe(true);
  expect(llms.headers()["content-type"]).toContain("text/plain");
  expect(await llms.text()).toContain("http://127.0.0.1:3100/agent-access");

  for (const userAgent of ["OAI-SearchBot", "PerplexityBot"]) {
    const response = await request.get("/agent-access", {
      headers: { "User-Agent": userAgent },
    });
    expect(response.status()).toBe(200);
  }
});

test("social images are privacy-safe 1200 by 630 PNGs", async ({ request }) => {
  for (const path of ["/opengraph-image", "/twitter-image"]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const image = await response.body();
    expect(image.subarray(1, 4).toString()).toBe("PNG");
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
  }
});

test("legacy application routes permanently redirect under app", async ({ request }) => {
  const apexResponse = await request.get("/agent-access", {
    headers: { Host: "myfamilydaybook.com" },
    maxRedirects: 0,
  });
  expect(apexResponse.status()).toBe(308);
  expect(apexResponse.headers().location).toBe(
    "https://www.myfamilydaybook.com/agent-access",
  );

  const redirects = [
    ["/timeline", "/app/timeline"],
    ["/appointments", "/app/appointments"],
    ["/incidents", "/app/incidents"],
    ["/reports", "/app/reports"],
    ["/settings", "/app/settings"],
  ];

  for (const [source, destination] of redirects) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(destination);
  }

  const datedResponse = await request.get("/?date=2026-07-15", { maxRedirects: 0 });
  expect(datedResponse.status()).toBe(308);
  expect(datedResponse.headers().location).toBe("/app?date=2026-07-15");
});

test("shows the daily care workflow", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText("Daily care log", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /today’s routine/i })).toBeVisible();
  await expect(page.getByText(/local demo workspace/i)).toBeVisible();
  await expect(page.getByLabel("Next day")).toBeDisabled();
});

test("records missed and not-applicable items without caregivers", async ({ page, request }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Run the stateful status flow once on desktop Chromium.",
  );

  await page.goto("/app");
  await page.getByRole("button", { name: "Record Naptime" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Missed" }).click();

  await expect(dialog.getByText("Who provided the care?", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("When was it expected?")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save record" })).toBeEnabled();
  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Save record" }).click();

  const missedCard = page.getByRole("button", { name: "Change Naptime" });
  await expect(missedCard.getByText("Missed", { exact: true })).toBeVisible();
  let timeline = (await (await request.get("/api/timeline")).json()) as {
    items: Array<{ title: string; status: string; caregiverIds: string[] }>;
  };
  expect(
    timeline.items.find(
      (item) => item.title === "Naptime" && item.status === "missed",
    )?.caregiverIds,
  ).toEqual([]);

  await missedCard.click();
  await page.getByRole("dialog").getByRole("button", { name: "Not applicable" }).click();
  await expect(page.getByRole("dialog").getByLabel("Routine time")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(
    page
      .getByRole("button", { name: "Change Naptime" })
      .getByText("Not applicable", { exact: true }),
  ).toBeVisible();

  timeline = (await (await request.get("/api/timeline")).json()) as {
    items: Array<{ title: string; status: string; caregiverIds: string[] }>;
  };
  expect(
    timeline.items.find(
      (item) => item.title === "Naptime" && item.status === "not_applicable",
    )?.caregiverIds,
  ).toEqual([]);

  await page.goto("/app/timeline");
  await page.getByLabel("Search timeline").fill("Naptime");
  const timelineCard = page.locator('[data-slot="card"]').filter({ hasText: "Naptime" });
  await expect(timelineCard.getByText("Not applicable", { exact: true })).toBeVisible();
  await expect(timelineCard.getByText(/Routine time/)).toBeVisible();
  await page.getByLabel("Filter by caregiver").selectOption({ label: "Parent A" });
  await expect(page.getByText("No records match these filters.", { exact: true })).toBeVisible();
});

test("timeline record charts show records and respond to toggles", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Run the stateful chart interaction check once on desktop Chromium.",
  );
  await page.goto("/app/timeline");
  await expect(page.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("tab", { name: "Record charts" }).click();
  await expect(
    page.getByRole("heading", { name: "Configure charts" }),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Included records" })
      .getByText("3", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Records by caregiver" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Records by item" }),
  ).toBeVisible();
  const includedRecords = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Included records" }) });
  await expect(includedRecords.getByText("Child One", { exact: true })).toHaveCount(3);
  await expect(includedRecords.getByText("Parent A", { exact: true })).toHaveCount(3);

  const caregiverFilters = page.locator("fieldset").filter({
    has: page.getByText("Caregivers", { exact: true }),
  });
  await caregiverFilters.getByRole("button", { name: "Clear" }).click();
  await expect(
    page.getByText("No care records match", { exact: true }),
  ).toBeVisible();
  await caregiverFilters.getByRole("button", { name: "All" }).click();
  await expect(
    page.getByRole("heading", { name: "Records by caregiver" }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
});

test("mobile public and dashboard content stays within the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "This regression targets the narrow mobile layout.");

  for (const path of ["/", "/app", "/app/special-days", "/app/timeline"]) {
    await page.goto(path);
    if (path === "/app/timeline") {
      await page.getByRole("tab", { name: "Record charts" }).click();
    }
    const layout = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const visibleElements = Array.from(
        document.querySelectorAll<HTMLElement>("main, main [data-slot='card'], main section button"),
      );

      return {
        viewportWidth,
        documentWidth: document.documentElement.scrollWidth,
        overflowingElements: visibleElements
          .filter((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left < -0.5 || bounds.right > viewportWidth + 0.5;
          })
          .map((element) => ({
            tag: element.tagName,
            text: element.textContent?.trim().slice(0, 80),
            bounds: element.getBoundingClientRect().toJSON(),
          })),
      };
    });

    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(layout.overflowingElements).toEqual([]);
  }
});

test("mobile navigation exposes account controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "This regression targets the mobile navigation drawer.");

  await page.goto("/app");
  await page.getByRole("button", { name: "Open navigation" }).click();

  await expect(page.getByRole("heading", { name: "Navigation" })).toBeVisible();
  await expect(page.getByText("Account", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo account", { exact: true })).toBeVisible();
});

test("primary pages have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/app", "/app/special-days"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    expect(
      results.violations.filter(
        (violation) =>
          violation.impact === "critical" || violation.impact === "serious",
      ),
    ).toEqual([]);
  }
});

test("settings groups family, routine, and access into focused tabs", async ({ page }) => {
  await page.goto("/app/settings");

  await expect(page.getByRole("tab", { name: "Family" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Family workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly routine" })).not.toBeVisible();

  await page.getByRole("tab", { name: "Routine" }).click();
  await expect(page.getByRole("heading", { name: "Weekly routine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week at a glance" })).toBeVisible();
  await expect(page.getByText(/active items?$/)).toBeVisible();

  await page.getByRole("tab", { name: "Access" }).click();
  await expect(page.getByRole("heading", { name: "Reviewers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security posture" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
});

test("shows saved routine changes on Today", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Run the stateful settings check once on desktop Chromium.");
  const marker = Date.now().toString();

  await page.goto("/app");
  const dateInput = page.getByRole("textbox", { name: "Log date", exact: true });
  const today = await dateInput.inputValue();
  const [year, month, day] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  await dateInput.fill(previous);
  await expect(page.getByRole("textbox", { name: "Log date", exact: true })).toHaveValue(previous);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Routine" }).click();
  const firstRoutine = page.getByLabel("Routine label").first();
  const originalLabel = await firstRoutine.inputValue();
  const updatedLabel = `${originalLabel} ${marker}`;
  await firstRoutine.fill(updatedLabel);
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByText(updatedLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(originalLabel, { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Log date", exact: true }).fill(previous);
  await expect(page.getByText(updatedLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(originalLabel, { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Routine" }).click();
  await page.getByLabel("Routine label").first().fill(originalLabel);
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
});

test("owner can plan a past-to-present range and use a special-task caregiver default", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Run the stateful special-arrangement flow once on desktop Chromium.",
  );
  const marker = Date.now().toString();
  const title = `Camping weekend ${marker}`;
  const plannedTask = `Pack camping gear ${marker}`;

  await page.goto("/app/special-days");
  await expect(
    page.getByRole("heading", { name: "Special days" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New arrangement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arrangement name").fill(title);
  const today = await dialog.getByLabel("Starts").inputValue();
  const [year, month, day] = today.split("-").map(Number);
  const previousDate = new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
  await dialog.getByLabel("Starts").fill(previousDate);
  await expect(dialog.getByLabel("Through")).toHaveValue(today);
  await dialog.getByText("Parent B", { exact: true }).click();
  await dialog.getByLabel("Task").first().fill(plannedTask);
  await dialog.getByRole("button", { name: "Save arrangement" }).click();

  await expect(page.getByRole("heading", { name: title })).toHaveCount(2);
  await page.goto("/app/timeline");
  await page.getByLabel("Search timeline").fill(title);
  await expect(
    page.locator('[data-slot="card"]').filter({ hasText: title }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Special days" }).click();
  await expect(page.getByText("Special day", { exact: true })).toHaveCount(2);
  await page.goto("/app");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Today’s special-day plan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Record ${plannedTask}` }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("checkbox", { name: /Parent B/ }),
  ).toBeChecked();
  await page.keyboard.press("Escape");

  await page.goto("/app/special-days");
  for (let index = 0; index < 2; index += 1) {
    const activeCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: title })
      .filter({ hasText: "Active" })
      .first();
    await activeCard.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByRole("checkbox", { name: /Arrangement is active/ })
      .click();
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).not.toBeVisible();
  }
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ hasText: title })
      .filter({ hasText: "Cancelled" }),
  ).toHaveCount(2);
});

test("owner can complete the auditable record lifecycle", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Run the stateful lifecycle once on desktop Chromium.");
  test.setTimeout(90_000);

  const marker = Date.now().toString();
  const appointmentStatuses = ["attended", "late", "missed"] as const;
  const observation = `At 4:05 PM, water was observed on the tile beside the bathtub. Test ${marker}.`;
  const correctedObservation = `${observation} A towel was placed on the tile at 4:07 PM.`;
  const attachmentName = `safety-video-${marker}.mp4`;

  await page.goto("/app");
  await page.getByRole("button", { name: /Time together/ }).click();
  await expect(page.getByRole("heading", { name: "Time together" })).toBeVisible();
  await page.getByText("Parent B", { exact: true }).click();
  await page.getByLabel("Duration in minutes").fill("45");
  await page.getByLabel("Activity type").fill("Reading and homework");
  await page.getByLabel("Factual notes (optional)").fill(`Both children read at the kitchen table. Test ${marker}.`);
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("heading", { name: "Time together" })).not.toBeVisible();

  await page.goto("/app/appointments");
  for (const status of appointmentStatuses) {
    const title = `${status[0].toUpperCase()}${status.slice(1)} appointment ${marker}`;
    await page.getByRole("button", { name: "Add appointment" }).click();
    await page.getByRole("textbox", { name: "Appointment", exact: true }).fill(title);
    await page.getByRole("button", { name: status, exact: true }).click();
    await page.getByLabel("Factual notes (optional)").fill(`Attendance outcome recorded as ${status}.`);
    await page.getByRole("button", { name: "Save appointment" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }

  await page.goto("/app/incidents");
  await page.getByRole("button", { name: "Add incident" }).click();
  await page.getByLabel("Location (optional)").fill("Upstairs bathroom");
  await page.getByLabel("People present").fill("Parent A, Parent B");
  await page.getByLabel("Other witnesses").fill("None");
  await page.getByLabel("What was directly observed?").fill(observation);
  await page.getByLabel("Immediate actions").fill("A towel was placed over the wet area.");
  await page.getByLabel("Outcome").fill("The floor was dry when checked again at 4:12 PM.");
  await page.getByRole("button", { name: "Save factual record" }).click();
  await expect(page.getByText(observation, { exact: true })).toBeVisible();

  const incidentCard = page.locator('[data-slot="card"]').filter({ hasText: observation });
  await incidentCard.getByRole("button", { name: "Add supporting files" }).click();
  const attachmentDialog = page.getByRole("dialog", { name: "Add supporting files" });
  await attachmentDialog.locator('input[type="file"]').setInputFiles({
    name: attachmentName,
    mimeType: "video/mp4",
    buffer: Buffer.from(
      "000000186674797069736f6d0000020069736f6d69736f32",
      "hex",
    ),
  });
  await attachmentDialog.getByRole("button", { name: "Upload files" }).click();
  const incidentAttachment = incidentCard.getByRole("link").filter({ hasText: attachmentName });
  await expect(incidentAttachment).toBeVisible();
  const attachmentHref = await incidentAttachment.getAttribute("href");
  expect(attachmentHref).toBeTruthy();
  const attachmentResponse = await request.get(attachmentHref!);
  expect(attachmentResponse.ok()).toBe(true);
  expect(attachmentResponse.headers()["content-type"]).toBe("video/mp4");
  expect(
    (await attachmentResponse.body()).equals(
      Buffer.from(
        "000000186674797069736f6d0000020069736f6d69736f32",
        "hex",
      ),
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.locator('[data-slot="card"]').filter({ hasText: observation }).getByRole("link").filter({ hasText: attachmentName }),
  ).toBeVisible();

  const reloadedIncidentCard = page.locator('[data-slot="card"]').filter({ hasText: observation });
  await reloadedIncidentCard.getByRole("button", { name: "Correct" }).click();
  await page.getByLabel("Corrected factual text").fill(correctedObservation);
  await page.getByLabel("Reason for correction").fill("Added the directly observed response time.");
  await page.getByRole("button", { name: "Append correction" }).click();
  await expect(page.getByRole("main").getByText(correctedObservation, { exact: true })).toBeVisible();

  await page.goto("/app");
  await page.getByRole("button", { name: "Finalize day" }).click();
  await expect(page.getByText("Finalized", { exact: true })).toBeVisible();

  await page.goto("/app/timeline");
  await page.getByLabel("Search timeline").fill("water was observed");
  const timelineCard = page.locator('[data-slot="card"]').filter({ hasText: correctedObservation });
  await expect(timelineCard.getByRole("link", { name: attachmentName })).toHaveAttribute(
    "href",
    attachmentHref!,
  );
  await timelineCard.getByRole("button", { name: "History (2)" }).click();
  await expect(page.getByText("Revision 2", { exact: true })).toBeVisible();
  await expect(page.getByText(/SHA-256:/).first()).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/app/reports");
  await page.getByRole("button", { name: "Create report" }).click();
  await page.getByRole("button", { name: "Generate package" }).click();
  const pdfLink = page.getByRole("link", { name: "PDF" }).first();
  const zipLink = page.getByRole("link", { name: "Evidence ZIP" }).first();
  await expect(pdfLink).toBeVisible({ timeout: 30_000 });
  const pdfHref = await pdfLink.getAttribute("href");
  const zipHref = await zipLink.getAttribute("href");
  expect(pdfHref).toBeTruthy();
  expect(zipHref).toBeTruthy();
  const pdfResponse = await request.get(pdfHref!);
  const zipResponse = await request.get(zipHref!);
  expect(pdfResponse.ok()).toBe(true);
  expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect(zipResponse.ok()).toBe(true);
  expect(Array.from((await zipResponse.body()).subarray(0, 2))).toEqual([80, 75]);

  await page.goto("/app/settings");
  await expect(page.getByRole("tab", { name: "Family" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Routine" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tab", { name: "Access" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByLabel("Display name")).toHaveCount(1);
  await expect(page.getByLabel("Birthdate")).toHaveCount(1);
  const childName = `Child ${marker}`;
  await page.getByRole("button", { name: "Add child" }).click();
  await page.getByLabel("Display name").last().fill(childName);
  await page.getByLabel("Birthdate").last().fill("2020-01-15");
  await expect(page.getByText(/years old/).last()).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "IANA timezone" })).toBeVisible();
  const caregiverName = `Grandparent ${marker}`;
  await page.getByRole("button", { name: "Add caregiver" }).click();
  await page.getByLabel("Name", { exact: true }).last().fill(caregiverName);
  await page.getByRole("combobox", { name: "Relationship" }).last().click();
  await page.getByRole("option", { name: "Grandparent", exact: true }).click();
  await page.getByRole("switch", { name: "Allow permanent deletion" }).click();
  await page.getByRole("button", { name: "Save family settings" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Routine" }).click();
  await expect(page.getByRole("heading", { name: "Week at a glance" })).toBeVisible();
  const removedRoutineLabel = await page.getByLabel("Routine label").first().inputValue();
  await page.getByRole("button", { name: `Remove ${removedRoutineLabel}` }).click();
  await page.getByRole("button", { name: "Add routine item" }).click();
  const newRoutineIndex = await page.getByLabel("Routine label").evaluateAll((inputs) =>
    inputs.findIndex((input) => !(input as HTMLInputElement).value),
  );
  expect(newRoutineIndex).toBeGreaterThanOrEqual(0);
  await page.getByLabel("Routine label").nth(newRoutineIndex).fill(`Evening walk ${marker}`);
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Routine" }).click();
  const savedRoutineLabels = await page.getByLabel("Routine label").evaluateAll(
    (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
  );
  expect(savedRoutineLabels).toContain(`Evening walk ${marker}`);
  expect(savedRoutineLabels).not.toContain(removedRoutineLabel);
  await page.getByRole("tab", { name: "Family" }).click();
  await expect(page.getByLabel("Display name")).toHaveCount(2);
  await expect(page.getByLabel("Display name").last()).toHaveValue(childName);
  await expect(page.getByLabel("Birthdate").last()).toHaveValue("2020-01-15");
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(3);
  await expect(page.getByLabel("Name", { exact: true }).last()).toHaveValue(caregiverName);
  await expect(page.getByRole("combobox", { name: "Relationship" }).last()).toContainText("Grandparent");

  await page.getByRole("tab", { name: "Access" }).click();
  await expect(page.getByText("Reviewers", { exact: true })).toBeVisible();
  const reviewerNames = [`Reviewer A ${marker}`, `Reviewer B ${marker}`];
  await expect(page.getByLabel("Reviewer name")).toHaveCount(0);
  await page.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await page.getByRole("button", { name: "Delete reviewer 1" }).click();
  await expect(page.getByLabel("Reviewer name")).toHaveCount(0);
  await page.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await page.getByLabel("Reviewer name").fill(reviewerNames[0]);
  await page.getByLabel("Email").fill(`reviewer-a-${marker}@example.com`);
  await page.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await page.getByLabel("Reviewer name").nth(1).fill(reviewerNames[1]);
  await page.getByLabel("Email").nth(1).fill(`reviewer-b-${marker}@example.com`);
  await expect(page.getByRole("button", { name: "Invite reviewer" })).toHaveCount(2);
  await page.getByRole("button", { name: "Invite reviewer" }).first().click();
  await expect(page.getByText("Reviewer invitation created.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Reviewer name")).toHaveCount(1);
  await expect(page.getByLabel("Reviewer name")).toHaveValue(reviewerNames[1]);
  await page.getByRole("button", { name: "Invite reviewer" }).click();
  await expect(page.getByLabel("Reviewer name")).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Access" }).click();
  await expect(page.getByText(reviewerNames[0], { exact: true })).toBeVisible();
  await expect(page.getByText(reviewerNames[1], { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Revoke ${reviewerNames[0]}` }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();

  await page.goto("/app/incidents");
  const purgeCard = page.locator('[data-slot="card"]').filter({ hasText: correctedObservation });
  await purgeCard.getByRole("button", { name: "Remove incident" }).click();
  await page.getByLabel("Reason for deletion").fill("Permanent deletion requested for the automated lifecycle test.");
  await page.getByLabel("Type PERMANENTLY DELETE").fill("PERMANENTLY DELETE");
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await expect(page.getByText(correctedObservation, { exact: true })).toHaveCount(0);
  expect((await request.get(attachmentHref!)).status()).toBe(404);

  await page.goto("/app/reports");
  await expect(page.getByText("No report snapshots yet", { exact: true })).toBeVisible();
});

test("adds a record to the previous day without labeling it as a late entry", async ({ page }) => {
  const marker = Date.now().toString();
  const label = `Historical caregiving ${marker}`;
  await page.goto("/app");
  const dateInput = page.getByRole("textbox", { name: "Log date", exact: true });
  const today = await dateInput.inputValue();
  const [year, month, day] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);

  await dateInput.fill(previous);
  await expect(page).toHaveURL(new RegExp(`date=${previous}`));
  await expect(page.getByRole("textbox", { name: "Log date", exact: true })).toHaveValue(previous);
  await expect(page.getByText("Historical day", { exact: true })).toBeVisible();
  await expect(page.getByText(/following calendar day/i)).toBeVisible();

  await page.getByRole("button", { name: "Add record" }).click();
  await page.getByLabel("Activity").fill(label);
  await expect(page.getByLabel("When did it occur?")).toHaveValue(new RegExp(`^${previous}T`));
  await page.getByLabel("Factual notes (optional)").fill("Lunch was prepared and served at the kitchen table.");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("heading", { name: "Add caregiving record" })).not.toBeVisible();

  await page.goto("/app/timeline");
  await page.getByLabel("Search timeline").fill(label);
  const card = page.locator('[data-slot="card"]').filter({ hasText: label });
  await expect(card.getByText("Late entry", { exact: true })).toHaveCount(0);
  await expect(card.getByText(/Occurred/)).toBeVisible();
  await expect(card.getByText(/Entered/)).toBeVisible();

  await page.goto("/app?date=9999-12-31");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("textbox", { name: "Log date", exact: true })).toHaveValue(today);
});
