import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { renderToBuffer } from "@react-pdf/renderer";
import { reportEvents, summarizeReport } from "@/lib/reporting/report-data";
import { generateReportWorkbook } from "@/lib/reporting/report-workbook";
import { ReportDocument } from "@/lib/reporting/report-document";
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
  it("keeps all events together and creates unique, safe child tabs with shared IDs", async () => {
    const book = await workbook(source());
    expect(book.worksheets).toHaveLength(5);
    expect(new Set(book.worksheets.map((sheet) => sheet.name.toLowerCase())).size).toBe(5);
    expect(book.worksheets.every((sheet) => sheet.name.length <= 31 && !/[\\/*?:\[\]]/.test(sheet.name))).toBe(true);
    const all = book.getWorksheet("All Events")!;
    expect(all.rowCount).toBe(6);
    expect(all.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(all.autoFilter).toBeTruthy();
    const ids = (sheet: ExcelJS.Worksheet) => sheet.getColumn(12).values.slice(2);
    expect(ids(all).filter((id) => id === "shared")).toHaveLength(1);
    expect(ids(book.worksheets[2])).toContain("shared");
    expect(ids(book.worksheets[3])).toContain("shared");
    expect(book.worksheets[4].rowCount).toBe(1);
    const shared = all.getRows(2, 5)!.find((row) => row.getCell(12).value === "shared")!;
    expect(shared.getCell(1).value).toBe("2026-06-01");
    expect(shared.getCell(14).value).toBe(source().entries[0].notes);
    expect(shared.getCell(14).type).toBe(ExcelJS.ValueType.String);
    expect(shared.getCell(15).value).toBe(0);
    expect(shared.getCell(17).value).toBe(false);
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
