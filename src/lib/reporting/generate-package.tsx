import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { canonicalJson, sha256 } from "@/lib/domain/integrity";
import { getPrivateFileStream, putPrivateFile } from "@/lib/storage/private-files";
import type { ReportSource } from "@/lib/repository/repository";
import { ReportDocument } from "./report-document";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function generateEvidencePackage(source: ReportSource) {
  const pdf = await renderToBuffer(<ReportDocument source={source} />);
  const manifest = {
    schemaVersion: 2,
    reportId: source.snapshot.id,
    workspaceId: source.workspace.id,
    generatedAt: source.snapshot.createdAt,
    timezone: source.workspace.timezone,
    filters: source.snapshot.filters,
    plannedArrangementNotice:
      "Planned arrangements are context only and do not establish that care occurred.",
    records: [
      ...source.entries.map((record) => ({ type: "care_entry", id: record.id, currentRevisionId: record.currentRevisionId })),
      ...source.appointments.map((record) => ({ type: "appointment", id: record.id, currentRevisionId: record.currentRevisionId })),
      ...source.incidents.map((record) => ({ type: "incident", id: record.id, currentRevisionId: record.currentRevisionId })),
      ...source.arrangements.map((record) => ({
        type: "special_arrangement",
        id: record.id,
        currentRevisionId: record.currentRevisionId,
      })),
    ],
    plannedArrangements: source.arrangements.map((arrangement) => ({
      id: arrangement.id,
      seriesId: arrangement.seriesId,
      localDate: arrangement.localDate,
      title: arrangement.title,
      note: arrangement.note,
      status: arrangement.status,
      assignments: arrangement.assignments,
      tasks: arrangement.tasks,
      createdAt: arrangement.createdAt,
      updatedAt: arrangement.updatedAt,
      currentRevisionId: arrangement.currentRevisionId,
    })),
    revisions: source.revisions.map((revision) => ({
      id: revision.id,
      recordType: revision.recordType,
      recordId: revision.recordId,
      revisionNumber: revision.revisionNumber,
      previousRevisionId: revision.previousRevisionId,
      recordedAt: revision.recordedAt,
      authorId: revision.authorId,
      reason: revision.reason,
      sha256: revision.hash,
    })),
    attachments: source.attachments.map((attachment) => ({
      id: attachment.id,
      recordType: attachment.recordType,
      recordId: attachment.recordId,
      originalName: attachment.originalName,
      contentType: attachment.contentType,
      size: attachment.size,
      uploadedAt: attachment.uploadedAt,
      sha256: attachment.sha256,
    })),
  };
  const manifestJson = canonicalJson(manifest);
  const manifestHash = sha256(manifestJson);
  const pdfHash = sha256(pdf);
  const zip = new JSZip();
  zip.file("parenting-log.pdf", pdf);
  zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  const checksums = [`${pdfHash}  parenting-log.pdf`, `${manifestHash}  manifest.json`];

  for (const attachment of source.attachments) {
    const file = await getPrivateFileStream(attachment.pathname);
    if (!file) continue;
    const pathname = `attachments/${attachment.id}-${safeName(attachment.originalName)}`;
    zip.file(
      pathname,
      Readable.fromWeb(file.stream as unknown as NodeReadableStream<Uint8Array>),
      { binary: true, compression: "STORE" },
    );
    checksums.push(`${attachment.sha256}  ${pathname}`);
  }
  zip.file("checksums.sha256", `${checksums.join("\n")}\n`);
  const zipStream = new PassThrough();
  zip.generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  }).pipe(zipStream);

  const base = `reports/${source.workspace.id}/${source.snapshot.id}`;
  const pdfPathname = await putPrivateFile(`${base}/parenting-log.pdf`, pdf, "application/pdf");
  const zipPathname = await putPrivateFile(`${base}/evidence-package.zip`, zipStream, "application/zip");
  return { manifestHash, pdfPathname, zipPathname };
}
