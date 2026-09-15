import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SpecialDayDetail } from "@family-daybook/contracts";
import { useState } from "react";
import { Alert, Text } from "react-native";

import { ActionButton, Body, Card, ChoiceRow, Field, Heading, InlineNotice, Screen, ScreenState } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError, todayLocalDate } from "@/utils";

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export default function SpecialDaysScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const canManage = Boolean(session.data?.capabilities.manageSpecialDays);
  const specialDays = useQuery({ queryKey: ["special-days"], queryFn: api.listSpecialDays, enabled: canManage });
  const [selectedId, setSelectedId] = useState<string>();
  const [date, setDate] = useState(todayLocalDate());
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [childId, setChildId] = useState<string>();
  const [caregiverId, setCaregiverId] = useState<string>();
  const create = useMutation({
    mutationFn: () => {
      if (!childId || !caregiverId) throw new Error("Choose a child and caregiver.");
      return api.createSpecialDay({
        startDate: date,
        endDate: date,
        title,
        note: note.trim() || undefined,
        assignments: [{ childId, caregiverIds: [caregiverId] }],
        days: [{ localDate: date, tasks: [] }],
      });
    },
    onSuccess: async () => {
      setTitle("");
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["special-days"] }),
        queryClient.invalidateQueries({ queryKey: ["day"] }),
      ]);
    },
  });

  if (!canManage) {
    return <Screen title="Special days"><InlineNotice>Only workspace owners can manage special-day arrangements.</InlineNotice></Screen>;
  }

  return (
    <Screen title="Special days" subtitle="Plan temporary arrangements without rewriting the normal routine.">
      <Card>
        <Heading>Add a special day</Heading>
        <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" />
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Notes (optional)" value={note} onChangeText={setNote} multiline />
        <Body muted>Child</Body>
        {specialDays.data?.children.map((child) => (
          <ChoiceRow key={child.id} label={child.displayName} selected={childId === child.id} onPress={() => setChildId(child.id)} />
        ))}
        <Body muted>Caregiver</Body>
        {specialDays.data?.caregivers.map((caregiver) => (
          <ChoiceRow key={caregiver.id} label={`${caregiver.displayName} · ${caregiver.relationship}`} selected={caregiverId === caregiver.id} onPress={() => setCaregiverId(caregiver.id)} />
        ))}
        {specialDays.data && (!specialDays.data.children.length || !specialDays.data.caregivers.length) ? <InlineNotice>Add an active child and caregiver in Settings first.</InlineNotice> : null}
        {create.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{friendlyError(create.error)}</Text> : null}
        <ActionButton
          label={create.isPending ? "Saving…" : "Create special day"}
          disabled={create.isPending || title.trim().length < 2 || !childId || !caregiverId}
          onPress={() => create.mutate()}
        />
      </Card>

      <ScreenState loading={specialDays.isPending} error={specialDays.error} onRetry={() => void specialDays.refetch()} empty={specialDays.data?.days.length === 0 ? "No special days planned." : undefined} />
      {selectedId ? (
        <SpecialDayEditor
          id={selectedId}
          childOptions={specialDays.data?.children ?? []}
          caregivers={specialDays.data?.caregivers ?? []}
          onClose={() => setSelectedId(undefined)}
        />
      ) : null}
      {specialDays.data?.days.map((item) => (
        <Card key={item.id}>
          <Heading>{item.title}</Heading>
          <Body>{item.localDate}</Body>
          <Body muted>{item.status}</Body>
          {item.note ? <Body>{item.note}</Body> : null}
          <ActionButton label={selectedId === item.id ? "Editing below" : "Edit arrangement"} secondary disabled={selectedId === item.id} onPress={() => setSelectedId(item.id)} />
        </Card>
      ))}
    </Screen>
  );
}

function SpecialDayEditor({ id, childOptions, caregivers, onClose }: {
  id: string;
  childOptions: Array<{ id: string; displayName: string }>;
  caregivers: Array<{ id: string; displayName: string }>;
  onClose: () => void;
}) {
  const api = useApi();
  const detail = useQuery({ queryKey: ["special-day", id], queryFn: () => api.getSpecialDay(id) });
  return (
    <Card>
      <Heading>Edit special day</Heading>
      <ScreenState loading={detail.isPending} error={detail.error} onRetry={() => void detail.refetch()} />
      {detail.data ? (
        <LoadedSpecialDayEditor
          key={`${detail.data.id}:${detail.data.recordVersion}`}
          day={detail.data}
          childOptions={childOptions}
          caregivers={caregivers}
          onClose={onClose}
        />
      ) : <ActionButton label="Close editor" secondary onPress={onClose} />}
    </Card>
  );
}

function LoadedSpecialDayEditor({ day, childOptions, caregivers, onClose }: {
  day: SpecialDayDetail;
  childOptions: Array<{ id: string; displayName: string }>;
  caregivers: Array<{ id: string; displayName: string }>;
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(day.title);
  const [note, setNote] = useState(day.note ?? "");
  const update = useMutation({
    mutationFn: (status: SpecialDayDetail["status"]) => api.updateSpecialDay(day.id, {
      title,
      note: note.trim() || undefined,
      status,
      assignments: day.assignments,
      tasks: day.tasks,
    }, day.recordVersion),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["special-day", day.id], saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["special-days"] }),
        queryClient.invalidateQueries({ queryKey: ["day"] }),
      ]);
    },
  });
  const childName = (id: string) => childOptions.find((child) => child.id === id)?.displayName ?? "Unknown child";
  const caregiverName = (id: string) => caregivers.find((caregiver) => caregiver.id === id)?.displayName ?? "Unknown caregiver";
  const conflict = errorCode(update.error) === "VERSION_CONFLICT";

  return (
    <>
      <Body muted>{day.localDate} · {day.status}</Body>
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Notes (optional)" value={note} onChangeText={setNote} multiline />
      <Heading>Assignments</Heading>
      {day.assignments.map((assignment) => (
        <Body key={assignment.childId}>{childName(assignment.childId)} · {assignment.caregiverIds.map(caregiverName).join(", ")}</Body>
      ))}
      <Heading>Planned tasks</Heading>
      {day.tasks.length ? day.tasks.map((task) => <Body key={task.id}>{task.suggestedTime} · {task.label} · {childName(task.childId)}</Body>) : <Body muted>No planned tasks.</Body>}
      <Body muted>Assignments and planned tasks are preserved when saving or changing status.</Body>
      {update.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{friendlyError(update.error)}</Text> : null}
      {conflict ? (
        <InlineNotice>This arrangement changed elsewhere. Reload the latest version before trying again.</InlineNotice>
      ) : null}
      {conflict ? <ActionButton label="Reload latest" secondary onPress={() => void queryClient.invalidateQueries({ queryKey: ["special-day", day.id] })} /> : null}
      <ActionButton label={update.isPending ? "Saving…" : "Save changes"} disabled={update.isPending || title.trim().length < 2} onPress={() => update.mutate(day.status)} />
      {day.status === "active" ? (
        <ActionButton
          label="Cancel special day"
          danger
          disabled={update.isPending}
          onPress={() => Alert.alert(
            "Cancel this special day?",
            "The arrangement will no longer replace the normal routine. Its history will be preserved.",
            [
              { text: "Keep active", style: "cancel" },
              { text: "Cancel day", style: "destructive", onPress: () => update.mutate("cancelled") },
            ],
          )}
        />
      ) : <ActionButton label="Reactivate special day" disabled={update.isPending} onPress={() => update.mutate("active")} />}
      <ActionButton label="Close editor" secondary onPress={onClose} />
    </>
  );
}
