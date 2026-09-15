import { apiContext, apiError, apiJson, parseJson } from "@/lib/api/v1";
import { attachmentUploadClaimSchema } from "@/lib/domain/schemas";
import { completeAttachmentUpload } from "@/lib/storage/attachment-uploads";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, attachmentUploadClaimSchema);
    const { context } = await apiContext({
      request,
      operationName: "attachment.finalize",
      input,
    });
    const attachment = await completeAttachmentUpload(context, input);
    return apiJson({ data: attachment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
