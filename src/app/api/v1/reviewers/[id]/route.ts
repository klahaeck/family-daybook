import { apiContext, apiError, apiJson, requireOwner } from "@/lib/api/v1";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = { memberId: id };
    const { repository, context } = await apiContext({
      request,
      operationName: "reviewer.revoke",
      input,
    });
    requireOwner(context);
    await repository.revokeReviewer(context, id);
    return apiJson({ data: { revoked: true } });
  } catch (error) {
    return apiError(error);
  }
}
