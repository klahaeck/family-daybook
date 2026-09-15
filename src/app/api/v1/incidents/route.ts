import { apiContext, apiError, apiJson, parseJson } from "@/lib/api/v1";
import { incidentSchema } from "@/lib/domain/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { repository, context } = await apiContext();
    return apiJson({ data: await repository.getIncidentsData(context) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, incidentSchema);
    const { repository, context } = await apiContext({
      request,
      operationName: "incident.create",
      input,
    });
    const incident = await repository.createIncident(context, input);
    return apiJson({ data: incident }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
