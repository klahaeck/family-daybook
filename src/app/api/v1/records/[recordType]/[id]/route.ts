import { z } from "zod";

import { apiContext, apiError, apiJson } from "@/lib/api/v1";

const recordTypeSchema = z.enum(["care_entry", "appointment", "incident"]);

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ recordType: string; id: string }> },
) {
  try {
    const { recordType: rawRecordType, id } = await params;
    const parsedRecordType = recordTypeSchema.safeParse(rawRecordType);
    if (!parsedRecordType.success) throw new Error("INVALID_RECORD_TYPE");
    const recordType = parsedRecordType.data;
    const { repository, context } = await apiContext();
    const bundle = await repository.getRecordBundle(context, recordType, id);
    if (!bundle) throw new Error("NOT_FOUND");
    const version = bundle.revisions.at(-1)?.hash;
    if (!version) throw new Error("REVISION_NOT_FOUND");
    return apiJson({ data: { ...bundle, recordVersion: version } }, {}, version);
  } catch (error) {
    return apiError(error);
  }
}
