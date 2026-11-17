import { PageHeading } from "@/components/app/app-shell";
import { ReportsView } from "@/components/app/reports-view";
import { getPageRequestContext, getRepository } from "@/lib/repository";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const repository = await getRepository();
  const context = await getPageRequestContext();
  const [reports, settings] = await Promise.all([
    repository.getReports(context),
    repository.getSettings(context),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Organized review"
        title="Record packages"
        description="Create immutable report snapshots with transparent counts, revision history, originals, and checksum manifests."
      />
      <ReportsView
        initialData={reports}
        childOptions={settings.children}
        workspace={context.workspace}
        canCreate={context.member.role === "owner"}
      />
    </>
  );
}
