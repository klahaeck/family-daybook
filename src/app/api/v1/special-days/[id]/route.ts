import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import { DaybookServiceError } from "@/lib/application/daybook-service";
import { specialArrangementUpdateSchema } from "@/lib/domain/schemas";
import { z } from "zod";

const inputSchema = z
  .object(specialArrangementUpdateSchema.shape)
  .omit({ recordId: true });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { repository, context } = await apiContext();
    const day = await repository.getSpecialArrangement(context, id);
    if (!day) throw new Error("NOT_FOUND");
    return apiJson({ data: day }, {}, day.recordVersion);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await parseJson(request, inputSchema);
    requireIfMatch(request);
    const parsed = specialArrangementUpdateSchema.safeParse({
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
      operationName: "special_day.update",
      input,
      expectedVersionKind: "record",
    });
    const day = await repository.updateSpecialArrangement(context, input);
    return apiJson({ data: day }, {}, day.recordVersion);
  } catch (error) {
    return apiError(error);
  }
}
