import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("configures a rotation and displays optional contributions", async ({ page }, testInfo) => {
  await page.goto("/app/settings");
  await page.getByRole("tab", { name: "Routine", exact: true }).click();
  const editor = page.getByRole("region", { name: "Parenting schedule", exact: true });
  await editor.getByRole("button", { name: "Enable parenting schedule" }).click();
  await expect(editor.getByLabel("First day of cycle")).toBeVisible();
  await editor.getByRole("button", { name: "2-2-3", exact: true }).first().click();
  await expect(editor.getByRole("button", { name: /week 1 .*My day/ }).first()).toHaveAttribute("aria-pressed", "true");
  const buttons = editor.getByRole("button", { name: /week 1 .*My day/ });
  // Make the anchor day an off day for every child.
  const effective = await editor.getByLabel("Apply changes from").inputValue();
  const firstDay = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${effective}T12:00:00Z`));
  for (const button of await editor.getByRole("button", { name: new RegExp(`week 1 ${firstDay}: My day`) }).all()) await button.click();
  expect(await buttons.count()).toBeGreaterThan(0);
  const axe = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(axe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("parenting-schedule.png"), fullPage: true });
  await page.getByRole("button", { name: "Save routine", exact: true }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
  await page.goto(`/app?date=${effective}`);
  await expect(page.getByText("Off-day contribution", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/0 of 0.*recorded/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("off-day-contributions.png"), fullPage: true });
  // Restore opt-in state so the other viewport starts from legacy behavior.
  await page.goto("/app/settings");
  await page.getByRole("tab", { name: "Routine", exact: true }).click();
  await page.getByRole("button", { name: "Schedule enabled", exact: true }).click();
  await page.getByRole("button", { name: "Save routine", exact: true }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
});
