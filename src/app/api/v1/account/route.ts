import { z } from "zod";

import {
  apiContext,
  apiError,
  apiIdentity,
  apiJson,
  parseJson,
  requireIdempotencyKey,
} from "@/lib/api/v1";
import { deleteApplicationAccount } from "@/lib/application/account-deletion-service";

const inputSchema = z.object({
  confirmation: z.literal("DELETE MY ACCOUNT"),
});

export async function DELETE(request: Request) {
  try {
    const input = await parseJson(request, inputSchema);
    const operationId = requireIdempotencyKey(request);
    const identity = await apiIdentity();
    const result = await deleteApplicationAccount(
      identity.authUserId,
      operationId,
      {
        loadContext: () =>
          apiContext({
            requireBilling: false,
            allowAccountDeletion: true,
            request,
            operationName: "account.delete_application_data",
            input,
          }),
      },
    );
    return apiJson({ data: result });
  } catch (error) {
    return apiError(error);
  }
}
