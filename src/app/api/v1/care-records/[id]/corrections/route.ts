import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import { createDaybookService } from "@/lib/application/daybook-service";
import { careEntryCorrectionSchema } from "@/lib/domain/schemas";
import { z } from "zod";

const inputSchema = z
  .object(careEntryCorrectionSchema.shape)
  .omit({ recordId: true });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await parseJson(request, inputSchema);
    requireIfMatch(request);
    const input = { recordId: id, ...body };
    const { repository, context } = await apiContext({
      request,
      operationName: "care_record.correct",
      input,
      expectedVersionKind: "record",
    });
    const revision = await createDaybookService(
      repository,
      context,
    ).correctCareEntry(input);
    return apiJson({ data: revision }, { status: 201 }, revision.hash);
  } catch (error) {
    return apiError(error);
  }
}
