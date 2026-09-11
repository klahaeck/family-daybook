import { NextResponse } from "next/server";

import { privateRouteError } from "@/lib/auth/private-route-error";
import { getRepository, getRequestContext } from "@/lib/repository";
import { getPrivateFileStream } from "@/lib/storage/private-files";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const repository = await getRepository();
    const context = await getRequestContext();
    const attachment = await repository.getAttachment(context, id);
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const file = await getPrivateFileStream(attachment.pathname);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await repository.recordAuditEvent(context, { actorId: context.member.id, action: "downloaded", targetType: "attachment", targetId: attachment.id });
    const safeName = attachment.originalName.replace(/["\r\n]/g, "_");
    return new NextResponse(file.stream, { headers: { "Content-Type": file.contentType, "Content-Length": file.size.toString(), "Content-Disposition": `attachment; filename="${safeName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return privateRouteError(error);
  }
}
