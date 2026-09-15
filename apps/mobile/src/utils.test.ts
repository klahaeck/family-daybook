import { DaybookApiError } from "@family-daybook/api-client";

import {
  friendlyError,
  mobileMaintenanceMessage,
  mobileUpdateRequiredMessage,
  isAccountDeletionInProgress,
  versionAtLeast,
} from "./utils";

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
