import { AppShell, PageHeading } from "@/components/app/app-shell";
import { IncidentsView } from "@/components/app/incidents-view";
import { getPageRequestContext, getRepository } from "@/lib/repository";

export const metadata = { title: "Incidents" };

export default async function IncidentsPage() {
  const repository = await getRepository();
  const context = await getPageRequestContext();
  const [incidents, settings] = await Promise.all([
    repository.getIncidentsData(context),
    repository.getSettings(context),
  ]);
  return (
    <AppShell workspace={context.workspace} member={context.member}>
      <PageHeading
        eyebrow="Neutral documentation"
        title="Factual incidents"
        description="Document safety hazards and concerning interactions through observable behavior, exact words, witnesses, and response."
      />
      <IncidentsView
        initialData={incidents}
        childOptions={settings.children}
        workspace={context.workspace}
        canManage={context.member.role === "owner"}
        canPurge={context.member.role === "owner" && context.workspace.hardDeleteEnabled}
      />
    </AppShell>
  );
}
