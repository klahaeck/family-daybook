"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const themes = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

type Theme = (typeof themes)[number]["value"];

function subscribe() {
  return () => undefined;
}

function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

function isTheme(value: string): value is Theme {
  return themes.some((theme) => theme.value === value);
}

function ThemeIcon() {
  return (
    <span className="relative size-4" aria-hidden="true">
      <Sun className="absolute inset-0 size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute inset-0 size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const mounted = useMounted();
  const { setTheme, theme } = useTheme();

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      className={cn("shrink-0", className)}
      aria-label="Choose appearance"
      disabled={!mounted}
    />
  );

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className={cn("shrink-0", className)}
        aria-label="Choose appearance"
        disabled
      >
        <ThemeIcon />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>
        <ThemeIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={(value) => {
            if (value && isTheme(value)) setTheme(value);
          }}
        >
          {themes.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
              <option.icon aria-hidden="true" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemePicker() {
  const mounted = useMounted();
  const { setTheme, theme } = useTheme();

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Appearance">
      {themes.map((option) => {
        const selected = mounted && theme === option.value;

        return (
          <Button
            key={option.value}
            type="button"
            variant={selected ? "secondary" : "outline"}
            className="h-auto min-w-0 flex-col gap-2 px-2 py-3"
            role="radio"
            aria-checked={selected}
            disabled={!mounted}
            onClick={() => setTheme(option.value)}
          >
            <option.icon className="size-4" aria-hidden="true" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
