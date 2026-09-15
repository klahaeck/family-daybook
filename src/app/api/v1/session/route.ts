import { apiContext, apiError, apiJson } from "@/lib/api/v1";
import { getWorkspaceBillingState } from "@/lib/auth/billing";
import { localDateInTimezone } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { context } = await apiContext({ requireBilling: false });
    const billing = await getWorkspaceBillingState(context);
    const owner = context.member.role === "owner";
    const paid = billing.status === "active";
    return apiJson({
      data: {
        user: {
          id: context.identity.authUserId,
          email: context.identity.email,
          displayName: context.identity.displayName,
        },
        workspace: {
          id: context.workspace.id,
          name: context.workspace.name,
          timezone: context.workspace.timezone,
        },
        member: {
          id: context.member.id,
          role: context.member.role,
          status: context.member.status,
        },
        currentLocalDate: localDateInTimezone(
          new Date(),
          context.workspace.timezone,
        ),
        billing,
        capabilities: {
          readRecords: paid,
          readOpenDays: paid && owner,
          mutateRecords: paid && owner,
          finalizeDays: paid && owner,
          manageSpecialDays: paid && owner,
          manageSettings: paid && owner,
          manageReviewers: paid && owner,
          hardPurge: paid && owner && context.workspace.hardDeleteEnabled,
          subscribe: owner && billing.status === "subscription_required",
        },
        minimumSupportedVersion:
          process.env.MOBILE_MINIMUM_SUPPORTED_VERSION ?? "1.0.0",
        maintenance: process.env.MOBILE_API_MAINTENANCE === "true",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
