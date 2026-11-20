export const DAYBOOK_SCOPES = {
  read: "daybook:read",
  write: "daybook:write",
  finalize: "daybook:finalize",
} as const;

export type DaybookScope = (typeof DAYBOOK_SCOPES)[keyof typeof DAYBOOK_SCOPES];

export const DAYBOOK_SCOPE_DESCRIPTIONS: Record<DaybookScope, string> = {
  [DAYBOOK_SCOPES.read]:
    "Read the authorized workspace context, visible days, care-entry history, and owner-only parenting schedules.",
  [DAYBOOK_SCOPES.write]:
    "Create and update open-day records, configure owner-only parenting schedules, and prepare corrections to finalized records.",
  [DAYBOOK_SCOPES.finalize]:
    "Prepare and confirm finalization of an open care day.",
};

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const confirmedAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const DAYBOOK_TOOL_CATALOG = [
  {
    name: "get_daybook_context",
    title: "Get Daybook Context",
    description:
      "Get the authorized member role, workspace timezone, local date, and active child/caregiver references.",
    scope: DAYBOOK_SCOPES.read,
    group: "Context and records",
    annotations: readAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "get_day",
    title: "Get Day",
    description:
      "Get a visible care day with per-child parenting assignments, expected and optional off-day tasks, caregiver restrictions, entries, completion, and its concurrency version. Planned responsibility is not proof of actual care.",
    scope: DAYBOOK_SCOPES.read,
    group: "Context and records",
    annotations: readAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "get_parenting_schedule",
    title: "Get Parenting Schedule",
    description: "Owner only: read effective-dated parenting rotations, active child references, timezone, and scheduleVersion before changing a schedule. An empty list means scheduling is not configured.",
    scope: DAYBOOK_SCOPES.read,
    group: "Parenting schedules",
    annotations: readAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "update_parenting_schedule",
    title: "Update Parenting Schedule",
    description: "Owner only: set or disable an effective-dated per-child 7/14/21/28-day parenting rotation using a fresh scheduleVersion and unique operationId. Each day is mine or other relative to anchorDate. Changes start today or later; finalized assignments remain unchanged. Off-day contributions credit only the owner and never affect expected completion. No other-parent account is needed.",
    scope: DAYBOOK_SCOPES.write,
    group: "Parenting schedules",
    annotations: writeAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "get_care_entry",
    title: "Get Care Entry",
    description:
      "Get a visible care record, its current version, and revision history.",
    scope: DAYBOOK_SCOPES.read,
    group: "Context and records",
    annotations: readAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "create_care_entry",
    title: "Create Care Entry",
    description:
      "Create a routine, special-arrangement, or factual custom care entry. On off days credit only the owner's contributions; on own days either parent can provide care. Never infer actual care from the schedule.",
    scope: DAYBOOK_SCOPES.write,
    group: "Open-day updates",
    annotations: writeAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "record_routine_item",
    title: "Record Routine Item",
    description:
      "Record a routine by name or ID, asking only for required facts still missing. Respect optional off-day tasks and owner-only off-day contributions; either parent may help on own days.",
    scope: DAYBOOK_SCOPES.write,
    group: "Open-day updates",
    annotations: writeAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "update_care_entry",
    title: "Update Care Entry",
    description: "Update an existing record while its care day is open.",
    scope: DAYBOOK_SCOPES.write,
    group: "Open-day updates",
    annotations: writeAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "update_day_notes",
    title: "Update Day Notes",
    description: "Replace notes on an open care day.",
    scope: DAYBOOK_SCOPES.write,
    group: "Open-day updates",
    annotations: writeAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "preview_care_entry_correction",
    title: "Preview Care Entry Correction",
    description:
      "Preview a correction to a finalized record and issue a five-minute confirmation handle.",
    scope: DAYBOOK_SCOPES.write,
    group: "Protected final changes",
    annotations: writeAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "confirm_care_entry_correction",
    title: "Confirm Care Entry Correction",
    description:
      "Consume a correction confirmation handle and append the unchanged proposed revision.",
    scope: DAYBOOK_SCOPES.write,
    group: "Protected final changes",
    annotations: confirmedAnnotations,
    requiresConfirmation: true,
  },
  {
    name: "preview_day_finalization",
    title: "Preview Day Finalization",
    description:
      "Return the exact open-day summary and a five-minute confirmation handle.",
    scope: DAYBOOK_SCOPES.finalize,
    group: "Protected final changes",
    annotations: writeAnnotations,
    requiresConfirmation: false,
  },
  {
    name: "confirm_day_finalization",
    title: "Confirm Day Finalization",
    description:
      "Consume a finalization handle and finalize the exact unchanged day it represents.",
    scope: DAYBOOK_SCOPES.finalize,
    group: "Protected final changes",
    annotations: confirmedAnnotations,
    requiresConfirmation: true,
  },
] as const;

export type DaybookToolDefinition = (typeof DAYBOOK_TOOL_CATALOG)[number];
export type DaybookToolName = DaybookToolDefinition["name"];

export const TOOL_SCOPES = Object.fromEntries(
  DAYBOOK_TOOL_CATALOG.map((tool) => [tool.name, tool.scope]),
) as Record<DaybookToolName, DaybookScope>;

export function getDaybookTool(name: DaybookToolName): DaybookToolDefinition {
  return DAYBOOK_TOOL_CATALOG.find((tool) => tool.name === name)!;
}

export function isDaybookToolName(name: string): name is DaybookToolName {
  return Object.hasOwn(TOOL_SCOPES, name);
}
