import { DaybookApiError } from "@family-daybook/api-client";
import { QueryClient } from "@tanstack/react-query";

import {
  formatDateTime,
  formatLocalDate,
  friendlyError,
  invalidateRecordQueries,
  localDateTimeIso,
  mobileMaintenanceMessage,
  mobileUpdateRequiredMessage,
  isAccountDeletionInProgress,
  versionAtLeast,
} from "./utils";

describe("formatDateTime", () => {
  it("uses the workspace timezone instead of the device timezone", () => {
    const value = "2026-01-15T12:30:00.000Z";

    expect(formatDateTime(value, "America/Chicago", "en-US")).toBe("Jan 15, 2026, 6:30 AM");
    expect(formatDateTime(value, "Europe/London", "en-US")).toBe("Jan 15, 2026, 12:30 PM");
  });

  it("does not crash a screen when a legacy timestamp is malformed", () => {
    expect(formatDateTime("not-a-timestamp", "America/Chicago", "en-US")).toBe("Date unavailable");
  });

  it("falls back to UTC when a legacy workspace timezone is invalid", () => {
    expect(formatDateTime("2026-01-15T12:30:00.000Z", "Invalid/Timezone", "en-US")).toBe("Jan 15, 2026, 12:30 PM");
  });
});

describe("workspace-local dates", () => {
  it("formats a local date without shifting it through the device timezone", () => {
    expect(formatLocalDate("2026-09-15", "en-US")).toBe("Tuesday, September 15, 2026");
  });

  it("converts local care time in the workspace timezone", () => {
    expect(localDateTimeIso("2026-01-15", "06:30", "America/Chicago")).toBe("2026-01-15T12:30:00.000Z");
    expect(localDateTimeIso("2026-07-15", "06:30", "America/Chicago")).toBe("2026-07-15T11:30:00.000Z");
  });
});

describe("invalidateRecordQueries", () => {
  it("invalidates the changed collections and timeline without touching unrelated data", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    queryClient.setQueryData(["appointments"], []);
    queryClient.setQueryData(["timeline"], { items: [] });
    queryClient.setQueryData(["session"], { id: "session_1" });

    await invalidateRecordQueries(queryClient, ["appointments"]);

    expect(queryClient.getQueryState(["appointments"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["timeline"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["session"])?.isInvalidated).toBe(false);
  });
});

describe("versionAtLeast", () => {
  it.each([
    ["1.0.0", "1.0.0", true],
    ["1.2.0", "1.1.9", true],
    ["1.0.9", "1.1.0", false],
  ])("compares %s to %s", (current, minimum, expected) => {
    expect(versionAtLeast(current, minimum)).toBe(expected);
  });
});

describe("friendlyError", () => {
  it.each([
    ["API_AUTH_UNAVAILABLE", "Mobile sign-in is temporarily unavailable. Please try again later."],
    ["MOBILE_API_DISABLED", "The Family Daybook mobile app is not currently available. Please use Family Daybook on the web."],
    ["MOBILE_API_MAINTENANCE", mobileMaintenanceMessage],
    ["MONGODB_REQUIRED", "Family Daybook storage is temporarily unavailable. Please try again later."],
    ["ACCOUNT_DELETION_IN_PROGRESS", "Your previous account deletion must finish before Family Daybook can continue."],
  ] as const)("maps %s to an actionable mobile message", (code, expected) => {
    expect(friendlyError(new DaybookApiError(503, code, "Internal deployment detail."))).toBe(expected);
  });

  it("keeps server messages for errors that do not need a mobile-specific explanation", () => {
    expect(friendlyError(new DaybookApiError(409, "VERSION_CONFLICT", "Refresh the record and try again."))).toBe(
      "Refresh the record and try again.",
    );
  });

  it("provides a clear unsupported-version message", () => {
    expect(mobileUpdateRequiredMessage).toMatch(/Update the app/);
  });

  it("recognizes interrupted account deletion without a session payload", () => {
    expect(isAccountDeletionInProgress(new DaybookApiError(
      409,
      "ACCOUNT_DELETION_IN_PROGRESS",
      "Deletion is in progress.",
    ))).toBe(true);
    expect(isAccountDeletionInProgress(new Error("ACCOUNT_DELETION_IN_PROGRESS"))).toBe(false);
  });
});
