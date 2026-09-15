import "server-only";

import type { RecordType } from "@/lib/domain/types";
import type { PurgeTombstone } from "@/lib/domain/types";
import type {
  ParentingRepository,
  RequestContext,
} from "@/lib/repository/repository";
import { deletePrivateFiles } from "@/lib/storage/private-files";

export async function purgeRecord(
  repository: ParentingRepository,
  context: RequestContext,
  input: { recordType: RecordType; recordId: string; reason: string },
) {
  const replay = await repository.getOperationResult<PurgeTombstone>(context);
  const tombstone = replay.found
    ? replay.result
    : await repository.hardPurge(context, input);
  await deletePrivateFiles(tombstone.cleanupPathnames ?? []);
  return tombstone;
}
