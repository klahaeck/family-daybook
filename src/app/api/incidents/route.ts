import { NextResponse } from "next/server";
import { privateRouteError } from "@/lib/auth/private-route-error";
import { getRepository, getRequestContext } from "@/lib/repository";

export async function GET() {
  try {
    const repository = await getRepository();
    const context = await getRequestContext();
    return NextResponse.json(await repository.getIncidentsData(context), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return privateRouteError(error);
  }
}
