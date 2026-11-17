import { notFound } from "next/navigation";

import { PageHeading } from "@/components/app/app-shell";
import { SpecialArrangementsView } from "@/components/app/special-arrangements-view";
import { getPageRequestContext, getRepository } from "@/lib/repository";

export const metadata = { title: "Special days" };

export default async function SpecialDaysPage() {
  const repository = await getRepository();
  const context = await getPageRequestContext();
  if (context.member.role !== "owner") notFound();
  const data = await repository.getSpecialArrangements(context);

  return (
    <>
      <PageHeading
        eyebrow="Owner only"
        title="Special days"
        description="Plan temporary caregiving arrangements and date-specific tasks without changing the repeating routine."
      />
      <SpecialArrangementsView initialData={data} />
    </>
  );
}
