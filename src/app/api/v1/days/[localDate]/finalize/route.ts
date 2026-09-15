import {
  apiContext,
  apiError,
  apiJson,
  requireIfMatch,
} from "@/lib/api/v1";
import { createDaybookService } from "@/lib/application/daybook-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ localDate: string }> },
) {
  try {
    const { localDate } = await params;
    requireIfMatch(request);
    const { repository, context } = await apiContext({
      request,
      operationName: "day.finalize",
      input: { localDate },
      expectedVersionKind: "day",
    });
    const result = await createDaybookService(repository, context).finalizeDay(
      localDate,
    );
    return apiJson({ data: result }, {}, result.dayVersion);
  } catch (error) {
    return apiError(error);
  }
}
