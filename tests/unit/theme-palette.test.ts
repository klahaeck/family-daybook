import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { darkColors, lightColors } from "../../apps/mobile/src/theme";

const stylesheet = readFileSync("src/app/globals.css", "utf8");

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const [mode, colors, selector] of [
  ["light", lightColors, ":root"],
  ["dark", darkColors, ".dark"],
] as const) {
  describe(`${mode} palette`, () => {
    const block = stylesheet.split(`${selector} {`)[1].split("}")[0];
    const token = (name: string) => block.match(new RegExp(`--${name}: ([^;]+);`))![1];

    it("keeps web and native core colors aligned", () => {
      for (const [name, color] of Object.entries({
        background: colors.canvas,
        foreground: colors.ink,
        card: colors.surface,
        primary: colors.primary,
        "primary-foreground": colors.primaryForeground,
        secondary: colors.secondary,
        muted: colors.mutedSurface,
        "muted-foreground": colors.muted,
        accent: colors.accent,
      })) {
        expect(token(name).toLowerCase(), name).toBe(color.toLowerCase());
      }
    });

    it("meets AA contrast for text and primary actions", () => {
      for (const surface of [colors.canvas, colors.surface, colors.mutedSurface, colors.secondary, colors.accent]) {
        expect(contrast(colors.ink, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.muted, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(colors.primary, colors.primaryForeground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.primaryPressed, colors.primaryForeground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token("ring"), colors.canvas)).toBeGreaterThanOrEqual(3);
    });
  });
}
