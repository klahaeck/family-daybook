import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { canonicalJson, sha256 } from "@/lib/domain/integrity";
import {
  deletePrivateFiles,
  getPrivateFile,
  getPrivateFileStream,
  putPrivateFile,
  type PrivateFileBody,
} from "@/lib/storage/private-files";
import type { ReportSource } from "@/lib/repository/repository";
import { reportArtifactPathnames } from "./artifact-paths";
import { ReportDocument } from "./report-document";

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export interface GeneratedEvidencePackage {
  manifestHash: string;
  pdfPathname: string;
  zipPathname: string;
  /** Files created by this attempt, used for rollback if persistence is fenced. */
  createdPathnames: string[];
}

async function ensureArtifact(
  pathname: string,
  contentType: string,
  body: () => Promise<PrivateFileBody> | PrivateFileBody,
  verify: (body: Uint8Array, contentType: string) => Promise<void> | void,
): Promise<boolean> {
  const existing = await getPrivateFile(pathname);
  if (existing) {
    await verify(existing.body, existing.contentType);
    return false;
  }
  try {
    await putPrivateFile(pathname, await body(), contentType);
    return true;
  } catch (error) {
    // Another recovery attempt may have won the deterministic pathname race.
    const raced = await getPrivateFile(pathname);
    if (!raced) throw error;
    await verify(raced.body, raced.contentType);
    return false;
  }
}

function assertContentType(actual: string, expected: string) {
  if (actual !== expected) throw new Error("REPORT_ARTIFACT_CONFLICT");
}

function verifyPdfArtifact(body: Uint8Array, contentType: string) {
  assertContentType(contentType, "application/pdf");
  const header = Buffer.from(body.subarray(0, 8)).toString("ascii");
  const trailer = Buffer.from(body.subarray(Math.max(0, body.length - 1_024))).toString(
    "ascii",
  );
  if (!header.startsWith("%PDF-") || !trailer.includes("%%EOF")) {
    throw new Error("REPORT_ARTIFACT_CONFLICT");
  }
}

async function getOrCreatePdf(
  pathname: string,
  source: ReportSource,
): Promise<{ pdf: Uint8Array; created: boolean }> {
  const existing = await getPrivateFile(pathname);
  if (existing) {
    verifyPdfArtifact(existing.body, existing.contentType);
    return { pdf: existing.body, created: false };
  }
  const rendered = new Uint8Array(
    await renderToBuffer(<ReportDocument source={source} />),
  );
  try {
    await putPrivateFile(pathname, rendered, "application/pdf");
    return { pdf: rendered, created: true };
  } catch (error) {
    const raced = await getPrivateFile(pathname);
    if (!raced) throw error;
    verifyPdfArtifact(raced.body, raced.contentType);
    return { pdf: raced.body, created: false };
  }
}

async function verifyZipArtifact(
  body: Uint8Array,
  contentType: string,
  expected: {
    manifestHash: string;
    pdfHash: string;
    checksums: string;
    attachmentPathnames: string[];
  },
) {
  assertContentType(contentType, "application/zip");
  try {
    const zip = await JSZip.loadAsync(body);
    const manifestFile = zip.file("manifest.json");
    const pdfFile = zip.file("parenting-log.pdf");
    const checksumsFile = zip.file("checksums.sha256");
    if (!manifestFile || !pdfFile || !checksumsFile) {
      throw new Error("REPORT_ARTIFACT_CONFLICT");
    }
    const [manifestJson, packagedPdf, checksums] = await Promise.all([
      manifestFile.async("string"),
      pdfFile.async("uint8array"),
      checksumsFile.async("string"),
    ]);
    if (
      sha256(canonicalJson(JSON.parse(manifestJson))) !== expected.manifestHash ||
      sha256(packagedPdf) !== expected.pdfHash ||
      checksums !== expected.checksums ||
      expected.attachmentPathnames.some((pathname) => !zip.file(pathname))
    ) {
      throw new Error("REPORT_ARTIFACT_CONFLICT");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_ARTIFACT_CONFLICT") {
      throw error;
    }
    throw new Error("REPORT_ARTIFACT_CONFLICT", { cause: error });
  }
}

export async function generateEvidencePackage(
  source: ReportSource,
): Promise<GeneratedEvidencePackage> {
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
  const attachmentPathnames = source.attachments.map(
    (attachment) =>
      `attachments/${attachment.id}-${safeName(attachment.originalName)}`,
  );
  const paths = reportArtifactPathnames(
    source.workspace.id,
    source.snapshot.id,
  );
  const createdPathnames: string[] = [];

  try {
    const { pdf, created: createdPdf } = await getOrCreatePdf(
      paths.pdfPathname,
      source,
    );
    if (createdPdf) {
      createdPathnames.push(paths.pdfPathname);
    }
    const pdfHash = sha256(pdf);
    const checksums = [
      `${pdfHash}  parenting-log.pdf`,
      `${manifestHash}  manifest.json`,
    ];
    source.attachments.forEach((attachment, index) => {
      checksums.push(`${attachment.sha256}  ${attachmentPathnames[index]}`);
    });
    const checksumsFile = `${checksums.join("\n")}\n`;

    if (
      await ensureArtifact(
        paths.zipPathname,
        "application/zip",
        async () => {
          const zip = new JSZip();
          zip.file("parenting-log.pdf", pdf);
          zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
          for (const [index, attachment] of source.attachments.entries()) {
            const file = await getPrivateFileStream(attachment.pathname);
            if (!file) throw new Error("REPORT_ATTACHMENT_NOT_FOUND");
            zip.file(
              attachmentPathnames[index],
              Readable.fromWeb(
                file.stream as unknown as NodeReadableStream<Uint8Array>,
              ),
              { binary: true, compression: "STORE" },
            );
          }
          zip.file("checksums.sha256", checksumsFile);
          const zipStream = new PassThrough();
          zip
            .generateNodeStream({
              type: "nodebuffer",
              streamFiles: true,
              compression: "DEFLATE",
              compressionOptions: { level: 6 },
            })
            .pipe(zipStream);
          return zipStream;
        },
        (body, contentType) =>
          verifyZipArtifact(body, contentType, {
            manifestHash,
            pdfHash,
            checksums: checksumsFile,
            attachmentPathnames,
          }),
      )
    ) {
      createdPathnames.push(paths.zipPathname);
    }

    return {
      manifestHash,
      ...paths,
      createdPathnames,
    };
  } catch (error) {
    await deletePrivateFiles(createdPathnames).catch(() => undefined);
    throw error;
  }
}
