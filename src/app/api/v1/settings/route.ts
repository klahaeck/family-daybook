import { apiContext, apiError, apiJson, parseJson, requireOwner } from "@/lib/api/v1";
import { localDateInTimezone } from "@/lib/domain/dates";
import { workspaceSettingsSchema } from "@/lib/domain/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { repository, context } = await apiContext();
    requireOwner(context);
    return apiJson({ data: await repository.getSettings(context) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = await parseJson(request, workspaceSettingsSchema);
    const today = localDateInTimezone(new Date(), input.timezone);
    if (input.children.some((child) => child.birthdate > today)) {
      throw new Error("INVALID_BIRTHDATE");
    }
    const { repository, context } = await apiContext({
      request,
      operationName: "settings.update",
      input,
    });
    requireOwner(context);
    return apiJson({ data: await repository.updateSettings(context, input) });
  } catch (error) {
    return apiError(error);
  }
}
