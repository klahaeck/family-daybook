import { expect, test } from "@playwright/test";

test("navigation keeps the shell mounted and remains interruptible on a slow connection", async ({ page }, testInfo) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const navigation = page.getByRole("navigation", {
    name: testInfo.project.name === "mobile" ? "Mobile primary" : "Primary",
    exact: true,
  });
  await navigation.evaluate((element) => element.setAttribute("data-persistence-check", "mounted"));

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requested!: () => void;
  const requestStarted = new Promise<void>((resolve) => { requested = resolve; });
  await page.route("**/app/appointments?*", async (route) => {
    requested();
    await gate;
    await route.continue().catch(() => {});
  });

  try {
    await navigation.getByRole("link", { name: "Appointments", exact: true }).click();
    await requestStarted;
    await expect(navigation.getByRole("status").filter({ hasText: "Loading page..." })).toBeVisible();
    await expect(navigation).toHaveAttribute("data-persistence-check", "mounted");

    // A different destination must not wait for the first request to finish.
    await navigation.getByRole("link", { name: "Reports", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Record packages", exact: true })).toBeVisible();
    await expect(navigation).toHaveAttribute("data-persistence-check", "mounted");
    await expect(navigation.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: testInfo.outputPath("persistent-navigation.png"), fullPage: true });
  } finally {
    release();
  }

  await navigation.getByRole("link", { name: "Appointments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
  await expect(navigation).toHaveAttribute("data-persistence-check", "mounted");
  await expect(page.getByRole("region", { name: /^Loading/ })).toHaveCount(0);
});
