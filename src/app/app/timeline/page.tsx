import { AppShell, PageHeading } from "@/components/app/app-shell";
import { TimelineView } from "@/components/app/timeline-view";
import { getPageRequestContext, getRepository } from "@/lib/repository";

export const metadata = { title: "Timeline" };

export default async function TimelinePage() {
  const repository = await getRepository();
  const context = await getPageRequestContext();
  const data = await repository.getTimeline(context);
  return (
    <AppShell workspace={context.workspace} member={context.member}>
      <PageHeading
        eyebrow="Review"
        title="Family timeline"
        description="Review records chronologically or compare caregiving records with configurable charts."
      />
      <TimelineView
        initialData={data}
        canPurge={context.member.role === "owner" && context.workspace.hardDeleteEnabled}
      />
    </AppShell>
  );
}
