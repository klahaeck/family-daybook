import { z } from "zod";

export const roleSchema = z.enum(["owner", "reviewer"]);
export const careStatusSchema = z.enum([
  "completed",
  "partial",
  "missed",
  "not_applicable",
]);
export const recordTypeSchema = z.enum(["care_entry", "appointment", "incident"]);
export const localDateSchema = z.iso.date();
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm time.");
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const apiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "API_AUTH_UNAVAILABLE",
  "FORBIDDEN",
  "SUBSCRIPTION_REQUIRED",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "ROUTINE_UNAVAILABLE",
  "DAY_FINALIZED",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "MOBILE_API_DISABLED",
  "MOBILE_API_MAINTENANCE",
  "MONGODB_REQUIRED",
  "BILLING_ACCESS_UNAVAILABLE",
  "BILLING_OWNER_REQUIRED",
  "VERSION_REQUIRED",
  "GOOGLE_EXTERNAL_LINKS_UNAVAILABLE",
  "GOOGLE_EXTERNAL_TOKEN_INVALID",
  "DAY_NOT_FINALIZED",
  "HARD_DELETE_DISABLED",
  "ALREADY_INVITED",
  "ARRANGEMENT_CONFLICT",
  "ATTACHMENT_TYPE",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_LIMIT",
  "ATTACHMENT_PATH",
  "ATTACHMENT_MISMATCH",
  "ATTACHMENT_MISSING",
  "ATTACHMENT_CONFLICT",
  "ATTACHMENT_CALLBACK",
  "ACCOUNT_DELETION_IN_PROGRESS",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});

export const capabilitiesSchema = z.object({
  readRecords: z.boolean(),
  readOpenDays: z.boolean(),
  mutateRecords: z.boolean(),
  finalizeDays: z.boolean(),
  manageSpecialDays: z.boolean(),
  manageSettings: z.boolean(),
  manageReviewers: z.boolean(),
  hardPurge: z.boolean(),
  subscribe: z.boolean(),
});

export const billingStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("active"), source: z.enum(["subscription", "complimentary", "demo"]) }),
  z.object({ status: z.literal("subscription_required") }),
  z.object({ status: z.literal("unavailable") }),
]);

export const sessionSchema = z.object({
  user: z.object({ id: z.string(), displayName: z.string(), email: z.string().email() }),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    timezone: z.string(),
  }),
  member: z.object({ id: z.string(), role: roleSchema, status: z.enum(["active", "invited", "revoked"]) }),
  currentLocalDate: localDateSchema,
  capabilities: capabilitiesSchema,
  billing: billingStateSchema,
  minimumSupportedVersion: z.string(),
  maintenance: z.boolean(),
});

export const childSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  birthdate: localDateSchema,
  color: z.enum(["sage", "blue", "amber", "violet"]),
  active: z.boolean(),
  sortOrder: z.number(),
});

export const caregiverSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  relationship: z.string(),
  isOwner: z.boolean(),
  active: z.boolean(),
});

const optionalRelationshipIdSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

export const careEntrySchema = z.object({
  id: z.string(),
  dailyLogId: z.string(),
  templateItemId: optionalRelationshipIdSchema,
  arrangementTaskId: optionalRelationshipIdSchema,
  taskKey: z.string(),
  taskLabel: z.string(),
  childIds: z.array(z.string()),
  caregiverIds: z.array(z.string()),
  status: careStatusSchema,
  occurredAt: z.string(),
  recordedAt: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  activityType: z.string().optional(),
  notes: z.string().optional(),
  currentRevisionId: z.string(),
  lateEntry: z.boolean(),
  recordVersion: z.string().optional(),
});
export const recordRevisionSchema = z.object({
  id: z.string(),
  revisionNumber: z.number(),
  reason: z.string(),
  authorId: z.string(),
  recordedAt: z.string(),
  hash: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export const careEntryViewSchema = z.object({
  record: careEntrySchema,
  recordVersion: z.string(),
  revisions: z.array(recordRevisionSchema),
});

export const todayTaskSchema = z.object({
  id: z.string(),
  source: z.enum(["routine", "special_arrangement"]),
  templateItemId: z.string().optional(),
  arrangementTaskId: z.string().optional(),
  taskKey: z.string(),
  label: z.string(),
  childIds: z.array(z.string()),
  suggestedTime: localTimeSchema,
  sortOrder: z.number(),
  plannedCaregiverIds: z.array(z.string()),
  recorded: z.boolean(),
  entryId: z.string().optional(),
});

export const specialDayAssignmentSchema = z.object({
  childId: z.string().min(1),
  caregiverIds: z.array(z.string().min(1)).min(1),
});
export const specialDayTaskKeySchema = z.enum([
  "wake_up",
  "get_dressed",
  "prepare_breakfast",
  "prepare_lunch",
  "school_dropoff",
  "school_pickup",
  "prepare_dinner",
  "time_together",
  "naptime",
  "bedtime_pajamas",
  "bedtime_teeth",
  "bedtime_story",
  "clean_spaces",
  "custom",
]);
export const specialDayTaskInputSchema = z.object({
  id: z.string().min(1).optional(),
  sourceRoutineItemId: z.string().min(1).optional(),
  taskKey: specialDayTaskKeySchema,
  childId: z.string().min(1),
  label: z.string().trim().min(2).max(100),
  suggestedTime: localTimeSchema,
});
export const specialDayTaskSchema = specialDayTaskInputSchema.extend({
  id: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
});

export const daySchema = z.object({
  localDate: localDateSchema,
  status: z.enum(["open", "finalized"]),
  notes: z.string().optional(),
  finalizedAt: z.string().optional(),
  dayVersion: z.string(),
  tasks: z.array(todayTaskSchema),
  specialArrangement: z.object({
    id: z.string(),
    localDate: localDateSchema,
    title: z.string(),
    note: z.string().optional(),
    status: z.enum(["active", "cancelled"]),
    assignments: z.array(specialDayAssignmentSchema),
    tasks: z.array(specialDayTaskSchema),
  }).optional(),
  careEntries: z.array(careEntrySchema),
  completion: z.object({ recorded: z.number(), total: z.number(), percent: z.number() }),
});
export const dayMutationResultSchema = z.object({
  id: z.string(),
  localDate: localDateSchema,
  status: z.enum(["open", "finalized"]),
  notes: z.string().optional(),
  finalizedAt: z.string().optional(),
  dayVersion: z.string(),
});

const careDetailsSchema = z
  .object({
    childIds: z.array(z.string().min(1)).min(1),
    caregiverIds: z.array(z.string().min(1)),
    status: careStatusSchema,
    occurredAt: z.string(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    activityType: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    const providedCare = value.status === "completed" || value.status === "partial";
    if (providedCare && value.caregiverIds.length === 0) {
      context.addIssue({ code: "custom", path: ["caregiverIds"], message: "Choose who provided care." });
    }
    if (!providedCare && value.caregiverIds.length > 0) {
      context.addIssue({ code: "custom", path: ["caregiverIds"], message: "This status cannot assign a caregiver." });
    }
  });

export const routineRecordInputSchema = z
  .object({
    routineId: z.string().min(1),
    status: careStatusSchema,
    childIds: z.array(z.string().min(1)).min(1),
    caregiverIds: z.array(z.string().min(1)),
    localTime: localTimeSchema.optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    activityType: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, context) => {
    const providedCare = value.status === "completed" || value.status === "partial";
    if (providedCare && (!value.localTime || value.caregiverIds.length === 0)) {
      context.addIssue({ code: "custom", path: ["localTime"], message: "Time and caregiver are required when care occurred." });
    }
    if (!providedCare && value.caregiverIds.length > 0) {
      context.addIssue({ code: "custom", path: ["caregiverIds"], message: "This status cannot assign a caregiver." });
    }
  });

export const routineRecordResultSchema = z.object({
  result: z.enum(["created", "already_recorded"]),
  record: careEntrySchema,
  recordVersion: z.string(),
});

export const customCareRecordInputSchema = careDetailsSchema.and(
  z.object({
    localDate: localDateSchema,
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("custom"), label: z.string().trim().min(2).max(100) }),
      z.object({ kind: z.literal("special_arrangement"), arrangementTaskId: z.string().min(1) }),
    ]),
  }),
);

export const careRecordUpdateInputSchema = careDetailsSchema;
export const careCorrectionInputSchema = careDetailsSchema.and(z.object({
  reason: z.string().trim().min(5).max(500),
}));
export const correctionInputSchema = z.object({
  recordType: recordTypeSchema,
  recordId: z.string().min(1),
  correctedText: z.string().trim().min(1).max(5000),
  reason: z.string().trim().min(5).max(500),
});

export const appointmentStatusSchema = z.enum([
  "scheduled",
  "attended",
  "late",
  "missed",
  "cancelled",
  "rescheduled",
]);
export const appointmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  childIds: z.array(z.string()),
  provider: z.string().optional(),
  location: z.string().optional(),
  scheduledAt: z.string(),
  responsibleCaregiverIds: z.array(z.string()),
  status: appointmentStatusSchema,
  arrivedAt: isoDateTimeSchema.optional(),
  cancellationDetails: z.string().trim().max(1000).optional(),
  notes: z.string().optional(),
  currentRevisionId: z.string(),
  recordVersion: z.string().optional(),
});
export const appointmentInputSchema = appointmentSchema.omit({
  id: true,
  currentRevisionId: true,
  recordVersion: true,
});

const incidentInputFieldsSchema = z.object({
  category: z.enum(["safety_hazard", "concerning_interaction", "other"]),
  occurredAt: z.string(),
  discoveredAt: z.string().optional(),
  location: z.string().optional(),
  childIds: z.array(z.string()),
  peoplePresent: z.array(z.string()),
  witnesses: z.array(z.string()),
  observations: z.string(),
  exactQuotes: z.string().optional(),
  immediateActions: z.string().optional(),
  outcome: z.string().optional(),
});
export const incidentInputSchema = incidentInputFieldsSchema;

const optionalLegacyIncidentTextSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const legacyIncidentPeopleSchema = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? []);

export const incidentSchema = incidentInputFieldsSchema.extend({
  id: z.string(),
  discoveredAt: optionalLegacyIncidentTextSchema,
  location: optionalLegacyIncidentTextSchema,
  peoplePresent: legacyIncidentPeopleSchema,
  witnesses: legacyIncidentPeopleSchema,
  exactQuotes: optionalLegacyIncidentTextSchema,
  immediateActions: optionalLegacyIncidentTextSchema,
  outcome: optionalLegacyIncidentTextSchema,
  currentRevisionId: z.string(),
  recordVersion: z.string().optional(),
});

export const timelineItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["care", "appointment", "incident", "special_day"]),
  occurredAt: z.string(),
  recordedAt: z.string(),
  localDate: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  childIds: z.array(z.string()),
  caregiverIds: z.array(z.string()),
  status: z.string(),
  lateEntry: z.boolean().optional(),
});
export const timelineSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable().optional(),
  summary: z.object({ completed: z.number(), partial: z.number(), missed: z.number() }).optional(),
});

export const specialDaySchema = z.object({
  id: z.string(),
  localDate: localDateSchema,
  title: z.string(),
  note: z.string().optional(),
  status: z.enum(["active", "cancelled"]),
  currentRevisionId: z.string(),
  recordVersion: z.string().optional(),
});
export const specialDayDetailSchema = specialDaySchema.extend({
  assignments: z.array(specialDayAssignmentSchema).min(1),
  tasks: z.array(specialDayTaskSchema),
  recordVersion: z.string(),
});
export const specialDayUpdateInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).optional(),
  status: z.enum(["active", "cancelled"]),
  assignments: z.array(specialDayAssignmentSchema).min(1),
  tasks: z.array(specialDayTaskInputSchema).max(500),
});
export const specialDayCorrectionInputSchema = specialDayUpdateInputSchema.extend({
  reason: z.string().trim().min(5).max(500),
});
export const specialDayInputSchema = z.object({
  startDate: localDateSchema,
  endDate: localDateSchema,
  title: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1000).optional(),
  assignments: z.array(specialDayAssignmentSchema).min(1),
  days: z.array(z.object({ localDate: localDateSchema, tasks: z.array(specialDayTaskInputSchema).max(500) })).min(1),
});

export const reportSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: z.enum(["pending", "ready", "failed"]),
  filters: z.object({
    from: localDateSchema,
    to: localDateSchema,
    childIds: z.array(z.string()),
    includeCare: z.boolean(),
    includeAppointments: z.boolean(),
    includeIncidents: z.boolean(),
  }),
  error: z.string().optional(),
});
export const reportInputSchema = reportSchema.shape.filters.refine(
  (value) => value.from <= value.to && (value.includeCare || value.includeAppointments || value.includeIncidents),
  "Choose a valid range and at least one record type.",
);

export const reviewerSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  status: z.enum(["active", "invited", "revoked"]),
  role: roleSchema.default("reviewer"),
});
export const routineTemplateItemSchema = z.object({
  id: z.string(),
  taskKey: specialDayTaskKeySchema,
  label: z.string(),
  suggestedTime: localTimeSchema,
  childIds: z.array(z.string()),
  weekdays: z.array(z.number().int().min(0).max(6)),
  active: z.boolean(),
});
export const settingsSchema = z.object({
  workspace: sessionSchema.shape.workspace.extend({ hardDeleteEnabled: z.boolean() }),
  children: z.array(childSchema),
  caregivers: z.array(caregiverSchema),
  members: z.array(reviewerSchema),
  template: z.object({ id: z.string(), version: z.number(), effectiveFrom: localDateSchema, items: z.array(routineTemplateItemSchema) }),
});
export const settingsUpdateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().min(1),
  hardDeleteEnabled: z.boolean(),
  children: z.array(z.object({ id: z.string(), displayName: z.string().trim().min(1).max(80), birthdate: localDateSchema })).min(1),
  caregivers: z.array(z.object({ id: z.string().optional(), displayName: z.string().trim().min(1).max(80), relationship: z.string().trim().min(1).max(80) })).min(1),
  routineItems: z.array(routineTemplateItemSchema.pick({ id: true, label: true, suggestedTime: true, childIds: true, weekdays: true, active: true }).extend({ id: z.string().optional() })),
});
export const reviewerInviteInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(2).max(100),
});

export const billingLinkIntentInputSchema = z.discriminatedUnion("platform", [
  z.object({ platform: z.literal("ios") }),
  z.object({ platform: z.literal("android"), googleExternalTransactionToken: z.string().min(16).max(4096) }),
]);
export const billingLinkIntentSchema = z.object({
  checkoutUrl: z.string().url(),
  completionUrl: z.string().url(),
  expiresAt: z.string(),
  intentId: z.string(),
});
export const accountDeleteInputSchema = z.object({ confirmation: z.literal("DELETE MY ACCOUNT") });
export const accountDeleteResultSchema = z.object({
  applicationDataDeleted: z.literal(true),
  deleteClerkIdentity: z.literal(true),
});
export const attachmentContentTypeSchema = z.enum([
  "application/pdf", "image/jpeg", "image/png", "image/heic", "video/mp4", "video/quicktime", "video/webm",
]);
export const attachmentPrepareInputSchema = z.object({
  recordType: recordTypeSchema,
  recordId: z.string().min(1),
  originalName: z.string().trim().min(1).max(180),
  declaredContentType: attachmentContentTypeSchema,
  declaredSize: z.number().int().positive(),
});
export const attachmentClaimSchema = attachmentPrepareInputSchema.extend({
  attachmentId: z.string(),
  pathname: z.string(),
});
export const preparedAttachmentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("local"), claim: attachmentClaimSchema }),
  z.object({ mode: z.literal("presigned"), claim: attachmentClaimSchema, presignedUrl: z.string().url() }),
]);
export const attachmentSchema = z.object({
  id: z.string(), recordType: recordTypeSchema, recordId: z.string(), revisionId: z.string(),
  originalName: z.string(), contentType: attachmentContentTypeSchema, size: z.number(), sha256: z.string(), uploadedAt: z.string(),
});
export const recordBundleSchema = z.object({
  record: z.union([careEntrySchema, appointmentSchema, incidentSchema]),
  revisions: z.array(recordRevisionSchema),
  attachments: z.array(attachmentSchema),
  recordVersion: z.string(),
});
export const purgeInputSchema = z.object({
  recordType: recordTypeSchema,
  recordId: z.string(),
  reason: z.string().trim().min(10).max(500),
  confirmation: z.literal("PERMANENTLY DELETE"),
});

export const listCareRecordsSchema = z.object({
  items: z.array(timelineItemSchema),
  attachments: z.array(attachmentSchema),
  revisions: z.array(recordRevisionSchema),
  nextCursor: z.string().nullable().optional(),
});
export const listAppointmentsSchema = z.array(appointmentSchema);
export const listIncidentsSchema = z.object({ incidents: z.array(incidentSchema), attachments: z.array(z.unknown()) });
export const listSpecialDaysSchema = z.object({
  children: z.array(childSchema),
  caregivers: z.array(caregiverSchema),
  days: z.array(specialDaySchema),
});
export const specialDayCreateResultSchema = z.object({ seriesId: z.string().nullable(), days: z.array(specialDaySchema) });
export const listReportsSchema = z.array(reportSchema);

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type Day = z.infer<typeof daySchema>;
export type CareEntry = z.infer<typeof careEntrySchema>;
export type RoutineRecordInput = z.infer<typeof routineRecordInputSchema>;
export type CustomCareRecordInput = z.infer<typeof customCareRecordInputSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type IncidentInput = z.infer<typeof incidentInputSchema>;
export type RecordBundle = z.infer<typeof recordBundleSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type SpecialDay = z.infer<typeof specialDaySchema>;
export type SpecialDayDetail = z.infer<typeof specialDayDetailSchema>;
export type Report = z.infer<typeof reportSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type PreparedAttachment = z.infer<typeof preparedAttachmentSchema>;
