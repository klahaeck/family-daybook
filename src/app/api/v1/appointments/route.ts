import { apiContext, apiError, apiJson, parseJson } from "@/lib/api/v1";
import { appointmentSchema } from "@/lib/domain/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { repository, context } = await apiContext();
    return apiJson({ data: await repository.getAppointments(context) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, appointmentSchema);
    const { repository, context } = await apiContext({
      request,
      operationName: "appointment.create",
      input,
    });
    const appointment = await repository.createAppointment(context, input);
    return apiJson({ data: appointment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
