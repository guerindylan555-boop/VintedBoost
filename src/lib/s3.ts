import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { parseDataUrl } from "@/lib/image";

const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET || "";
const PUBLIC_BASE = (process.env.AWS_S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");

let __client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (__client) return __client;
  __client = new S3Client({ region: AWS_REGION });
  return __client;
}

export function getBucket(): string {
  if (!AWS_S3_BUCKET) throw new Error("AWS_S3_BUCKET is not configured");
  return AWS_S3_BUCKET;
}

export function extFromMime(mime: string): string {
  const lower = (mime || "").toLowerCase();
  if (lower.includes("jpeg") || lower === "image/jpg") return "jpg";
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  return "jpg"; // default
}

export function buildPublicUrl(key: string): string {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${key}`;
  const bucket = getBucket();
  // Generic virtual-hosted–style URL; works for most regions
  return `https://${bucket}.s3.amazonaws.com/${key}`;
}

export async function uploadBufferToS3(params: {
  key: string;
  contentType: string;
  body: Buffer | Uint8Array;
  cacheControl?: string;
}): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const Bucket = getBucket();
  const { key, contentType, body, cacheControl } = params;
  await client.send(
    new PutObjectCommand({
      Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl || "public, max-age=31536000, immutable",
    })
  );
  const url = buildPublicUrl(key);
  return { key, url };
}

export async function uploadDataUrlToS3(dataUrl: string, key: string): Promise<{ key: string; url: string; contentType: string }> {
  const { mime, buffer } = parseDataUrl(dataUrl);
  const { url } = await uploadBufferToS3({ key, contentType: mime, body: buffer });
  return { key, url, contentType: mime };
}

export async function fetchArrayBuffer(input: string): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(input, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const arr = await res.arrayBuffer();
    return { buffer: Buffer.from(arr), contentType };
  } finally {
    clearTimeout(timeout);
  }
}

export async function uploadHttpUrlToS3(httpUrl: string, key: string): Promise<{ key: string; url: string; contentType: string }> {
  const { buffer, contentType } = await fetchArrayBuffer(httpUrl);
  const { url } = await uploadBufferToS3({ key, contentType, body: buffer });
  return { key, url, contentType };
}

export function sanitizeKeyPart(part: string): string {
  return (part || "")
    .toLowerCase()
    .replace(/[^a-z0-9._/\-]+/g, "-")
    .replace(/\/+/, "/")
    .replace(/^\/+|\/+$/g, "");
}

export function joinKey(...parts: string[]): string {
  return parts.map(sanitizeKeyPart).filter(Boolean).join("/");
}
