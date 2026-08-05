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
  await expect(page.getByText(/local demo workspace/i)).toHaveCount(0);
});

test("public pages have no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
});

test("public pricing explains owner billing and reviewer coverage", async ({ page }) => {
  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", { name: "Choose the plan for your family daybook." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reviewers are included" })).toBeVisible();
  await expect(page.getByText("Billing preview unavailable")).toBeVisible();
});

test("public legal pages show the current operator and governing law", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(
    page.getByText(/Family Daybook is operated by Family Daybook/),
  ).toBeVisible();

  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
  await expect(
    page.getByText(/governed by the laws of MN, USA/),
  ).toBeVisible();
});

test("public routes expose the intended crawler metadata", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);

  await page.goto("/app");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex, nofollow/);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /app");
  expect(robots).toContain("Disallow: /api");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/pricing</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/privacy</loc>");
  expect(sitemap).toContain("<loc>http://127.0.0.1:3100/terms</loc>");
  expect(sitemap).not.toContain("/app</loc>");
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

test("timeline time charts show recorded duration and respond to toggles", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Run the stateful chart interaction check once on desktop Chromium.",
  );
  await page.goto("/app/timeline");
  await expect(page.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("tab", { name: "Time charts" }).click();
  await expect(
    page.getByRole("heading", { name: "Configure charts" }),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Recorded care time" })
      .getByText("1h 15m", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Time by caregiver" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Time by record item" }),
  ).toBeVisible();

  const caregiverFilters = page.locator("fieldset").filter({
    has: page.getByText("Caregivers", { exact: true }),
  });
  await caregiverFilters.getByRole("button", { name: "Clear" }).click();
  await expect(
    page.getByText("No recorded duration matches", { exact: true }),
  ).toBeVisible();
  await caregiverFilters.getByRole("button", { name: "All" }).click();
  await expect(
    page.getByRole("heading", { name: "Time by caregiver" }),
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
      await page.getByRole("tab", { name: "Time charts" }).click();
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
  const firstRoutine = page.getByLabel("Routine label").first();
  const originalLabel = await firstRoutine.inputValue();
  const updatedLabel = `${originalLabel} ${marker}`;
  await firstRoutine.fill(updatedLabel);
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByText(updatedLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(originalLabel, { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Log date", exact: true }).fill(previous);
  await expect(page.getByText(updatedLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(originalLabel, { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Routine label").first().fill(originalLabel);
  await page.getByRole("button", { name: "Save workspace" }).click();
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
  const attachmentName = `safety-note-${marker}.png`;

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
  await page.locator('input[type="file"]').setInputFiles({
    name: attachmentName,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Save factual record" }).click();
  await expect(page.getByText(observation, { exact: true })).toBeVisible();

  const incidentCard = page.locator('[data-slot="card"]').filter({ hasText: observation });
  await incidentCard.getByRole("button", { name: "Correct" }).click();
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
  const attachmentHref = await timelineCard.getByRole("link", { name: attachmentName }).getAttribute("href");
  expect(attachmentHref).toBeTruthy();
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
  await expect(page.getByText("Reviewers", { exact: true })).toBeVisible();
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
  const removedRoutineLabel = await page.getByLabel("Routine label").first().inputValue();
  await page.getByRole("button", { name: `Remove ${removedRoutineLabel}` }).click();
  await page.getByRole("button", { name: "Add routine item" }).click();
  const newRoutineIndex = await page.getByLabel("Routine label").evaluateAll((inputs) =>
    inputs.findIndex((input) => !(input as HTMLInputElement).value),
  );
  expect(newRoutineIndex).toBeGreaterThanOrEqual(0);
  await page.getByLabel("Routine label").nth(newRoutineIndex).fill(`Evening walk ${marker}`);
  await page.getByRole("switch", { name: "Allow permanent deletion" }).click();
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
  await page.reload();
  const savedRoutineLabels = await page.getByLabel("Routine label").evaluateAll(
    (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
  );
  expect(savedRoutineLabels).toContain(`Evening walk ${marker}`);
  expect(savedRoutineLabels).not.toContain(removedRoutineLabel);
  await expect(page.getByLabel("Display name")).toHaveCount(2);
  await expect(page.getByLabel("Display name").last()).toHaveValue(childName);
  await expect(page.getByLabel("Birthdate").last()).toHaveValue("2020-01-15");
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(3);
  await expect(page.getByLabel("Name", { exact: true }).last()).toHaveValue(caregiverName);
  await expect(page.getByRole("combobox", { name: "Relationship" }).last()).toContainText("Grandparent");

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
  await expect(page.getByText(reviewerNames[0], { exact: true })).toBeVisible();
  await expect(page.getByText(reviewerNames[1], { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Revoke ${reviewerNames[0]}` }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();

  await page.goto("/app/timeline");
  await page.getByLabel("Search timeline").fill("water was observed");
  const purgeCard = page.locator('[data-slot="card"]').filter({ hasText: correctedObservation });
  await purgeCard.getByRole("button", { name: "Purge" }).click();
  await page.getByLabel("Reason for deletion").fill("Permanent deletion requested for the automated lifecycle test.");
  await page.getByLabel("Type PERMANENTLY DELETE").fill("PERMANENTLY DELETE");
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await expect(page.getByText("No records match these filters.", { exact: true })).toBeVisible();
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
