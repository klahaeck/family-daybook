import {
  apiContext,
  apiError,
  apiJson,
  parseJson,
  requireIfMatch,
} from "@/lib/api/v1";
import { createDaybookService } from "@/lib/application/daybook-service";
import { careEntryUpdateSchema } from "@/lib/domain/schemas";
import { z } from "zod";

const inputSchema = z.object(careEntryUpdateSchema.shape).omit({ recordId: true });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { repository, context } = await apiContext();
    const entry = await createDaybookService(repository, context).getCareEntry(id);
    return apiJson({ data: entry }, {}, entry.recordVersion);
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
    const input = { recordId: id, ...body };
    const { repository, context } = await apiContext({
      request,
      operationName: "care_record.update",
      input,
      expectedVersionKind: "record",
    });
    const service = createDaybookService(repository, context);
    const entry = await service.updateCareEntry(input);
    const view = await service.getCareEntry(entry.id);
    return apiJson({ data: view }, {}, view.recordVersion);
  } catch (error) {
    return apiError(error);
  }
}
