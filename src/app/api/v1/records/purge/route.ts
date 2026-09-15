import { apiContext, apiError, apiJson, parseJson } from "@/lib/api/v1";
import { purgeRecord } from "@/lib/application/purge-service";
import { purgeSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, purgeSchema);
    const { repository, context } = await apiContext({
      request,
      operationName: "record.purge",
      input,
    });
    const tombstone = await purgeRecord(repository, context, input);
    return apiJson({ data: tombstone });
  } catch (error) {
    return apiError(error);
  }
}
