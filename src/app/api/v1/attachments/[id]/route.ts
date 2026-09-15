import { apiContext, apiError } from "@/lib/api/v1";
import { getPrivateFileStream } from "@/lib/storage/private-files";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { repository, context } = await apiContext();
    const attachment = await repository.getAttachment(context, id);
    if (!attachment) throw new Error("NOT_FOUND");
    const file = await getPrivateFileStream(attachment.pathname);
    if (!file) throw new Error("NOT_FOUND");
    await repository.recordAuditEvent(context, {
      actorId: context.member.id,
      action: "downloaded",
      targetType: "attachment",
      targetId: attachment.id,
    });
    const safeName = attachment.originalName.replace(/["\r\n]/g, "_");
    return new Response(file.stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": file.size.toString(),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
