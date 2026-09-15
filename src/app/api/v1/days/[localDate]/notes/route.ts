import { z } from "zod";

import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import { createDaybookService } from "@/lib/application/daybook-service";

const inputSchema = z.object({ notes: z.string().trim().max(2000) });

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ localDate: string }> },
) {
  try {
    const { localDate } = await params;
    const input = await parseJson(request, inputSchema);
    requireIfMatch(request);
    const { repository, context } = await apiContext({
      request,
      operationName: "day_notes.update",
      input: { localDate, ...input },
      expectedVersionKind: "day",
    });
    const result = await createDaybookService(repository, context).updateDayNotes({
      localDate,
      notes: input.notes,
    });
    return apiJson({ data: result }, {}, result.dayVersion);
  } catch (error) {
    return apiError(error);
  }
}
