import ExcelJS from "exceljs";
import JSZip from "jszip";
import { formatDateTime } from "@/lib/domain/dates";
import type { ReportSource } from "@/lib/repository/repository";
import { reportChildren, reportEvents, reportLocalDate, reportNames, type ReportEvent } from "./report-data";

export const REPORT_WORKBOOK_NAME = "daily-log.xlsx";

const detailColumns = [
  "notes", "durationMinutes", "activityType", "lateEntry", "provider", "location",
  "arrivedAt", "cancellationDetails", "category", "discoveredAt", "peoplePresent",
  "witnesses", "observations", "exactQuotes", "immediateActions", "outcome",
  "note", "tasks", "taskKey",
];

function detailValue(value: unknown): string | number | boolean {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function eventRow(source: ReportSource, event: ReportEvent) {
  return [
    reportLocalDate(event.at, source.workspace.timezone),
    event.at.length === 10 ? "Planned date only" : formatDateTime(event.at, source.workspace.timezone),
    event.at, event.type, event.title,
    reportNames(event.childIds, source.children),
    reportNames(event.caregiverIds, source.caregivers),
    event.status, event.recordedAt,
    ...detailColumns.map((key) => detailValue(event.details[key])),
  ];
}

function sheetName(name: string, used: Set<string>) {
  const base = name.replace(/[\\/*?:\[\]\x00-\x1f']/g, " ").trim() || "Child";
  let candidate = base.slice(0, 31);
  for (let index = 2; used.has(candidate.toLowerCase()); index++) {
    const suffix = ` (${index})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function generateReportWorkbook(source: ReportSource): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Family Daybook";
  workbook.created = new Date(source.snapshot.createdAt);
  workbook.modified = new Date(source.snapshot.createdAt);
  const guide = workbook.addWorksheet("Read Me");
  guide.columns = [{ width: 26 }, { width: 110 }];
  guide.addRows([
    ["Daily log detail", source.workspace.name],
    ["Report ID", source.snapshot.id],
    ["Date range", `${source.snapshot.filters.from} through ${source.snapshot.filters.to}`],
    ["Timezone", source.workspace.timezone],
    ["All Events", "Each captured record appears once. Filter the Children column to review children together."],
    ["Child tabs", "The same events filtered per child. Shared events repeat across tabs; do not add tab totals together."],
    ["Finalized daily logs", "Routine items and special days come only from finalized daily logs. Appointments and incidents retain the existing date and child filters."],
    ["Special days", "Plans and assigned responsibilities only; they do not establish that care occurred. Excluded from event chart totals."],
    ["Filters", JSON.stringify(source.snapshot.filters)],
    ["Timestamps", "Local date/time is shown alongside the original timestamp. Recorded At preserves when information was entered."],
    ["Long details", "Values exceeding Excel's cell text limit continue in adjacent columns. Join the original and continued columns in order to reconstruct the complete value."],
    ["Evidence", "Original attachments, revision metadata, and checksums are included in the surrounding evidence ZIP."],
  ]);
  guide.getColumn(1).alignment = { vertical: "top" };
  guide.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  guide.eachRow((row) => { row.height = 44; });

  const events = reportEvents(source);
  const used = new Set(["read me", "all events", "history"]);
  const sheets = [
    { name: "All Events", events },
    ...reportChildren(source).map((child) => ({
      name: sheetName(child.displayName, used),
      events: events.filter((event) => event.childIds.includes(child.id)),
    })),
  ];
  const headers = [
    "Local Date", `Local Date/Time (${source.workspace.timezone})`, "Original Timestamp",
    "Event Type", "Event", "Children", "Caregivers / Assigned",
    "Status", "Recorded At", ...detailColumns,
  ];
  const allRows = events.map((event) => eventRow(source, event));
  const cellLimit = 32_000;
  const widths = headers.map((_, index) => allRows.reduce((max, row) =>
    Math.max(max, typeof row[index] === "string" ? Math.ceil((row[index] as string).length / cellLimit) : 1), 1,
  ));
  const expandedHeaders = headers.flatMap((header, index) =>
    Array.from({ length: widths[index] }, (_, part) => part === 0 ? header : `${header} (continued ${part + 1})`),
  );
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
    worksheet.columns = expandedHeaders.map((header) => ({ header, width: header === "Event" || header === "Children" ? 30 : 24 }));
    for (const event of sheet.events) {
      // Plain string values, never formula objects, keep user-entered text inert in Excel.
      worksheet.addRow(eventRow(source, event).flatMap((value, index) =>
        Array.from({ length: widths[index] }, (_, part) =>
          typeof value === "string" ? value.slice(part * cellLimit, (part + 1) * cellLimit) : value,
        ),
      ));
    }
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, worksheet.rowCount), column: expandedHeaders.length } };
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173F35" } };
    worksheet.getRow(1).height = 30;
    worksheet.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
  }
  // ExcelJS timestamps ZIP members at write time; fix them for retry-stable hashes.
  const archive = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
  archive.forEach((_, file) => { file.date = new Date("2000-01-01T00:00:00Z"); });
  return archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
