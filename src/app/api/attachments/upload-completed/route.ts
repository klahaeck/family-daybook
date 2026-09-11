import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import {
  completeAttachmentUploadFromCallback,
  parseAttachmentCallbackClaim,
} from "@/lib/storage/attachment-uploads";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadPresignedBody;
    if (body.type !== "blob.upload-completed") {
      return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
    }
    const result = await handleUploadPresigned({
      request,
      body,
      getSignedToken: async () => {
        throw new Error("Upload preparation is handled by a server action.");
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const claim = parseAttachmentCallbackClaim(tokenPayload);
        await completeAttachmentUploadFromCallback(claim, blob.pathname);
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  }
}
