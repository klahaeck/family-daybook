import { apiContext, apiError, apiJson, parseJson } from "@/lib/api/v1";
import { attachmentUploadRequestSchema } from "@/lib/domain/schemas";
import { prepareAttachmentUpload } from "@/lib/storage/attachment-uploads";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, attachmentUploadRequestSchema);
    const { context } = await apiContext({
      request,
      operationName: "attachment.prepare",
      input,
    });
    return apiJson({ data: await prepareAttachmentUpload(context, input) });
  } catch (error) {
    return apiError(error);
  }
}
