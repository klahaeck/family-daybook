import type {
  Appointment,
  CareEntry,
  Incident,
  RecordBundle,
} from "@family-daybook/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
  ActionButton,
  Body,
  Card,
  ChoiceRow,
  Field,
  Heading,
  InlineNotice,
  Screen,
  ScreenState,
} from "@/components/ui";
import { attachmentContentType, documentPickerTypes } from "@/attachment-picker";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError } from "@/utils";

type RecordType = "care_entry" | "appointment" | "incident";
type Attachment = RecordBundle["attachments"][number];
type CareStatus = CareEntry["status"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isRecordType(value: string | undefined): value is RecordType {
  return value === "care_entry" || value === "appointment" || value === "incident";
}

function isCareEntry(record: RecordBundle["record"]): record is CareEntry {
  return "dailyLogId" in record;
}

function isAppointment(record: RecordBundle["record"]): record is Appointment {
  return "scheduledAt" in record;
}

function isIncident(record: RecordBundle["record"]): record is Incident {
  return "observations" in record;
}

function localDateFor(occurredAt: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(occurredAt));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "attachment";
}

function DetailSummary({ record }: { record: RecordBundle["record"] }) {
  if (isCareEntry(record)) {
    return (
      <Card>
        <Heading>{record.taskLabel}</Heading>
        <Body>{new Date(record.occurredAt).toLocaleString()}</Body>
        <Body muted>{record.status.replace("_", " ")}{record.lateEntry ? " · late entry" : ""}</Body>
        {record.activityType ? <Body>{record.activityType}</Body> : null}
        {record.durationMinutes ? <Body>{record.durationMinutes} minutes</Body> : null}
        {record.notes ? <Body>{record.notes}</Body> : null}
      </Card>
    );
  }
  if (isAppointment(record)) {
    return (
      <Card>
        <Heading>{record.title}</Heading>
        <Body>{new Date(record.scheduledAt).toLocaleString()}</Body>
        <Body muted>{record.status.replace("_", " ")}{record.provider ? ` · ${record.provider}` : ""}</Body>
        {record.location ? <Body>{record.location}</Body> : null}
        {record.arrivedAt ? <Body>Arrived {new Date(record.arrivedAt).toLocaleString()}</Body> : null}
        {record.cancellationDetails ? <Body>Cancellation/rescheduling: {record.cancellationDetails}</Body> : null}
        {record.notes ? <Body>{record.notes}</Body> : null}
      </Card>
    );
  }
  return (
    <Card>
      <Heading>{record.category.replace("_", " ")}</Heading>
      <Body>{new Date(record.occurredAt).toLocaleString()}</Body>
      <Body>{record.observations}</Body>
      {record.location ? <Body muted>{record.location}</Body> : null}
      {record.immediateActions ? <Body>Immediate actions: {record.immediateActions}</Body> : null}
      {record.outcome ? <Body>Outcome: {record.outcome}</Body> : null}
    </Card>
  );
}

function CareEditor({ bundle, finalized, localDate }: {
  bundle: RecordBundle;
  finalized: boolean;
  localDate: string;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const record = bundle.record as CareEntry;
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const [childIds, setChildIds] = useState(record.childIds);
  const [caregiverIds, setCaregiverIds] = useState(record.caregiverIds);
  const [status, setStatus] = useState<CareStatus>(record.status);
  const [occurredAt, setOccurredAt] = useState(record.occurredAt);
  const [durationMinutes, setDurationMinutes] = useState(record.durationMinutes?.toString() ?? "");
  const [activityType, setActivityType] = useState(record.activityType ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const providedCare = status === "completed" || status === "partial";
      const parsedDuration = durationMinutes.trim() ? Number(durationMinutes) : undefined;
      const input = {
        childIds,
        caregiverIds: providedCare ? caregiverIds : [],
        status,
        occurredAt,
        durationMinutes: providedCare ? parsedDuration : undefined,
        activityType: providedCare && activityType.trim() ? activityType : undefined,
        notes: notes.trim() ? notes : undefined,
      };
      if (finalized) {
        return api.correctCareRecord(record.id, { ...input, reason }, bundle.recordVersion);
      }
      return api.updateCareRecord(record.id, input, bundle.recordVersion);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["record", "care_entry", record.id] }),
        queryClient.invalidateQueries({ queryKey: ["day", localDate] }),
        queryClient.invalidateQueries({ queryKey: ["timeline"] }),
      ]);
    },
  });
  const providedCare = status === "completed" || status === "partial";

  return (
    <Card>
      <Heading>{finalized ? "Correct finalized entry" : "Update entry"}</Heading>
      {finalized ? <InlineNotice>Corrections preserve the original revision and add a reasoned revision.</InlineNotice> : null}
      <Heading>Children</Heading>
      <ScreenState loading={settings.isPending} error={settings.error} onRetry={() => void settings.refetch()} />
      {settings.data?.children.map((child) => (
        <ChoiceRow
          key={child.id}
          label={child.displayName}
          selected={childIds.includes(child.id)}
          onPress={() => setChildIds((current) => current.includes(child.id) ? current.filter((id) => id !== child.id) : [...current, child.id])}
        />
      ))}
      <Heading>Status</Heading>
      {(["completed", "partial", "missed", "not_applicable"] as const).map((value) => (
        <ChoiceRow
          key={value}
          label={value.replace("_", " ")}
          selected={status === value}
          onPress={() => {
            setStatus(value);
            if (value === "missed" || value === "not_applicable") setCaregiverIds([]);
          }}
        />
      ))}
      {providedCare ? <>
        <Heading>Caregivers</Heading>
        {settings.data?.caregivers.map((caregiver) => (
          <ChoiceRow
            key={caregiver.id}
            label={`${caregiver.displayName} · ${caregiver.relationship}`}
            selected={caregiverIds.includes(caregiver.id)}
            onPress={() => setCaregiverIds((current) => current.includes(caregiver.id) ? current.filter((id) => id !== caregiver.id) : [...current, caregiver.id])}
          />
        ))}
      </> : null}
      <Field label="Occurred at (ISO 8601)" value={occurredAt} onChangeText={setOccurredAt} autoCapitalize="none" />
      {providedCare ? <>
        <Field label="Duration in minutes (optional)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
        <Field label="Activity type (optional)" value={activityType} onChangeText={setActivityType} />
      </> : null}
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      {finalized ? <Field label="Correction reason" value={reason} onChangeText={setReason} multiline /> : null}
      {save.error ? <Text style={{ color: colors.danger }}>{friendlyError(save.error)}</Text> : null}
      <ActionButton
        label={save.isPending ? "Saving…" : finalized ? "Add correction" : "Save changes"}
        disabled={save.isPending || childIds.length === 0 || (providedCare && caregiverIds.length === 0) || (finalized && reason.trim().length < 5)}
        onPress={() => save.mutate()}
      />
    </Card>
  );
}

function TextCorrection({ bundle, recordType }: { bundle: RecordBundle; recordType: "appointment" | "incident" }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const record = bundle.record;
  const originalText = isIncident(record) ? record.observations : isAppointment(record) ? record.notes ?? "" : "";
  const [correctedText, setCorrectedText] = useState(originalText);
  const [reason, setReason] = useState("");
  const correct = useMutation({
    mutationFn: () => api.correctRecord({ recordType, recordId: record.id, correctedText, reason }, bundle.recordVersion),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["record", recordType, record.id] }),
        queryClient.invalidateQueries({ queryKey: [recordType === "appointment" ? "appointments" : "incidents"] }),
        queryClient.invalidateQueries({ queryKey: ["timeline"] }),
      ]);
    },
  });
  return (
    <Card>
      <Heading>{recordType === "appointment" ? "Correct appointment notes" : "Add correction"}</Heading>
      <InlineNotice>{recordType === "appointment" ? "This correction updates the appointment notes. Arrival and cancellation details remain visible in the retained revision history." : "Corrections preserve the original revision and record your reason."}</InlineNotice>
      <Field label={recordType === "incident" ? "Corrected observations" : "Corrected notes"} value={correctedText} onChangeText={setCorrectedText} multiline />
      <Field label="Correction reason" value={reason} onChangeText={setReason} multiline />
      {correct.error ? <Text style={{ color: colors.danger }}>{friendlyError(correct.error)}</Text> : null}
      <ActionButton label={correct.isPending ? "Saving…" : "Add correction"} disabled={correct.isPending || correctedText.trim().length === 0 || reason.trim().length < 5} onPress={() => correct.mutate()} />
    </Card>
  );
}

function RevisionHistory({ revisions }: { revisions: RecordBundle["revisions"] }) {
  return (
    <Card>
      <Heading>Revision history</Heading>
      {revisions.map((revision) => (
        <View key={revision.id} style={{ gap: 4 }}>
          <Body>Revision {revision.revisionNumber} · {revision.reason}</Body>
          <Body muted>{new Date(revision.recordedAt).toLocaleString()} · {revision.hash.slice(0, 12)}…</Body>
          <Body muted>{JSON.stringify(revision.payload, null, 2)}</Body>
        </View>
      ))}
    </Card>
  );
}

function Attachments({ attachments, recordType, recordId, canUpload }: {
  attachments: Attachment[];
  recordType: RecordType;
  recordId: string;
  canUpload: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const share = useMutation({
    mutationFn: async (attachment: Attachment) => {
      const file = new File(Paths.cache, `${attachment.id}-${safeFilename(attachment.originalName)}`);
      if (file.exists) file.delete();
      file.create({ intermediates: true });
      file.write(await api.downloadAttachment(attachment.id));
      if (!await Sharing.isAvailableAsync()) throw new Error("Sharing is not available on this device.");
      try {
        await Sharing.shareAsync(file.uri, { dialogTitle: `Share ${attachment.originalName}`, mimeType: attachment.contentType });
      } finally {
        if (file.exists) file.delete();
      }
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: documentPickerTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return undefined;
      const asset = picked.assets[0];
      const contentType = attachmentContentType(asset.name, asset.mimeType);
      if (!contentType) throw new Error("Choose a PDF, JPEG, PNG, HEIC, MP4, MOV, or WebM file.");
      const file = new File(asset.uri);
      const size = asset.size ?? file.size;
      if (!Number.isInteger(size) || size <= 0) throw new Error("The selected file is empty or unavailable.");
      return api.uploadAttachment({
        recordType,
        recordId,
        originalName: asset.name,
        declaredContentType: contentType,
        declaredSize: size,
      }, await file.bytes());
    },
    onSuccess: async (attachment) => {
      if (attachment) await queryClient.invalidateQueries({ queryKey: ["record", recordType, recordId] });
    },
  });
  return (
    <Card>
      <Heading>Attachments</Heading>
      {attachments.length === 0 ? <Body muted>No attachments.</Body> : attachments.map((attachment) => (
        <View key={attachment.id} style={{ gap: 8 }}>
          <Body>{attachment.originalName}</Body>
          <Body muted>{attachment.contentType} · {Math.max(1, Math.round(attachment.size / 1024))} KB</Body>
          <ActionButton label={share.isPending && share.variables?.id === attachment.id ? "Preparing…" : "Download or share"} secondary disabled={share.isPending} onPress={() => share.mutate(attachment)} />
        </View>
      ))}
      {share.error ? <Text style={{ color: colors.danger }}>{friendlyError(share.error)}</Text> : null}
      {canUpload ? <>
        <Body muted>Add up to five supported documents, images, or videos. File limits are checked before storage.</Body>
        <ActionButton
          label={upload.isPending ? "Uploading…" : "Add attachment"}
          secondary
          disabled={upload.isPending || attachments.length >= 5}
          onPress={() => upload.mutate()}
        />
      </> : null}
      {upload.error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{friendlyError(upload.error)}</Text> : null}
    </Card>
  );
}

function PurgeRecord({ recordType, recordId }: { recordType: RecordType; recordId: string }) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const purge = useMutation({
    mutationFn: () => api.purgeRecord({ recordType, recordId, reason, confirmation }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["timeline"] }),
        queryClient.invalidateQueries({ queryKey: [recordType === "appointment" ? "appointments" : recordType === "incident" ? "incidents" : "day"] }),
      ]);
      router.replace("/timeline");
    },
  });
  const confirmPurge = () => Alert.alert(
    "Permanently delete this record?",
    "The record, revisions, and attachments will be deleted. An audit tombstone remains.",
    [{ text: "Cancel", style: "cancel" }, { text: "Delete permanently", style: "destructive", onPress: () => purge.mutate() }],
  );
  return (
    <Card>
      <Heading>Permanent deletion</Heading>
      <Body muted>This action cannot be undone.</Body>
      <Field label="Deletion reason" value={reason} onChangeText={setReason} multiline />
      <Field label='Type "PERMANENTLY DELETE"' value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      {purge.error ? <Text style={{ color: colors.danger }}>{friendlyError(purge.error)}</Text> : null}
      <ActionButton label={purge.isPending ? "Deleting…" : "Permanently delete"} danger disabled={purge.isPending || reason.trim().length < 10 || confirmation !== "PERMANENTLY DELETE"} onPress={confirmPurge} />
    </Card>
  );
}

export default function RecordDetailScreen() {
  const params = useLocalSearchParams<{ recordType?: string | string[]; id?: string | string[]; localDate?: string | string[] }>();
  const recordTypeValue = first(params.recordType);
  const id = first(params.id);
  const hintedLocalDate = first(params.localDate);
  const recordType = isRecordType(recordTypeValue) ? recordTypeValue : undefined;
  const api = useApi();
  const session = useDaybookSession();
  const bundle = useQuery({
    queryKey: ["record", recordType, id],
    queryFn: () => api.getRecordBundle(recordType!, id!),
    enabled: Boolean(recordType && id),
  });
  const recordLocalDate = useMemo(() => {
    if (hintedLocalDate) return hintedLocalDate;
    if (bundle.data && isCareEntry(bundle.data.record) && session.data) {
      return localDateFor(bundle.data.record.occurredAt, session.data.workspace.timezone);
    }
    return undefined;
  }, [bundle.data, hintedLocalDate, session.data]);
  const day = useQuery({
    queryKey: ["day", recordLocalDate],
    queryFn: () => api.getDay(recordLocalDate!),
    enabled: recordType === "care_entry" && Boolean(recordLocalDate && session.data?.capabilities.readOpenDays),
  });

  if (!recordType || !id) {
    return <Screen title="Record"><InlineNotice>This record link is invalid.</InlineNotice></Screen>;
  }
  const title = recordType === "care_entry" ? "Care record" : recordType === "appointment" ? "Appointment" : "Incident";
  const canMutate = Boolean(session.data?.capabilities.mutateRecords);

  return (
    <Screen title={title} subtitle="Review the current record, its immutable history, and supporting files.">
      <ScreenState loading={bundle.isPending} error={bundle.error} onRetry={() => void bundle.refetch()} />
      {bundle.data ? <>
        <DetailSummary record={bundle.data.record} />
        {recordType === "care_entry" && canMutate ? (
          <>
            <ScreenState loading={day.isPending} error={day.error} onRetry={() => void day.refetch()} />
            {day.data && recordLocalDate ? <CareEditor key={bundle.data.recordVersion} bundle={bundle.data} finalized={day.data.status === "finalized"} localDate={recordLocalDate} /> : null}
          </>
        ) : null}
        {(recordType === "appointment" || recordType === "incident") && canMutate ? <TextCorrection key={bundle.data.recordVersion} bundle={bundle.data} recordType={recordType} /> : null}
        <RevisionHistory revisions={bundle.data.revisions} />
        <Attachments attachments={bundle.data.attachments} recordType={recordType} recordId={id} canUpload={canMutate} />
        {session.data?.capabilities.hardPurge ? <PurgeRecord recordType={recordType} recordId={id} /> : null}
      </> : null}
    </Screen>
  );
}
