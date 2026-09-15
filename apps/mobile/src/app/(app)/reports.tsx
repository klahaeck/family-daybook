import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";

import { ActionButton, Body, Card, ChoiceRow, Field, Heading, Screen, ScreenState } from "@/components/ui";
import { useApi, useDaybookSession } from "@/providers";
import { colors } from "@/theme";
import { friendlyError, shiftDate, todayLocalDate } from "@/utils";

export default function ReportsScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useDaybookSession();
  const reports = useQuery({ queryKey: ["reports"], queryFn: api.listReports, refetchInterval: (query) => query.state.data?.some((item) => item.status === "pending") ? 3000 : false });
  const today = session.data?.currentLocalDate ?? todayLocalDate();
  const [from, setFrom] = useState(shiftDate(today, -7));
  const [to, setTo] = useState(today);
  const [includeCare, setIncludeCare] = useState(true);
  const [includeAppointments, setIncludeAppointments] = useState(true);
  const [includeIncidents, setIncludeIncidents] = useState(true);
  const create = useMutation({ mutationFn: () => api.createReport({ from, to, childIds: [], includeCare, includeAppointments, includeIncidents }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["reports"] }); } });
  const share = useMutation({ mutationFn: async ({ id, format }: { id: string; format: "pdf" | "zip" }) => {
    const file = new File(Paths.cache, `family-daybook-${id}.${format}`);
    if (file.exists) file.delete();
    file.create({ intermediates: true });
    file.write(await api.downloadReport(id, format));
    if (!await Sharing.isAvailableAsync()) throw new Error("Sharing is not available on this device.");
    try { await Sharing.shareAsync(file.uri, { dialogTitle: "Share Family Daybook report", mimeType: format === "pdf" ? "application/pdf" : "application/zip" }); }
    finally { if (file.exists) file.delete(); }
  } });
  return (
    <Screen title="Reports" subtitle="Generate fixed snapshots for a date range, then download or share them.">
      {session.data?.capabilities.mutateRecords ? <Card>
        <Heading>New report</Heading>
        <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} autoCapitalize="none" />
        <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} autoCapitalize="none" />
        <ChoiceRow label="Care records" selected={includeCare} onPress={() => setIncludeCare(!includeCare)} />
        <ChoiceRow label="Appointments" selected={includeAppointments} onPress={() => setIncludeAppointments(!includeAppointments)} />
        <ChoiceRow label="Incidents" selected={includeIncidents} onPress={() => setIncludeIncidents(!includeIncidents)} />
        {create.error ? <Text style={{ color: colors.danger }}>{friendlyError(create.error)}</Text> : null}
        <ActionButton label={create.isPending ? "Starting…" : "Generate report"} disabled={create.isPending} onPress={() => create.mutate()} />
      </Card> : null}
      <ScreenState loading={reports.isPending} error={reports.error} onRetry={() => void reports.refetch()} empty={reports.data?.length === 0 ? "No reports generated." : undefined} />
      {reports.data?.map((report) => <Card key={report.id}>
        <Heading>{report.filters.from} – {report.filters.to}</Heading>
        <Body muted>{report.status}</Body>
        {report.error ? <Text style={{ color: colors.danger }}>{report.error}</Text> : null}
        {report.status === "ready" ? <View style={{ gap: 8 }}><ActionButton label="Share PDF" secondary onPress={() => share.mutate({ id: report.id, format: "pdf" })} /><ActionButton label="Share archive" secondary onPress={() => share.mutate({ id: report.id, format: "zip" })} /></View> : null}
      </Card>)}
      {share.error ? <Text style={{ color: colors.danger }}>{friendlyError(share.error)}</Text> : null}
    </Screen>
  );
}
