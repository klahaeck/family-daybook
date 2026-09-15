import { apiContext, apiError, apiJson } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { repository, context } = await apiContext();
    const report = (await repository.getReports(context)).find(
      (item) => item.id === id,
    );
    if (!report) throw new Error("NOT_FOUND");
    return apiJson({ data: report });
  } catch (error) {
    return apiError(error);
  }
}
