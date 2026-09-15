import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import { correctionSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, correctionSchema);
    requireIfMatch(request);
    const { repository, context } = await apiContext({
      request,
      operationName: "record.correct_text",
      input,
      expectedVersionKind: "record",
    });
    const revision = await repository.correctRecord(context, input);
    return apiJson({ data: revision }, { status: 201 }, revision.hash);
  } catch (error) {
    return apiError(error);
  }
}
