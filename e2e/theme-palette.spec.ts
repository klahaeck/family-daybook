import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const mode of ["light", "dark"] as const) {
  test(`${mode} palette stays readable across public and app screens`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: mode });

    for (const path of ["/", "/app", "/app/settings"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${mode}\\b`));
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        mode === "light" ? "rgb(247, 249, 251)" : "rgb(37, 45, 52)",
      );
      const violations = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      expect(violations.violations, `${mode} ${path} text contrast`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const name = `${mode}-${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}`;
      const screenshot = await page.screenshot({
        path: testInfo.outputPath(`${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await testInfo.attach(name, {
        body: screenshot,
        contentType: "image/png",
      });
    }
  });
}
