import { apiContext, apiError, apiJson, parseJson, requireOwner } from "@/lib/api/v1";
import { inviteWorkspaceReviewer } from "@/lib/application/reviewer-service";
import { inviteSchema } from "@/lib/domain/schemas";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, inviteSchema);
    const { repository, context } = await apiContext({
      request,
      operationName: "reviewer.invite",
      input,
    });
    requireOwner(context);
    const member = await inviteWorkspaceReviewer(repository, context, input);
    return apiJson({ data: member }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
