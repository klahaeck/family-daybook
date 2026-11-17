import { PageHeading } from "@/components/app/app-shell";
import { AppointmentsView } from "@/components/app/appointments-view";
import { getPageRequestContext, getRepository } from "@/lib/repository";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const repository = await getRepository();
  const context = await getPageRequestContext();
  const [appointments, settings] = await Promise.all([
    repository.getAppointments(context),
    repository.getSettings(context),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Scheduled care"
        title="Appointments"
        description="Track planned care, the responsible adult, arrival details, and factual attendance outcomes."
      />
      <AppointmentsView
        initialData={appointments}
        childOptions={settings.children}
        caregivers={settings.caregivers}
        workspace={context.workspace}
      />
    </>
  );
}
