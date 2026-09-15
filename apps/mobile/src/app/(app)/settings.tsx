import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { Settings } from "@family-daybook/contracts";

import { AppearancePicker } from "@/components/appearance-picker";
import { SettingsSectionTabs, type SettingsSection } from "@/components/settings-section-tabs";
import { ActionButton, Badge, Body, Card, ChoiceRow, Field, Heading, InlineNotice, Screen, ScreenState } from "@/components/ui";
import { useAppTheme, useThemedStyles } from "@/mobile-theme";
import { useApi, useDaybookSession } from "@/providers";
import { spacing, type ThemeColors } from "@/theme";
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
      {settings.data ? <SettingsEditor settings={settings.data} canManageReviewers={Boolean(session.data.capabilities.manageReviewers)} /> : null}
    </Screen>
  );
}

function SettingsEditor({ settings, canManageReviewers }: { settings: Settings; canManageReviewers: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const initial = editableValues(settings);
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [hardDeleteEnabled, setHardDeleteEnabled] = useState(initial.hardDeleteEnabled);
  const [children, setChildren] = useState<EditableChild[]>(initial.children);
  const [caregivers, setCaregivers] = useState<EditableCaregiver[]>(initial.caregivers);
  const [routines, setRoutines] = useState<EditableRoutine[]>(initial.routines);
  const [section, setSection] = useState<SettingsSection>("family");
  const [saveMessage, setSaveMessage] = useState<string>();
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");

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
    onMutate: () => setSaveMessage(undefined),
    onSuccess: async (saved) => {
      applySavedSettings(saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
        queryClient.invalidateQueries({ queryKey: ["day"] }),
      ]);
      setSaveMessage("Settings saved.");
    },
  });

  const refreshReviewers = () => queryClient.invalidateQueries({ queryKey: ["settings"] });
  const inviteReviewer = useMutation({
    mutationFn: () => api.inviteReviewer({ email: reviewerEmail, displayName: reviewerName }),
    onSuccess: async () => {
      setReviewerName("");
      setReviewerEmail("");
      await refreshReviewers();
    },
  });
  const revokeReviewer = useMutation({
    mutationFn: (id: string) => api.revokeReviewer(id),
    onSuccess: refreshReviewers,
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
  const reviewers = settings.members.filter((member) => member.role === "reviewer");
  const activeRoutines = routines.filter((routine) => routine.active);
  const saveSettingsCard = (label: string) => (
    <Card>
      <Heading>Save changes</Heading>
      <Body muted>Edits stay in place while you switch between Family and Routine. Saving applies both sections.</Body>
      {update.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{friendlyError(update.error)}</Text> : null}
      <ActionButton label={update.isPending ? "Saving…" : label} disabled={update.isPending} onPress={() => update.mutate()} />
    </Card>
  );

  return (
    <>
      <SettingsSectionTabs value={section} onChange={setSection} />
      {saveMessage ? <InlineNotice tone="success">{saveMessage}</InlineNotice> : null}

      {section === "family" ? <>
        <Card>
          <Heading>Family workspace</Heading>
          <Body muted>These names appear throughout the private app and generated reports.</Body>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="IANA timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" />
          <ChoiceRow label="Allow permanent record deletion" selected={hardDeleteEnabled} onPress={() => setHardDeleteEnabled(!hardDeleteEnabled)} />
        </Card>

        <Card>
          <Heading>Appearance</Heading>
          <Body muted>Use a light or dark palette, or follow this device. Your choice is saved on this device.</Body>
          <AppearancePicker />
        </Card>

        <Card>
          <Heading>Children</Heading>
          <Body muted>Child records retain their stable IDs; update the name or birthdate here.</Body>
          {children.map((child, index) => (
            <View key={child.id} style={styles.editorGroup}>
              <Field label={`Child ${index + 1} name`} value={child.displayName} onChangeText={(displayName) => updateChild(index, { displayName })} />
              <Field label="Birthdate (YYYY-MM-DD)" value={child.birthdate} onChangeText={(birthdate) => updateChild(index, { birthdate })} autoCapitalize="none" />
            </View>
          ))}
        </Card>

        <Card>
          <Heading>Caregivers</Heading>
          <Body muted>Add the people who can be associated with care records.</Body>
          {caregivers.map((caregiver, index) => (
            <View key={caregiver.id ?? `new-caregiver-${index}`} style={styles.editorGroup}>
              <Field label={`Caregiver ${index + 1} name`} value={caregiver.displayName} onChangeText={(displayName) => updateCaregiver(index, { displayName })} />
              <Field label="Relationship" value={caregiver.relationship} onChangeText={(relationship) => updateCaregiver(index, { relationship })} />
              {!caregiver.id && caregivers.length > 1 ? <ActionButton label="Remove unsaved caregiver" secondary onPress={() => setCaregivers((current) => current.filter((_, caregiverIndex) => caregiverIndex !== index))} /> : null}
            </View>
          ))}
          <ActionButton label="Add caregiver" secondary onPress={() => setCaregivers((current) => [...current, { displayName: "", relationship: "" }])} />
        </Card>
        {saveSettingsCard("Save family settings")}
      </> : null}

      {section === "routine" ? <>
        <Card accent>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Heading>Weekly routine</Heading>
              <Body muted>{activeRoutines.length} active {activeRoutines.length === 1 ? "item" : "items"}. Saving creates a new template version; past days keep their original plan.</Body>
            </View>
            <Badge>Version {settings.template.version}</Badge>
          </View>
          <View style={styles.weekGrid}>
            {WEEKDAYS.map(([day, label]) => {
              const count = activeRoutines.filter((routine) => routine.weekdays.includes(day)).length;
              return <View key={day} style={styles.weekDay}><Text style={styles.weekLabel}>{label}</Text><Text style={styles.weekCount}>{count}</Text></View>;
            })}
          </View>
        </Card>

        <Card>
          <Heading>Routine items</Heading>
          {routines.length === 0 ? <Body muted>No routine items yet.</Body> : null}
          {routines.map((routine, index) => (
            <View key={routine.id ?? `new-routine-${index}`} style={styles.routineGroup}>
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
              <View style={styles.presetRow}>
                <ActionButton compact label="Every day" secondary onPress={() => updateRoutine(index, { weekdays: [0, 1, 2, 3, 4, 5, 6] })} />
                <ActionButton compact label="Weekdays" secondary onPress={() => updateRoutine(index, { weekdays: [1, 2, 3, 4, 5] })} />
                <ActionButton compact label="Weekends" secondary onPress={() => updateRoutine(index, { weekdays: [0, 6] })} />
              </View>
              {WEEKDAYS.map(([day, label]) => (
                <ChoiceRow
                  key={day}
                  label={label}
                  selected={routine.weekdays.includes(day)}
                  onPress={() => {
                    if (routine.weekdays.includes(day) && routine.weekdays.length === 1) return;
                    updateRoutine(index, {
                      weekdays: routine.weekdays.includes(day)
                        ? routine.weekdays.filter((value) => value !== day)
                        : [...routine.weekdays, day].sort(),
                    });
                  }}
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
        {saveSettingsCard("Save routine")}
      </> : null}

      {section === "access" ? <>
        {!canManageReviewers ? <InlineNotice>Reviewer access is not available for this account.</InlineNotice> : <>
          <Card>
            <Heading>Reviewers</Heading>
            <Body muted>Reviewers can see finalized records and download reports, but cannot change records or settings.</Body>
            {reviewers.length === 0 ? <Body muted>No reviewers yet.</Body> : reviewers.map((reviewer) => (
              <View key={reviewer.id} style={styles.reviewerRow}>
                <View style={styles.reviewerCopy}>
                  <Text style={styles.reviewerName}>{reviewer.displayName}</Text>
                  <Text style={styles.reviewerEmail}>{reviewer.email}</Text>
                </View>
                <Badge danger={reviewer.status === "revoked"}>{reviewer.status}</Badge>
                {reviewer.status !== "revoked" ? <ActionButton compact label="Revoke" danger disabled={revokeReviewer.isPending} onPress={() => Alert.alert("Revoke reviewer?", `${reviewer.displayName} will immediately lose access.`, [{ text: "Cancel", style: "cancel" }, { text: "Revoke", style: "destructive", onPress: () => revokeReviewer.mutate(reviewer.id) }])} /> : null}
              </View>
            ))}
            {revokeReviewer.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{friendlyError(revokeReviewer.error)}</Text> : null}
          </Card>

          <Card>
            <Heading>Invite reviewer</Heading>
            <Field label="Name" value={reviewerName} onChangeText={setReviewerName} />
            <Field label="Email" value={reviewerEmail} onChangeText={setReviewerEmail} keyboardType="email-address" autoCapitalize="none" />
            {inviteReviewer.error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{friendlyError(inviteReviewer.error)}</Text> : null}
            <ActionButton label={inviteReviewer.isPending ? "Inviting…" : "Send invitation"} disabled={inviteReviewer.isPending || !reviewerEmail.includes("@") || reviewerName.trim().length < 2} onPress={() => inviteReviewer.mutate()} />
          </Card>
        </>}

        <Card>
          <Heading>Security posture</Heading>
          <Body muted>Invitation-only access with owner and reviewer roles.</Body>
          <Body muted>Server-side authorization protects every read, mutation, file, and report route.</Body>
          <Body muted>Original files stay private and are delivered without persistent caching.</Body>
        </Card>
      </> : null}
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  editorGroup: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md },
  routineGroup: { backgroundColor: colors.mutedSurface, borderRadius: 14, gap: spacing.sm, padding: spacing.md },
  sectionHeader: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  sectionHeaderCopy: { flex: 1, gap: 4, minWidth: 0 },
  weekGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  weekDay: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, minWidth: 54, paddingHorizontal: 9, paddingVertical: 8 },
  weekLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  weekCount: { color: colors.ink, fontSize: 18, fontWeight: "700", marginTop: 2 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  reviewerRow: { alignItems: "flex-start", borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md },
  reviewerCopy: { gap: 2 },
  reviewerName: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  reviewerEmail: { color: colors.muted, fontSize: 13 },
});
