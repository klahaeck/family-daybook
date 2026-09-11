import "server-only";

import { del, get, put } from "@vercel/blob";
import type { Readable } from "node:stream";

export type PrivateFileBody =
  | Buffer
  | Uint8Array
  | ReadableStream<Uint8Array>
  | Readable
  | NodeJS.ReadableStream;

export interface PrivateFileStream {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

declare global {
  var __parentingFileStore: Map<string, { body: Uint8Array; contentType: string }> | undefined;
}

function memoryStore() {
  globalThis.__parentingFileStore ??= new Map();
  return globalThis.__parentingFileStore;
}

async function readBody(body: PrivateFileBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return new Uint8Array(body);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
    chunks.push(bytes);
    size += bytes.byteLength;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function streamBytes(body: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
}

export function blobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

export async function putPrivateFile(
  pathname: string,
  body: PrivateFileBody,
  contentType: string,
): Promise<string> {
  if (!blobConfigured()) {
    memoryStore().set(pathname, { body: await readBody(body), contentType });
    return pathname;
  }
  const uploadBody =
    body instanceof Uint8Array && !Buffer.isBuffer(body)
      ? Buffer.from(body)
      : body;
  const result = await put(pathname, uploadBody as Parameters<typeof put>[1], {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
    cacheControlMaxAge: 60,
  });
  return result.pathname;
}

export async function getPrivateFileStream(
  pathname: string,
): Promise<PrivateFileStream | null> {
  if (!blobConfigured()) {
    const file = memoryStore().get(pathname);
    if (!file) return null;
    return {
      stream: streamBytes(file.body),
      contentType: file.contentType,
      size: file.body.byteLength,
    };
  }
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType ?? "application/octet-stream",
    size: result.blob.size,
  };
}

export async function getPrivateFile(
  pathname: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const file = await getPrivateFileStream(pathname);
  if (!file) return null;
  const body = new Uint8Array(await new Response(file.stream).arrayBuffer());
  return {
    body,
    contentType: file.contentType,
  };
}

export async function deletePrivateFiles(pathnames: string[]): Promise<void> {
  if (!pathnames.length) return;
  if (!blobConfigured()) {
    for (const pathname of pathnames) memoryStore().delete(pathname);
    return;
  }
  await del(pathnames);
}
