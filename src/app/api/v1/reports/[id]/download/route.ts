import { apiContext, apiError } from "@/lib/api/v1";
import { getPrivateFileStream } from "@/lib/storage/private-files";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const format = new URL(request.url).searchParams.get("format");
    if (format !== "pdf" && format !== "zip") throw new Error("INVALID_FORMAT");
    const { repository, context } = await apiContext();
    const report = (await repository.getReports(context)).find(
      (item) => item.id === id,
    );
    if (!report || report.status !== "ready") throw new Error("NOT_FOUND");
    const pathname = format === "pdf" ? report.pdfPathname : report.zipPathname;
    if (!pathname) throw new Error("NOT_FOUND");
    const file = await getPrivateFileStream(pathname);
    if (!file) throw new Error("NOT_FOUND");
    await repository.recordAuditEvent(context, {
      actorId: context.member.id,
      action: "downloaded",
      targetType: "report",
      targetId: report.id,
    });
    return new Response(file.stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": file.size.toString(),
        "Content-Disposition": `attachment; filename="family-daybook-${report.id}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
