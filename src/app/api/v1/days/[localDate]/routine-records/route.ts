import { z } from "zod";

import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import {
  createdRoutineResult,
  existingRoutineResult,
  planRoutineRecording,
} from "@/lib/application/routine-recording";
import { DaybookServiceError } from "@/lib/application/daybook-service";
import type { CareEntryWriteResult } from "@/lib/repository/repository";

const inputSchema = z.object({
  routineId: z.string().min(1),
  status: z.enum(["completed", "partial", "missed", "not_applicable"]),
  childIds: z.array(z.string().min(1)).min(1),
  caregiverIds: z.array(z.string().min(1)),
  localTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  activityType: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ localDate: string }> },
) {
  try {
    const { localDate } = await params;
    const input = await parseJson(request, inputSchema);
    requireIfMatch(request);
    const { repository, context } = await apiContext({
      request,
      operationName: "routine_record.create",
      input: { localDate, ...input },
      expectedVersionKind: "day",
    });
    const replay = await repository.getOperationResult<CareEntryWriteResult>(
      context,
    );
    if (replay.found) {
      const result = createdRoutineResult(replay.result);
      return apiJson(
        { data: result },
        { status: result.result === "created" ? 201 : 200 },
        result.recordVersion,
      );
    }
    if (
      context.operation?.expectedDayVersion !==
      (await repository.getDayVersion(context, localDate))
    ) {
      throw new Error("VERSION_CONFLICT");
    }

    const plan = await planRoutineRecording(repository, context, {
      operationId: context.operation!.operationId,
      localDate,
      ...input,
    });
    if (plan.result === "needs_input") {
      throw new DaybookServiceError(
        "VALIDATION_ERROR",
        Object.fromEntries(
          plan.questions.map((question) => [question.field, [question.prompt]]),
        ),
      );
    }
    if (plan.result === "already_recorded") {
      const result = createdRoutineResult(
        await repository.recordOperationResult(
          context,
          existingRoutineResult(plan),
        ),
      );
      return apiJson({ data: result }, {}, result.recordVersion);
    }

    const result = createdRoutineResult(
      await repository.createCareEntry(context, plan.mutation),
    );
    return apiJson(
      { data: result },
      { status: result.result === "created" ? 201 : 200 },
      result.recordVersion,
    );
  } catch (error) {
    return apiError(error);
  }
}
