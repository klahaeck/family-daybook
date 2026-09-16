import { getMobileAppIdentifier } from "@/lib/deployment/environment";

const fingerprintPattern = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (
    process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS ?? ""
  )
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => fingerprintPattern.test(value));

  if (fingerprints.length === 0) {
    return Response.json(
      { error: "MOBILE_APP_LINKS_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: getMobileAppIdentifier(),
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/json",
      },
    },
  );
}
