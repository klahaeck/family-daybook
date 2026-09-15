import "server-only";

import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";

import type { OperationRequestAttribution } from "@/lib/agents/types";
import { DaybookServiceError } from "@/lib/application/daybook-service";
import {
  assertWorkspaceBillingAccess,
  isBillingAccessUnavailableError,
  isSubscriptionRequiredError,
} from "@/lib/auth/billing";
import {
  clerkConfigured,
  getIdentityForAuthUserId,
} from "@/lib/auth/identity";
import { canonicalJson, sha256 } from "@/lib/domain/integrity";
import { getRepository } from "@/lib/repository";
import type {
  ParentingRepository,
  RequestContext,
} from "@/lib/repository/repository";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
} as const;

export interface ApiContext {
  repository: ParentingRepository;
  context: RequestContext;
}

interface ApiContextOptions {
  requireBilling?: boolean;
  allowAccountDeletion?: boolean;
  request?: Request;
  operationName?: string;
  input?: unknown;
  expectedVersionKind?: "day" | "record";
}

export function apiJson<T>(
  data: T,
  init: ResponseInit = {},
  etag?: string,
): NextResponse<T> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (etag) headers.set("ETag", `"${etag}"`);
  return NextResponse.json(data, { ...init, headers });
}

export function parseIfMatch(request: Request): string | undefined {
  const value = request.headers.get("if-match")?.trim();
  if (!value) return undefined;
  const normalized = value.startsWith("W/") ? value.slice(2) : value;
  return normalized.replace(/^"|"$/g, "");
}

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new DaybookServiceError("VALIDATION_ERROR", {
      body: ["Provide a valid JSON request body."],
    });
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).filter(
        (entry): entry is [string, string[]] => Boolean(entry[1]),
      ),
    );
    throw new DaybookServiceError(
      "VALIDATION_ERROR",
      fieldErrors,
    );
  }
  return parsed.data;
}

function operationFor(
  request: Request,
  operationName: string,
  input: unknown,
  expectedVersionKind?: "day" | "record",
): OperationRequestAttribution {
  const operationId = requireIdempotencyKey(request);
  const expectedVersion = parseIfMatch(request);
  return {
    source: "mobile_api",
    clientKey: "mobile_api",
    operationName,
    operationId,
    inputHash: sha256(
      canonicalJson({ operationName, input, expectedVersion }),
    ),
    ...(expectedVersionKind === "day" && expectedVersion
      ? { expectedDayVersion: expectedVersion }
      : {}),
    ...(expectedVersionKind === "record" && expectedVersion
      ? { expectedRecordVersion: expectedVersion }
      : {}),
  };
}

export function requireIdempotencyKey(request: Request): string {
  const operationId = request.headers.get("idempotency-key")?.trim();
  if (!operationId || !z.string().uuid().safeParse(operationId).success) {
    throw new DaybookServiceError("VALIDATION_ERROR", {
      idempotencyKey: ["Idempotency-Key must be a UUID."],
    });
  }
  return operationId;
}

export async function apiContext(
  options: ApiContextOptions = {},
): Promise<ApiContext> {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MOBILE_API_ENABLED !== "true"
  ) {
    throw new Error("MOBILE_API_DISABLED");
  }
  if (
    options.requireBilling !== false &&
    process.env.MOBILE_API_MAINTENANCE === "true"
  ) {
    throw new Error("MOBILE_API_MAINTENANCE");
  }
  if (!clerkConfigured()) throw new Error("API_AUTH_UNAVAILABLE");

  const identity = await apiIdentity();
  const repository = await getRepository();
  const context: RequestContext = {
    ...(await repository.resolveContext(identity, {
      allowAccountDeletion: options.allowAccountDeletion,
    })),
    ...(options.request && options.operationName
      ? {
          operation: operationFor(
            options.request,
            options.operationName,
            options.input,
            options.expectedVersionKind,
          ),
        }
      : {}),
  };

  if (options.requireBilling !== false) {
    await assertWorkspaceBillingAccess(context);
  }

  return { repository, context };
}

export async function apiIdentity() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MOBILE_API_ENABLED !== "true"
  ) {
    throw new Error("MOBILE_API_DISABLED");
  }
  if (!clerkConfigured()) throw new Error("API_AUTH_UNAVAILABLE");
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) throw new Error("UNAUTHENTICATED");
  return getIdentityForAuthUserId(userId);
}

const safeMessages: Record<string, string> = {
  UNAUTHENTICATED: "Sign in to continue.",
  API_AUTH_UNAVAILABLE: "Mobile API authentication is not configured.",
  MOBILE_API_DISABLED: "The mobile API is not enabled.",
  MOBILE_API_MAINTENANCE: "The mobile API is temporarily unavailable.",
  ACCOUNT_DELETION_IN_PROGRESS:
    "Application data is deleted. Finish deleting the signed-in identity.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "The requested resource was not found.",
  SUBSCRIPTION_REQUIRED: "A paid Family Daybook plan is required.",
  BILLING_ACCESS_UNAVAILABLE: "Billing access could not be verified.",
  BILLING_OWNER_REQUIRED: "The workspace owner must finish account setup.",
  MONGODB_REQUIRED: "Persistent storage is not configured.",
  VALIDATION_ERROR: "The supplied input is invalid.",
  VERSION_REQUIRED: "Fetch the latest version before changing this resource.",
  VERSION_CONFLICT: "The resource changed; fetch it again and retry.",
  IDEMPOTENCY_CONFLICT: "That idempotency key was used for different input.",
  DAY_FINALIZED: "The day is finalized; use the correction flow.",
  DAY_NOT_FINALIZED: "The day is open; update the record directly.",
  ROUTINE_UNAVAILABLE: "That routine is unavailable for this date.",
  HARD_DELETE_DISABLED: "Permanent deletion is disabled for this workspace.",
  ALREADY_INVITED: "That reviewer already has access or an invitation.",
  ARRANGEMENT_CONFLICT: "One or more dates already have a special arrangement.",
  ATTACHMENT_TYPE: "The selected file type is not supported.",
  ATTACHMENT_TOO_LARGE: "The selected file is too large.",
  ATTACHMENT_LIMIT: "This record already has the maximum attachments.",
  ATTACHMENT_PATH: "The attachment upload could not be verified.",
  ATTACHMENT_MISMATCH: "The uploaded file does not match the request.",
  ATTACHMENT_MISSING: "The uploaded file could not be found.",
  ATTACHMENT_CONFLICT: "That attachment has already been used.",
  ATTACHMENT_CALLBACK: "Private attachment upload callbacks are not configured.",
  RATE_LIMITED: "Too many requests; try again shortly.",
};

function statusFor(code: string): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN" || code === "SUBSCRIPTION_REQUIRED") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "BILLING_ACCESS_UNAVAILABLE") return 503;
  if (
    code === "API_AUTH_UNAVAILABLE" ||
    code === "MONGODB_REQUIRED" ||
    code === "BILLING_OWNER_REQUIRED" ||
    code === "MOBILE_API_DISABLED" ||
    code === "MOBILE_API_MAINTENANCE"
  ) {
    return 503;
  }
  if (code === "RATE_LIMITED") return 429;
  if (
    code === "VERSION_REQUIRED" ||
    code === "ACCOUNT_DELETION_IN_PROGRESS" ||
    code === "VERSION_CONFLICT" ||
    code === "IDEMPOTENCY_CONFLICT" ||
    code === "DAY_FINALIZED" ||
    code === "DAY_NOT_FINALIZED" ||
    code === "ROUTINE_UNAVAILABLE" ||
    code === "ALREADY_INVITED" ||
    code === "ARRANGEMENT_CONFLICT"
  ) {
    return 409;
  }
  if (
    code === "VALIDATION_ERROR" ||
    code.startsWith("INVALID_") ||
    code.startsWith("ATTACHMENT_")
  ) {
    return 400;
  }
  if (code === "HARD_DELETE_DISABLED") return 403;
  return 500;
}

export function apiError(error: unknown): NextResponse {
  const rawCode =
    error instanceof DaybookServiceError
      ? error.code
      : error instanceof Error
        ? error.message
        : "INTERNAL_ERROR";
  const code = isSubscriptionRequiredError(error)
    ? "SUBSCRIPTION_REQUIRED"
    : isBillingAccessUnavailableError(error)
      ? "BILLING_ACCESS_UNAVAILABLE"
      : rawCode === "CONFIRMATION_STALE"
        ? "VERSION_CONFLICT"
      : rawCode.startsWith("INVALID_")
        ? "VALIDATION_ERROR"
        : rawCode;
  const status = statusFor(code);
  return apiJson(
    {
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : code,
        message:
          status === 500
            ? "The request could not be completed."
            : (safeMessages[code] ?? "The request could not be completed."),
        ...(error instanceof DaybookServiceError && error.fieldErrors
          ? { fieldErrors: error.fieldErrors }
          : {}),
      },
    },
    { status },
  );
}

export function requireIfMatch(request: Request): string {
  const version = parseIfMatch(request);
  if (!version) throw new Error("VERSION_REQUIRED");
  return version;
}

export function requireOwner(context: RequestContext): void {
  if (context.member.role !== "owner") throw new Error("FORBIDDEN");
}
