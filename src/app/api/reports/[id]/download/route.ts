import { NextResponse } from "next/server";

import { privateRouteError } from "@/lib/auth/private-route-error";
import { getRepository, getRequestContext } from "@/lib/repository";
import { getPrivateFileStream } from "@/lib/storage/private-files";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const format = new URL(request.url).searchParams.get("format") === "zip" ? "zip" : "pdf";
    const repository = await getRepository();
    const context = await getRequestContext();
    const report = (await repository.getReports(context)).find((item) => item.id === id);
    if (!report || report.status !== "ready") return NextResponse.json({ error: "Not found" }, { status: 404 });
    const pathname = format === "zip" ? report.zipPathname : report.pdfPathname;
    if (!pathname) return NextResponse.json({ error: "Artifact unavailable" }, { status: 404 });
    const file = await getPrivateFileStream(pathname);
    if (!file) return NextResponse.json({ error: "Artifact unavailable" }, { status: 404 });
    await repository.recordAuditEvent(context, { actorId: context.member.id, action: "downloaded", targetType: "report", targetId: report.id, metadata: { format } });
    return new NextResponse(file.stream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": file.size.toString(),
        "Content-Disposition": `attachment; filename="${format === "zip" ? "parenting-log-evidence.zip" : "parenting-log.pdf"}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return privateRouteError(error);
  }
}
