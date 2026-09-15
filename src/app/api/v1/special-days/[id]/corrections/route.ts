import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import { DaybookServiceError } from "@/lib/application/daybook-service";
import { specialArrangementCorrectionSchema } from "@/lib/domain/schemas";
import { z } from "zod";

const inputSchema = z
  .object(specialArrangementCorrectionSchema.shape)
  .omit({ recordId: true });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await parseJson(request, inputSchema);
    requireIfMatch(request);
    const parsed = specialArrangementCorrectionSchema.safeParse({
      recordId: id,
      ...body,
    });
    if (!parsed.success) {
      throw new DaybookServiceError(
        "VALIDATION_ERROR",
        Object.fromEntries(
          Object.entries(parsed.error.flatten().fieldErrors).filter(
            (entry): entry is [string, string[]] => Boolean(entry[1]),
          ),
        ),
      );
    }
    const input = parsed.data;
    const { repository, context } = await apiContext({
      request,
      operationName: "special_day.correct",
      input,
      expectedVersionKind: "record",
    });
    const revision = await repository.correctSpecialArrangement(context, input);
    return apiJson({ data: revision }, { status: 201 }, revision.hash);
  } catch (error) {
    return apiError(error);
  }
}
