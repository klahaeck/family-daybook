import { describe, expect, it } from "vitest";

import {
  ageOnDate,
  isValidLocalDate,
  lateEntryFor,
  localDateTimeToUtc,
  localDateInTimezone,
  shiftLocalDate,
  toDateTimeLocalInTimezone,
} from "@/lib/domain/dates";

describe("date handling", () => {
  it("uses the workspace timezone for the local date", () => {
    const instant = new Date("2026-07-15T02:00:00.000Z");
    expect(localDateInTimezone(instant, "America/Chicago")).toBe("2026-07-14");
  });

  it("allows two following workspace calendar days before marking an entry late", () => {
    expect(
      lateEntryFor(
        "2026-07-10T05:01:00.000Z",
        "2026-07-13T04:59:00.000Z",
        "America/Chicago",
      ),
    ).toBe(false);
    expect(
      lateEntryFor(
        "2026-07-10T05:01:00.000Z",
        "2026-07-13T05:01:00.000Z",
        "America/Chicago",
      ),
    ).toBe(true);
  });

  it("validates and shifts local calendar dates without timezone drift", () => {
    expect(isValidLocalDate("2026-07-14")).toBe(true);
    expect(isValidLocalDate("2026-02-30")).toBe(false);
    expect(isValidLocalDate("2026-7-4")).toBe(false);
    expect(shiftLocalDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftLocalDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("calculates age from a birthdate and the selected calendar date", () => {
    expect(ageOnDate("2018-07-15", "2026-07-14")).toBe(7);
    expect(ageOnDate("2018-07-15", "2026-07-15")).toBe(8);
    expect(ageOnDate("2027-01-01", "2026-07-15")).toBeNull();
  });

  it("converts workspace-local date-time values independently of browser timezone", () => {
    const instant = new Date("2026-07-15T02:30:00.000Z");
    expect(toDateTimeLocalInTimezone(instant, "America/Chicago")).toBe("2026-07-14T21:30");
    expect(localDateTimeToUtc("2026-07-14T21:30", "America/Chicago")).toBe(
      "2026-07-15T02:30:00.000Z",
    );
  });
});
