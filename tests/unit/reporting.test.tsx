import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { renderToBuffer } from "@react-pdf/renderer";
import { reportEvents, summarizeReport } from "@/lib/reporting/report-data";
import { generateReportWorkbook } from "@/lib/reporting/report-workbook";
import { ReportDocument } from "@/lib/reporting/report-document";
import { reportAttachmentPath } from "@/lib/reporting/attachment-path";
import type { ReportSource } from "@/lib/repository/repository";

function source(): ReportSource {
  return {
    workspace: { id: "workspace", name: "Family", timezone: "America/Los_Angeles" },
    snapshot: { id: "report", createdAt: "2026-06-03T12:00:00Z", filters: {
      from: "2026-06-01", to: "2026-06-03", childIds: [], includeCare: true,
      includeAppointments: true, includeIncidents: true,
    } },
    children: [
      { id: "a", displayName: "All Events" }, { id: "b", displayName: "All Events" },
      { id: "c", displayName: "'/Invalid:[child]*?\\name/'" },
    ],
    caregivers: [{ id: "parent", displayName: "Parent" }],
    entries: [{
      id: "shared", currentRevisionId: "rev-1", childIds: ["a", "b"], caregiverIds: ["parent"],
      occurredAt: "2026-06-02T01:00:00Z", recordedAt: "2026-06-02T02:00:00Z",
      taskLabel: "Dinner", taskKey: "other", status: "completed", durationMinutes: 0,
      notes: '=HYPERLINK("bad")\nsecond line, quoted "text"', lateEntry: false,
    }, {
      id: "missed", currentRevisionId: "rev-2", childIds: ["a"], caregiverIds: [],
      occurredAt: "2026-06-03T12:00:00Z", recordedAt: "2026-06-03T12:00:00Z",
      taskLabel: "Breakfast", taskKey: "other", status: "missed",
    }],
    appointments: [{ id: "appt", currentRevisionId: "rev-3", childIds: ["b"], title: "Dentist",
      scheduledAt: "2026-06-02T18:00:00Z", recordedAt: "2026-06-01T12:00:00Z",
      responsibleCaregiverIds: ["parent"], status: "scheduled", provider: "Dentist", location: "Clinic" }],
    incidents: [{ id: "incident", currentRevisionId: "rev-4", childIds: ["a"], category: "other",
      occurredAt: "2026-06-03T15:00:00Z", recordedAt: "2026-06-03T16:00:00Z",
      observations: "Observed fact", peoplePresent: ["Parent"], witnesses: [], outcome: "Resolved" }],
    arrangements: [{ id: "plan", currentRevisionId: "rev-5", localDate: "2026-06-02", title: "Holiday",
      createdAt: "2026-06-01T12:00:00Z", status: "active", assignments: [{ childId: "a", caregiverIds: ["parent"] }],
      tasks: [{ id: "task", label: "Lunch" }] }],
    revisions: [], attachments: [],
  } as unknown as ReportSource;
}

async function workbook(input: ReportSource) {
  const result = new ExcelJS.Workbook();
  await result.xlsx.load(Buffer.from(await generateReportWorkbook(input)) as never);
  return result;
}

describe("report overview", () => {
  it("counts shared events once overall, once per child, and separates plans", () => {
    const summary = summarizeReport(source());
    expect(summary.totalEvents).toBe(4);
    expect(summary.children.map((child) => child.count)).toEqual([3, 2, 0]);
    expect(summary.trend.map((bucket) => bucket.count)).toEqual([1, 1, 2]);
    expect(summary.statuses.find((status) => status.label === "Missed")?.count).toBe(1);
    expect(reportEvents(source())).toHaveLength(5);
  });

  it("summarizes completed and partial care records once per caregiver, not per child", () => {
    const input = source();
    input.caregivers.push({ ...input.caregivers[0], id: "other", displayName: "Other caregiver" });
    input.entries[0].caregiverIds = ["parent", "other"];
    input.entries.push({ ...input.entries[0], id: "partial", status: "partial", taskLabel: "Lunch", caregiverIds: ["parent"] });
    const summary = summarizeReport(input);
    expect(summary.careRecordCount).toBe(2);
    expect(summary.caregivers).toEqual([
      { id: "parent", label: "Parent", count: 2, recordItems: [{ label: "Dinner", count: 1 }, { label: "Lunch", count: 1 }] },
      { id: "other", label: "Other caregiver", count: 1, recordItems: [{ label: "Dinner", count: 1 }] },
    ]);
    input.snapshot.filters.includeCare = false;
    expect(summarizeReport(input).caregivers.every((caregiver) => caregiver.count === 0)).toBe(true);
  });

  it("keeps local boundary events visible without changing snapshot membership", () => {
    const input = source();
    input.entries[0].occurredAt = "2026-06-01T01:00:00Z";
    const summary = summarizeReport(input);
    expect(summary.trend.find((bucket) => bucket.label === "2026-05-31 (local boundary)")?.count).toBe(1);
    expect(summary.trend.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(summary.totalEvents);
  });

  it("bounds trend buckets for long reports and preserves counts", () => {
    const input = source();
    input.snapshot.filters.to = "2027-06-01";
    const summary = summarizeReport(input);
    expect(summary.trend.length).toBeLessThanOrEqual(24);
    expect(summary.trend.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
  });

  it("honors selected children even when an event is shared", () => {
    const input = source();
    input.snapshot.filters.childIds = ["b"];
    expect(summarizeReport(input).children).toEqual([{ label: "All Events", count: 2 }]);
  });

  it("lists incident supporting files by their exact evidence ZIP paths", async () => {
    const input = source();
    input.attachments = [
      { id: "file-1", recordType: "incident", recordId: "incident", originalName: "photo 1.jpg" },
      { id: "file-2", recordType: "incident", recordId: "incident", originalName: "notes.pdf" },
      { id: "file-3", recordType: "care_entry", recordId: "shared", originalName: "unrelated.pdf" },
    ] as ReportSource["attachments"];
    expect(reportAttachmentPath(input.attachments[0])).toBe("attachments/file-1-photo_1.jpg");
    const pdf = await renderToBuffer(<ReportDocument source={input} />);
    const text = [...pdf.toString("latin1").matchAll(/stream\n([\s\S]*?)\nendstream/g)]
      .flatMap((match) => [...inflateSync(Buffer.from(match[1], "latin1")).toString("latin1").matchAll(/BT([\s\S]*?)ET/g)])
      .map((match) => [...match[1].matchAll(/<([0-9a-f]+)>/gi)]
        .map((segment) => Buffer.from(segment[1], "hex").toString("latin1")).join(""))
      .join("\n");
    expect(text).toContain("attachments/file-1-photo_1.jpg");
    expect(text).toContain("attachments/file-2-notes.pdf");
    expect(text).not.toContain("unrelated.pdf");
  });

  it("renders populated and empty overview PDFs", async () => {
    const input = source();
    const populated = await renderToBuffer(<ReportDocument source={input} />);
    expect(populated.subarray(0, 5).toString()).toBe("%PDF-");
    input.entries = []; input.appointments = []; input.incidents = []; input.arrangements = [];
    const empty = await renderToBuffer(<ReportDocument source={input} />);
    expect(empty.length).toBeGreaterThan(500);
  });
});

describe("report workbook", () => {
  it("keeps all events together and creates unique, safe child tabs with readable columns", async () => {
    const book = await workbook(source());
    expect(book.worksheets).toHaveLength(5);
    expect(new Set(book.worksheets.map((sheet) => sheet.name.toLowerCase())).size).toBe(5);
    expect(book.worksheets.every((sheet) => sheet.name.length <= 31 && !/[\\/*?:\[\]]/.test(sheet.name))).toBe(true);
    const guide = book.getWorksheet("Read Me")!;
    for (let row = 1; row <= guide.rowCount; row++) {
      expect(guide.getCell(row, 1).alignment.vertical).toBe("top");
    }
    const all = book.getWorksheet("All Events")!;
    expect(all.rowCount).toBe(6);
    expect(all.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(all.autoFilter).toBeTruthy();
    const omitted = ["Child IDs", "Caregiver IDs", "Event ID", "Revision ID", "dailyLogId", "templateItemId", "arrangementTaskId", "seriesId", "assignments", "createdBy", "updatedAt"];
    for (const sheet of book.worksheets.slice(1)) {
      const headers = sheet.getRow(1).values as string[];
      for (const header of omitted) expect(headers).not.toContain(header);
      expect(headers).toEqual(all.getRow(1).values);
    }
    const titles = (sheet: ExcelJS.Worksheet) => sheet.getColumn(5).values.slice(2);
    expect(titles(all).filter((title) => title === "Dinner")).toHaveLength(1);
    expect(titles(book.worksheets[2])).toContain("Dinner");
    expect(titles(book.worksheets[3])).toContain("Dinner");
    expect(book.worksheets[4].rowCount).toBe(1);
    const shared = all.getRows(2, 5)!.find((row) => row.getCell(5).value === "Dinner")!;
    const column = (header: string) => (all.getRow(1).values as string[]).indexOf(header);
    expect(shared.getCell(1).value).toBe("2026-06-01");
    expect(shared.getCell(column("notes")).value).toBe(source().entries[0].notes);
    expect(shared.getCell(column("notes")).type).toBe(ExcelJS.ValueType.String);
    expect(shared.getCell(column("durationMinutes")).value).toBe(0);
    expect(shared.getCell(column("lateEntry")).value).toBe(false);
  });

  it("preserves long special-day plans across continuation columns", async () => {
    const input = source();
    input.arrangements[0].tasks = Array.from({ length: 500 }, (_, index) => ({
      id: `task-${index}`, label: "A".repeat(100), childId: "a", taskKey: "custom", suggestedTime: "12:00", sortOrder: index,
    }));
    const book = await workbook(input);
    const sheet = book.getWorksheet("All Events")!;
    const headers = sheet.getRow(1).values as string[];
    const columns = headers.flatMap((header, index) => header === "tasks" || header.startsWith("tasks (continued") ? [index] : []);
    expect(columns.length).toBeGreaterThan(1);
    const row = sheet.getRows(2, 5)!.find((item) => item.getCell(5).value === "Holiday")!;
    expect(columns.map((index) => row.getCell(index).value).join("")).toBe(JSON.stringify(input.arrangements[0].tasks));
    for (const index of columns) expect(String(row.getCell(index).value).length).toBeLessThanOrEqual(32_000);
  });

  it("uses only selected child tabs and retains empty headers", async () => {
    const input = source();
    input.snapshot.filters.childIds = ["c"];
    input.entries = []; input.appointments = []; input.incidents = []; input.arrangements = [];
    const book = await workbook(input);
    expect(book.worksheets).toHaveLength(3);
    expect(book.getWorksheet("All Events")!.rowCount).toBe(1);
  });

  it("produces retry-stable workbook bytes with parseable XML", async () => {
    const first = await generateReportWorkbook(source());
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await generateReportWorkbook(source())).toEqual(first);
    const zip = await JSZip.loadAsync(first);
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain("All Events");
  });
});
