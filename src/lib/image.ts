import sharp from "sharp";

const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type ParsedDataUrl = { mime: string; buffer: Buffer };

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("Invalid data URL");
  }
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid data URL");
  const header = dataUrl.slice(5, comma); // after 'data:'
  const base64 = dataUrl.slice(comma + 1);
  const semi = header.indexOf(";");
  const mime = (semi >= 0 ? header.slice(0, semi) : header) || "application/octet-stream";
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    throw new Error("Invalid base64 in data URL");
  }
  return { mime, buffer: buf };
}

/**
 * Normalize an incoming data URL:
 * - If mime is jpg → normalize to image/jpeg (no re-encode)
 * - If mime is supported (jpeg/png/webp/gif): return as-is
 * - Otherwise (heic/heif/unknown): decode and re-encode to JPEG @ quality 85, max 2048px, return data URL
 */
export async function normalizeImageDataUrl(dataUrl: string): Promise<string> {
  const { mime, buffer } = parseDataUrl(dataUrl);
  const lower = mime.toLowerCase();
  if (lower === "image/jpg") {
    // Only adjust header to image/jpeg while keeping the bytes
    return `data:image/jpeg;base64,${dataUrl.split(",")[1]}`;
  }
  if (ACCEPTED_MIME.has(lower)) {
    return dataUrl; // already fine
  }
  // Convert via sharp to JPEG, max 2048, keep orientation
  try {
    const out = await sharp(buffer, { limitInputPixels: false })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch (e) {
    throw new Error("Failed to normalize image");
  }
}

