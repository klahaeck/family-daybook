import "server-only";

import type { GoogleExternalTransactionDocument } from "@/lib/billing/link-intents";

/**
 * Google Play does not process these payments. Implementations of this interface
 * report an already-completed external transaction to Google Play.
 */
export interface GoogleExternalTransactionReporter {
  report(transaction: GoogleExternalTransactionDocument): Promise<{
    externalTransactionId: string;
    reportedAt: Date;
  }>;
}

export class GoogleExternalReportingUnavailableError extends Error {
  constructor() {
    super("GOOGLE_EXTERNAL_REPORTING_UNAVAILABLE");
    this.name = "GoogleExternalReportingUnavailableError";
  }
}

/**
 * Deliberately fails closed until Play Console enrollment and a Google Play
 * Developer API credential are configured. It must never be treated as a
 * payment processor or a successful report.
 */
export class ConfigurationGatedGoogleExternalTransactionReporter
  implements GoogleExternalTransactionReporter
{
  async report(): Promise<never> {
    throw new GoogleExternalReportingUnavailableError();
  }
}
