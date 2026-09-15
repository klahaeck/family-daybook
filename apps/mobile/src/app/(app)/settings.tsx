import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import type { Settings } from "@family-daybook/contracts";

import { ActionButton, Body, Card, ChoiceRow, Field, Heading, InlineNotice, Screen, ScreenState } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors, spacing } from "@/theme";
import { friendlyError } from "@/utils";

const WEEKDAYS = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
] as const;

type EditableChild = Pick<Settings["children"][number], "id" | "displayName" | "birthdate">;
type EditableCaregiver = Pick<Settings["caregivers"][number], "displayName" | "relationship"> & { id?: string };
type EditableRoutine = Pick<Settings["template"]["items"][number], "label" | "suggestedTime" | "childIds" | "weekdays" | "active"> & { id?: string };

function editableValues(settings: Settings) {
  return {
    name: settings.workspace.name,
    timezone: settings.workspace.timezone,
    hardDeleteEnabled: settings.workspace.hardDeleteEnabled,
    children: settings.children.map(({ id, displayName, birthdate }) => ({ id, displayName, birthdate })),
    caregivers: settings.caregivers.map(({ id, displayName, relationship }) => ({ id, displayName, relationship })),
    routines: settings.template.items.map(({ id, label, suggestedTime, childIds, weekdays, active }) => ({ id, label, suggestedTime, childIds, weekdays, active })),
  };
}

export default function SettingsScreen() {
  const api = useApi();
  const session = useDaybookSession();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: Boolean(session.data?.capabilities.manageSettings) });
  if (!session.data?.capabilities.manageSettings) return <Screen title="Settings"><InlineNotice>Only workspace owners can manage settings.</InlineNotice></Screen>;
  return (
    <Screen title="Settings" subtitle="Manage the workspace, people, and daily routine.">
      <ScreenState loading={settings.isPending} error={settings.error} onRetry={() => void settings.refetch()} />
      {settings.data ? <SettingsEditor settings={settings.data} /> : null}
    </Screen>
  );
}

function SettingsEditor({ settings }: { settings: Settings }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const initial = editableValues(settings);
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [hardDeleteEnabled, setHardDeleteEnabled] = useState(initial.hardDeleteEnabled);
  const [children, setChildren] = useState<EditableChild[]>(initial.children);
  const [caregivers, setCaregivers] = useState<EditableCaregiver[]>(initial.caregivers);
  const [routines, setRoutines] = useState<EditableRoutine[]>(initial.routines);

  const applySavedSettings = (saved: Settings) => {
    const next = editableValues(saved);
    setName(next.name);
    setTimezone(next.timezone);
    setHardDeleteEnabled(next.hardDeleteEnabled);
    setChildren(next.children);
    setCaregivers(next.caregivers);
    setRoutines(next.routines);
  };

  const update = useMutation({
    mutationFn: () => api.updateSettings({ name, timezone, hardDeleteEnabled, children, caregivers, routineItems: routines }),
    onSuccess: async (saved) => {
      applySavedSettings(saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
        queryClient.invalidateQueries({ queryKey: ["day"] }),
      ]);
    },
  });

  const updateChild = (index: number, patch: Partial<EditableChild>) => {
    setChildren((current) => current.map((child, childIndex) => childIndex === index ? { ...child, ...patch } : child));
  };
  const updateCaregiver = (index: number, patch: Partial<EditableCaregiver>) => {
    setCaregivers((current) => current.map((caregiver, caregiverIndex) => caregiverIndex === index ? { ...caregiver, ...patch } : caregiver));
  };
  const updateRoutine = (index: number, patch: Partial<EditableRoutine>) => {
    setRoutines((current) => current.map((routine, routineIndex) => routineIndex === index ? { ...routine, ...patch } : routine));
  };

  return (
    <>
      <Card>
        <Heading>Workspace</Heading>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="IANA timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
        <ChoiceRow label="Allow permanent record deletion" selected={hardDeleteEnabled} onPress={() => setHardDeleteEnabled(!hardDeleteEnabled)} />
      </Card>

      <Card>
        <Heading>Children</Heading>
        <Body muted>Child records retain their stable IDs; update the name or birthdate here.</Body>
        {children.map((child, index) => (
          <View key={child.id} style={{ gap: spacing.sm }}>
            <Field label={`Child ${index + 1} name`} value={child.displayName} onChangeText={(displayName) => updateChild(index, { displayName })} />
            <Field label="Birthdate (YYYY-MM-DD)" value={child.birthdate} onChangeText={(birthdate) => updateChild(index, { birthdate })} autoCapitalize="none" />
          </View>
        ))}
      </Card>

      <Card>
        <Heading>Caregivers</Heading>
        {caregivers.map((caregiver, index) => (
          <View key={caregiver.id ?? `new-caregiver-${index}`} style={{ gap: spacing.sm }}>
            <Field label={`Caregiver ${index + 1} name`} value={caregiver.displayName} onChangeText={(displayName) => updateCaregiver(index, { displayName })} />
            <Field label="Relationship" value={caregiver.relationship} onChangeText={(relationship) => updateCaregiver(index, { relationship })} />
            {!caregiver.id && caregivers.length > 1 ? <ActionButton label="Remove unsaved caregiver" secondary onPress={() => setCaregivers((current) => current.filter((_, caregiverIndex) => caregiverIndex !== index))} /> : null}
          </View>
        ))}
        <ActionButton label="Add caregiver" secondary onPress={() => setCaregivers((current) => [...current, { displayName: "", relationship: "" }])} />
      </Card>

      <Card>
        <Heading>Routine</Heading>
        {routines.length === 0 ? <Body muted>No routine items yet.</Body> : null}
        {routines.map((routine, index) => (
          <View key={routine.id ?? `new-routine-${index}`} style={{ gap: spacing.sm }}>
            <Field label={`Routine ${index + 1} label`} value={routine.label} onChangeText={(label) => updateRoutine(index, { label })} />
            <Field label="Suggested time (HH:mm)" value={routine.suggestedTime} onChangeText={(suggestedTime) => updateRoutine(index, { suggestedTime })} autoCapitalize="none" />
            <ChoiceRow label="Active" selected={routine.active} onPress={() => updateRoutine(index, { active: !routine.active })} />
            <Body muted>Children</Body>
            {children.map((child) => (
              <ChoiceRow
                key={child.id}
                label={child.displayName || "Unnamed child"}
                selected={routine.childIds.includes(child.id)}
                onPress={() => updateRoutine(index, {
                  childIds: routine.childIds.includes(child.id)
                    ? routine.childIds.filter((id) => id !== child.id)
                    : [...routine.childIds, child.id],
                })}
              />
            ))}
            <Body muted>Repeats on</Body>
            {WEEKDAYS.map(([day, label]) => (
              <ChoiceRow
                key={day}
                label={label}
                selected={routine.weekdays.includes(day)}
                onPress={() => updateRoutine(index, {
                  weekdays: routine.weekdays.includes(day)
                    ? routine.weekdays.filter((value) => value !== day)
                    : [...routine.weekdays, day].sort(),
                })}
              />
            ))}
            {!routine.id ? <ActionButton label="Remove unsaved routine" secondary onPress={() => setRoutines((current) => current.filter((_, routineIndex) => routineIndex !== index))} /> : null}
          </View>
        ))}
        <ActionButton
          label="Add routine item"
          secondary
          onPress={() => setRoutines((current) => [...current, {
            label: "",
            suggestedTime: "08:00",
            childIds: children.map((child) => child.id),
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            active: true,
          }])}
        />
      </Card>

      <Card>
        <Heading>Save changes</Heading>
        {update.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{friendlyError(update.error)}</Text> : null}
        <ActionButton label={update.isPending ? "Saving…" : "Save all settings"} disabled={update.isPending} onPress={() => update.mutate()} />
      </Card>
    </>
  );
}
