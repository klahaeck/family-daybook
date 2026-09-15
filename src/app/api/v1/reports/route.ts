import { apiContext, apiError, apiJson, parseJson } from "@/lib/api/v1";
import { createReportPackage } from "@/lib/application/report-service";
import { reportSchema } from "@/lib/domain/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { repository, context } = await apiContext();
    return apiJson({ data: await repository.getReports(context) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, reportSchema);
    const { repository, context } = await apiContext({
      request,
      operationName: "report.create",
      input,
    });
    const result = await createReportPackage(repository, context, input);
    return apiJson({ data: result.report }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
