import { apiContext, apiError, apiJson, parseJson } from "@/lib/api/v1";
import { specialArrangementCreateSchema } from "@/lib/domain/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { repository, context } = await apiContext();
    return apiJson({ data: await repository.getSpecialArrangements(context) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, specialArrangementCreateSchema);
    const { repository, context } = await apiContext({
      request,
      operationName: "special_day.create",
      input,
    });
    const days = await repository.createSpecialArrangement(context, input);
    return apiJson(
      {
        data: {
          seriesId: days.at(0)?.seriesId ?? null,
          days,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
