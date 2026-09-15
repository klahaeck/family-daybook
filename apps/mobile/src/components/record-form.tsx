import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { View } from "react-native";
import type { z } from "zod";

import { customCareRecordInputSchema } from "@family-daybook/contracts";
import { ActionButton, Body, ChoiceRow, Field, Heading } from "@/components/ui";
import { localDateTimeIso } from "@/utils";

type Values = z.input<typeof customCareRecordInputSchema>;

export function CustomCareForm({ date, childOptions, caregivers, onSubmit, pending }: {
  date: string;
  childOptions: Array<{ id: string; displayName: string }>;
  caregivers: Array<{ id: string; displayName: string }>;
  onSubmit: (input: Values) => void;
  pending: boolean;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(customCareRecordInputSchema),
    defaultValues: {
      localDate: date,
      source: { kind: "custom", label: "" },
      childIds: [],
      caregiverIds: [],
      status: "completed",
      occurredAt: localDateTimeIso(date, "12:00"),
      notes: "",
    },
  });
  const status = useWatch({ control: form.control, name: "status" });
  const selectedChildren = useWatch({ control: form.control, name: "childIds" });
  const selectedCaregivers = useWatch({ control: form.control, name: "caregiverIds" });
  return (
    <View style={{ gap: 12 }}>
      <Heading>Custom care entry</Heading>
      <Controller control={form.control} name="source.label" render={({ field, fieldState }) => <Field label="What happened?" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
      <Heading>Children</Heading>
      {childOptions.map((child) => <ChoiceRow key={child.id} label={child.displayName} selected={selectedChildren.includes(child.id)} onPress={() => form.setValue("childIds", selectedChildren.includes(child.id) ? selectedChildren.filter((id) => id !== child.id) : [...selectedChildren, child.id], { shouldValidate: true })} />)}
      {form.formState.errors.childIds?.message ? <Body muted>{form.formState.errors.childIds.message}</Body> : null}
      {(["completed", "partial", "missed", "not_applicable"] as const).map((value) => <ChoiceRow key={value} label={value.replace("_", " ")} selected={status === value} onPress={() => { form.setValue("status", value); if (value === "missed" || value === "not_applicable") form.setValue("caregiverIds", []); }} />)}
      {(status === "completed" || status === "partial") ? caregivers.map((caregiver) => <ChoiceRow key={caregiver.id} label={caregiver.displayName} selected={selectedCaregivers.includes(caregiver.id)} onPress={() => form.setValue("caregiverIds", selectedCaregivers.includes(caregiver.id) ? selectedCaregivers.filter((id) => id !== caregiver.id) : [...selectedCaregivers, caregiver.id], { shouldValidate: true })} />) : null}
      {form.formState.errors.caregiverIds?.message ? <Body muted>{form.formState.errors.caregiverIds.message}</Body> : null}
      <Controller control={form.control} name="notes" render={({ field, fieldState }) => <Field label="Notes (optional)" value={field.value ?? ""} onChangeText={field.onChange} multiline error={fieldState.error?.message} />} />
      <ActionButton label={pending ? "Saving…" : "Save entry"} disabled={pending} onPress={form.handleSubmit(onSubmit)} />
    </View>
  );
}
