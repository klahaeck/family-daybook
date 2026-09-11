// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ThemePicker } from "@/components/theme-switcher";

const themeMocks = vi.hoisted(() => ({
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  ThemeProvider: ({
    attribute,
    children,
    defaultTheme,
    disableTransitionOnChange,
    enableSystem,
  }: {
    attribute: string;
    children: ReactNode;
    defaultTheme: string;
    disableTransitionOnChange: boolean;
    enableSystem: boolean;
  }) => (
    <div
      data-testid="theme-provider"
      data-attribute={attribute}
      data-default-theme={defaultTheme}
      data-disable-transitions={String(disableTransitionOnChange)}
      data-enable-system={String(enableSystem)}
    >
      {children}
    </div>
  ),
  useTheme: () => ({
    setTheme: themeMocks.setTheme,
    theme: "system",
  }),
}));

describe("theme configuration", () => {
  beforeEach(() => {
    themeMocks.setTheme.mockReset();
  });

  it("uses a Tailwind class and follows the system appearance by default", () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>,
    );

    const provider = screen.getByTestId("theme-provider");
    expect(provider).toHaveAttribute("data-attribute", "class");
    expect(provider).toHaveAttribute("data-default-theme", "system");
    expect(provider).toHaveAttribute("data-enable-system", "true");
    expect(provider).toHaveAttribute("data-disable-transitions", "true");
  });

  it("lets the user choose system, light, or dark appearance", () => {
    render(<ThemePicker />);

    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Light" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeEnabled();

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(themeMocks.setTheme).toHaveBeenCalledWith("dark");
  });
});
