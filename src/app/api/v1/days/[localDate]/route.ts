import { apiContext, apiError, apiJson } from "@/lib/api/v1";
import { createDaybookService } from "@/lib/application/daybook-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ localDate: string }> },
) {
  try {
    const { localDate } = await params;
    const { repository, context } = await apiContext();
    const day = await createDaybookService(repository, context).getDay(localDate);
    return apiJson({ data: day }, {}, day.dayVersion);
  } catch (error) {
    return apiError(error);
  }
}
