import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useMemo, useState, type PropsWithChildren } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CustomCareForm } from "@/components/record-form";
import { ActionButton, Badge, Body, Card, ChoiceRow, Field, Heading, IconButton, InlineNotice, ProgressBar, Screen, ScreenState } from "@/components/ui";
import { useAppTheme, useThemedStyles } from "@/mobile-theme";
import { useApi, useDaybookSession } from "@/providers";
import { spacing, type ThemeColors } from "@/theme";
import { recordingRequestForTask } from "@/today-recording";
import { formatLocalDate, friendlyError, shiftDate, todayLocalDate } from "@/utils";

type CareStatus = "completed" | "partial" | "missed" | "not_applicable";

function FormSheet({ children, title, visible, onClose }: PropsWithChildren<{ title: string; visible: boolean; onClose: () => void }>) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.sheetSafeArea}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function TodayScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const today = session.data?.currentLocalDate ?? todayLocalDate();
  const timeZone = session.data?.workspace.timezone ?? "America/Chicago";
  const [date, setDate] = useState(today);
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [customOpen, setCustomOpen] = useState(false);
  const [status, setStatus] = useState<CareStatus>("completed");
  const [localTime, setLocalTime] = useState("12:00");
  const [caregiverIds, setCaregiverIds] = useState<string[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const isReviewer = session.data?.member.role === "reviewer";
  const day = useQuery({ queryKey: ["day", date], queryFn: () => api.getDay(date), enabled: session.data?.billing.status === "active" && !isReviewer });
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings, enabled: Boolean(session.data?.capabilities.mutateRecords) });
  const activeTask = useMemo(() => day.data?.tasks.find((item) => item.id === activeTaskId), [activeTaskId, day.data?.tasks]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["day", date] }),
      queryClient.invalidateQueries({ queryKey: ["timeline"] }),
    ]);
  };
  const routine = useMutation({
    mutationFn: async () => {
      if (!day.data || !activeTask) throw new Error("Choose a routine.");
      const request = recordingRequestForTask({ date, timeZone, task: activeTask, status, localTime, caregiverIds });
      if (request.kind === "special_arrangement") {
        return api.createCareRecord(request.input, day.data.dayVersion);
      }
      return api.recordRoutine(date, request.input, day.data.dayVersion);
    },
    onSuccess: async () => {
      setActiveTaskId(undefined);
      await refresh();
    },
  });
  const custom = useMutation({
    mutationFn: (input: unknown) => api.createCareRecord(input, day.data!.dayVersion),
    onSuccess: async () => {
      setCustomOpen(false);
      await refresh();
    },
  });
  const saveNotes = useMutation({ mutationFn: () => api.updateDayNotes(date, noteDrafts[date] ?? day.data?.notes ?? "", day.data!.dayVersion), onSuccess: refresh });
  const finalize = useMutation({ mutationFn: () => api.finalizeDay(date, day.data!.dayVersion), onSuccess: refresh });
  const canEdit = Boolean(session.data?.capabilities.mutateRecords && day.data?.status === "open");
  const historical = date < today;

  const navigateToDate = (nextDate: string) => {
    if (nextDate > today) return;
    setActiveTaskId(undefined);
    setCustomOpen(false);
    setDate(nextDate);
  };
  const openTask = (taskId: string) => {
    const task = day.data?.tasks.find((item) => item.id === taskId);
    if (!task) return;
    routine.reset();
    setStatus("completed");
    setLocalTime(task.suggestedTime);
    setCaregiverIds(task.plannedCaregiverIds);
    setActiveTaskId(taskId);
  };
  const childNames = (ids: string[]) => ids
    .map((id) => settings.data?.children.find((child) => child.id === id)?.displayName)
    .filter(Boolean)
    .join(" & ");

  if (isReviewer) return <Redirect href="/(app)/timeline" />;

  const title = formatLocalDate(date).replace(/, \d{4}$/, "");
  return (
    <Screen eyebrow="Daily care log" title={title} subtitle={`A clear, factual view of ${historical ? "care on this day" : "today’s care"} for your children.`}>
      <View style={styles.headingActions}>
        <ActionButton compact icon="calendar-number-outline" label="Special days" secondary onPress={() => router.push("/(app)/special-days")} />
        {canEdit ? <ActionButton compact icon="add" label="Add record" onPress={() => { custom.reset(); setCustomOpen(true); }} /> : null}
      </View>

      <Card>
        <View accessibilityLabel="Choose log date" style={styles.dateControls}>
          <IconButton icon="chevron-back" label="Previous day" onPress={() => navigateToDate(shiftDate(date, -1))} />
          <Pressable accessibilityLabel="Return to today" accessibilityRole="button" onPress={() => navigateToDate(today)} style={({ pressed }) => [styles.dateValue, pressed && styles.pressed]}>
            <Ionicons color={colors.primary} name="calendar-outline" size={18} />
            <Text numberOfLines={1} style={styles.dateText}>{date}</Text>
          </Pressable>
          <IconButton disabled={date >= today} icon="chevron-forward" label="Next day" onPress={() => navigateToDate(shiftDate(date, 1))} />
        </View>
        {historical ? <ActionButton compact label="Return to today" secondary onPress={() => navigateToDate(today)} /> : <Body muted>Select an earlier date to add a contemporaneously labeled past entry.</Body>}
      </Card>

      {historical ? <InlineNotice>Records added after the following calendar day retain a visible late-entry label.</InlineNotice> : null}
      <ScreenState loading={day.isPending} error={day.error} onRetry={() => void day.refetch()} />

      {day.data ? <>
        {day.data.status === "finalized" ? <InlineNotice tone="info">This day is finalized and read-only. Existing records retain their correction history.</InlineNotice> : null}

        {day.data.specialArrangement ? (
          <Card accent>
            <View style={styles.cardTitleRow}>
              <Ionicons color={colors.primary} name="calendar-number-outline" size={20} />
              <Text style={styles.accentLabel}>Special arrangement</Text>
            </View>
            <Heading>{day.data.specialArrangement.title}</Heading>
            {day.data.specialArrangement.note ? <Body muted>{day.data.specialArrangement.note}</Body> : null}
            <Body muted>This is planned context. Saved care records describe what actually occurred.</Body>
          </Card>
        ) : null}

        <View style={styles.summaryGrid}>
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.progressLabel}>{day.data.specialArrangement ? "Special-day progress" : "Routine progress"}</Text>
                <Text style={styles.progressPercent}>{day.data.completion.percent}%</Text>
              </View>
              <View style={styles.progressIcon}><Ionicons color={colors.primaryForeground} name="checkmark-circle-outline" size={27} /></View>
            </View>
            <ProgressBar value={day.data.completion.percent} />
            <Text style={styles.progressCopy}>{day.data.completion.recorded} of {day.data.completion.total} planned item{day.data.completion.total === 1 ? "" : "s"} recorded</Text>
          </View>
          <Card>
            <View style={styles.familyRow}>
              <View style={styles.familyIcon}><Ionicons color={colors.primary} name="people-outline" size={22} /></View>
              <View style={styles.familyCopy}>
                <Text numberOfLines={1} style={styles.familyNames}>{settings.data?.children.map((child) => child.displayName).join(" & ") || "Your family"}</Text>
                <Body muted>{settings.data?.caregivers.length ?? 0} caregiver{settings.data?.caregivers.length === 1 ? "" : "s"} configured</Body>
              </View>
            </View>
            <View style={styles.statusRow}><Body muted>Day status</Body><Badge>{day.data.status}</Badge></View>
          </Card>
        </View>

        <View style={styles.sectionHeading}>
          <Heading>{day.data.specialArrangement ? "Today’s special-day plan" : "Today’s routine"}</Heading>
          <Body muted>Tap an item to record it or view its details.</Body>
        </View>

        <View style={styles.taskList}>
          {day.data.tasks.map((task) => {
            const entry = day.data.careEntries.find((item) => item.id === task.entryId);
            const recorded = Boolean(task.recorded && entry);
            const completed = entry?.status === "completed";
            const taskSubtitle = recorded && entry
              ? `${childNames(entry.childIds) || "Care record"} · ${entry.status.replace("_", " ")}`
              : `${childNames(task.childIds) || "Planned care"} · around ${task.suggestedTime}`;
            return (
              <Pressable
                accessibilityLabel={`${recorded ? "View" : "Record"} ${task.label}`}
                accessibilityRole="button"
                disabled={!recorded && !canEdit}
                key={task.id}
                onPress={() => recorded && entry
                  ? router.push({ pathname: "/records/[recordType]/[id]", params: { recordType: "care_entry", id: entry.id, localDate: date } })
                  : openTask(task.id)}
                style={({ pressed }) => [styles.taskCard, pressed && styles.taskCardPressed, !recorded && !canEdit && styles.taskCardDisabled]}
              >
                <View style={[styles.taskIcon, completed && styles.taskIconComplete]}>
                  <Ionicons color={completed ? colors.primaryForeground : colors.primary} name={recorded ? "checkmark" : "time-outline"} size={22} />
                </View>
                <View style={styles.taskCopy}>
                  <View style={styles.taskTitleRow}>
                    <Text numberOfLines={1} style={styles.taskTitle}>{task.label}</Text>
                    {entry ? <Badge danger={entry.status === "missed"}>{entry.status.replace("_", " ")}</Badge> : null}
                  </View>
                  <Text numberOfLines={1} style={styles.taskSubtitle}>{taskSubtitle}</Text>
                </View>
                <Ionicons color={colors.muted} name="chevron-forward" size={18} />
              </Pressable>
            );
          })}
        </View>

        <Card>
          <Heading>Day notes</Heading>
          <Body muted>{day.data.status === "finalized" ? "These notes were locked when the day was finalized." : "Add factual context that applies to the day as a whole."}</Body>
          <Field label="Notes (optional)" value={noteDrafts[date] ?? day.data.notes ?? ""} onChangeText={(value) => setNoteDrafts((drafts) => ({ ...drafts, [date]: value }))} multiline />
          {saveNotes.error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{friendlyError(saveNotes.error)}</Text> : null}
          {canEdit ? <ActionButton compact label={saveNotes.isPending ? "Saving…" : "Save notes"} disabled={saveNotes.isPending || (noteDrafts[date] ?? day.data.notes ?? "") === (day.data.notes ?? "")} onPress={() => saveNotes.mutate()} /> : null}
        </Card>

        {session.data?.capabilities.finalizeDays && day.data.status === "open" ? (
          <Card dashed>
            <View style={styles.finalizeRow}>
              <View style={styles.finalizeIcon}><Ionicons color={colors.primary} name="lock-closed-outline" size={21} /></View>
              <View style={styles.finalizeCopy}><Heading>Ready to close the day?</Heading><Body muted>Finalizing locks this routine snapshot. Corrections remain available.</Body></View>
            </View>
            {finalize.error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{friendlyError(finalize.error)}</Text> : null}
            <ActionButton icon="lock-closed-outline" label={finalize.isPending ? "Finalizing…" : "Finalize day"} secondary disabled={finalize.isPending} onPress={() => Alert.alert("Finalize this day?", "Records become read-only. Corrections remain available.", [{ text: "Cancel", style: "cancel" }, { text: "Finalize", style: "destructive", onPress: () => finalize.mutate() }])} />
          </Card>
        ) : null}
      </> : null}

      <FormSheet title={activeTask?.label ?? "Record care"} visible={Boolean(activeTask)} onClose={() => setActiveTaskId(undefined)}>
        {activeTask ? <>
          <Body muted>{formatLocalDate(date)} · planned around {activeTask.suggestedTime}</Body>
          <Heading>Status</Heading>
          {(["completed", "partial", "missed", "not_applicable"] as const).map((value) => <ChoiceRow key={value} label={value.replace("_", " ")} selected={status === value} onPress={() => setStatus(value)} />)}
          {(status === "completed" || status === "partial") ? <Field label="Actual local time (HH:mm)" value={localTime} onChangeText={setLocalTime} /> : null}
          {(status === "completed" || status === "partial") ? <><Heading>Caregivers</Heading>{settings.data?.caregivers.filter((item) => item.active).map((caregiver) => <ChoiceRow key={caregiver.id} label={caregiver.displayName} selected={caregiverIds.includes(caregiver.id)} onPress={() => setCaregiverIds((selected) => selected.includes(caregiver.id) ? selected.filter((id) => id !== caregiver.id) : [...selected, caregiver.id])} />)}</> : null}
          {routine.error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{friendlyError(routine.error)}</Text> : null}
          <ActionButton label={routine.isPending ? "Saving…" : "Save care record"} disabled={routine.isPending || ((status === "completed" || status === "partial") && caregiverIds.length === 0)} onPress={() => routine.mutate()} />
          <ActionButton label="Cancel" secondary onPress={() => setActiveTaskId(undefined)} />
        </> : null}
      </FormSheet>

      <FormSheet title="Add care record" visible={customOpen} onClose={() => setCustomOpen(false)}>
        {day.data && settings.data ? <CustomCareForm key={date} date={date} timeZone={timeZone} childOptions={settings.data.children.filter((child) => child.active)} caregivers={settings.data.caregivers.filter((caregiver) => caregiver.active)} pending={custom.isPending} onSubmit={(value) => custom.mutate(value)} /> : <ScreenState loading={settings.isPending} error={settings.error} onRetry={() => void settings.refetch()} />}
        {custom.error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{friendlyError(custom.error)}</Text> : null}
      </FormSheet>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  pressed: { opacity: 0.62 },
  headingActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  dateControls: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  dateValue: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 46, minWidth: 0 },
  dateText: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  cardTitleRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  accentLabel: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  summaryGrid: { gap: 12 },
  progressCard: { backgroundColor: colors.primary, borderRadius: 20, gap: spacing.md, padding: 22, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 16 },
  progressHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: colors.primaryMutedForeground, fontSize: 14 },
  progressPercent: { color: colors.primaryForeground, fontFamily: "Georgia", fontSize: 40, fontWeight: "700", marginTop: 3 },
  progressIcon: { alignItems: "center", backgroundColor: colors.primaryIconSurface, borderRadius: 16, height: 50, justifyContent: "center", width: 50 },
  progressCopy: { color: colors.primaryMutedForeground, fontSize: 14 },
  familyRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  familyIcon: { alignItems: "center", backgroundColor: colors.secondary, borderRadius: 13, height: 44, justifyContent: "center", width: 44 },
  familyCopy: { flex: 1, minWidth: 0 },
  familyNames: { color: colors.ink, fontSize: 16, fontWeight: "700", marginBottom: 2 },
  statusRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: 12 },
  sectionHeading: { gap: 3, marginTop: spacing.xs },
  taskList: { gap: 10 },
  taskCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 76, padding: 13, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 7 },
  taskCardPressed: { borderColor: colors.brandSoft, opacity: 0.7, transform: [{ scale: 0.995 }] },
  taskCardDisabled: { opacity: 0.58 },
  taskIcon: { alignItems: "center", backgroundColor: colors.secondary, borderRadius: 15, height: 46, justifyContent: "center", width: 46 },
  taskIconComplete: { backgroundColor: colors.primary },
  taskCopy: { flex: 1, minWidth: 0 },
  taskTitleRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  taskTitle: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: "700" },
  taskSubtitle: { color: colors.muted, fontSize: 12.5, marginTop: 5 },
  finalizeRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  finalizeIcon: { alignItems: "center", backgroundColor: colors.mutedSurface, borderRadius: 13, height: 44, justifyContent: "center", width: 44 },
  finalizeCopy: { flex: 1, gap: 3 },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  sheetSafeArea: { backgroundColor: colors.canvas, flex: 1 },
  sheetHeader: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 64, paddingHorizontal: spacing.md },
  sheetTitle: { color: colors.ink, flex: 1, fontFamily: "Georgia", fontSize: 23, fontWeight: "700" },
  sheetContent: { gap: 14, padding: spacing.md, paddingBottom: spacing.xl },
});
