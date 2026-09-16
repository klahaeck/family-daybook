import { getMobileAppIdentifier } from "@/lib/deployment/environment";

export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_APP_TEAM_ID?.trim();
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) {
    return Response.json(
      { error: "MOBILE_APP_LINKS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${teamId}.${getMobileAppIdentifier()}`],
            components: [{ "/": "/mobile/complete", comment: "Mobile checkout completion" }],
          },
        ],
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/json",
      },
    },
  );
}
