import { NextRequest, NextResponse } from "next/server";
import {
  openrouterFetch,
  OpenRouterChatCompletionResponse,
  OpenRouterChatMessage,
} from "@/lib/openrouter";
import { googleAiFetch } from "@/lib/google-ai";
import { MannequinOptions, buildInstruction, buildInstructionForPose, buildInstructionForPoseWithProvidedBackground, type Pose } from "@/lib/prompt";
import { normalizeImageDataUrl, parseDataUrl } from "@/lib/image";

export const runtime = "nodejs";

function getImageProvider() {
  const forced = (process.env.IMAGE_PROVIDER || "").toLowerCase();
  if (forced === "google" || forced === "openrouter") return forced;
  // Default to Google unless user explicitly selects OpenRouter
  return "google";
}

function getImageModel() {
  return (
    process.env.OPENROUTER_IMAGE_MODEL ||
    // Use a widely-available image model by default
    "fal-ai/flux-pro"
  );
}

export async function POST(req: NextRequest) {
  const { imageDataUrl, environmentImageDataUrl, options, productReference, count, poses } = (await req.json()) as {
    imageDataUrl: string; // Data URL (data:image/...;base64,...)
    environmentImageDataUrl?: string | null; // Optional environment image Data URL
    options?: MannequinOptions;
    productReference?: string;
    count?: number; // default 1 (legacy)
    poses?: Pose[]; // preferred new parameter
  };

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "Missing imageDataUrl" }, { status: 400 });
  }

  // Determine target poses: prefer explicit poses, else options.poses, else legacy count mapping
  const requestedPoses: Pose[] = (() => {
    const allowed: Pose[] = ["face", "trois-quarts", "profil"];
    const fromBody = Array.isArray(poses) ? poses.filter((p): p is Pose => allowed.includes(p as Pose)) : [];
    if (fromBody.length > 0) return Array.from(new Set(fromBody)).slice(0, 3);
    const fromOptions = Array.isArray(options?.poses) ? options!.poses!.filter((p): p is Pose => allowed.includes(p as Pose)) : [];
    if (fromOptions.length > 0) return Array.from(new Set(fromOptions)).slice(0, 3);
    const n = Math.min(Math.max(Number(count) || 1, 1), 3);
    const legacy: Pose[] = ["face", "trois-quarts", "profil"]; // order of preference
    return legacy.slice(0, n);
  })();

  // Helper: coerce a possibly-URL or malformed data URL into a proper data URL
  async function coerceToDataUrl(input: string): Promise<string> {
    let str = input;
    if (typeof str !== "string" || !str) throw new Error("Invalid image data");
    // Fix accidental base66 typos
    if (str.startsWith("data:") && str.includes(";base66,")) {
      str = str.replace(";base66,", ";base64,");
    }
    if (str.startsWith("http://") || str.startsWith("https://")) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(str, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error("Failed to fetch environment image");
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await resp.arrayBuffer());
      const b64 = buf.toString("base64");
      return `data:${contentType};base64,${b64}`;
    }
    if (!str.startsWith("data:")) throw new Error("Invalid image data format");
    return str;
  }

  // Normalize input image (handle HEIC/unknown → JPEG, max 2048px)
  let safeImageDataUrl = imageDataUrl;
  let safeEnvImageDataUrl: string | null = null;
  try {
    safeImageDataUrl = await normalizeImageDataUrl(imageDataUrl);
    if (environmentImageDataUrl && typeof environmentImageDataUrl === "string") {
      const coerced = await coerceToDataUrl(environmentImageDataUrl);
      safeEnvImageDataUrl = await normalizeImageDataUrl(coerced);
    }
  } catch {
    return NextResponse.json(
      { error: "The image data provided is invalid or unsupported." },
      { status: 400 }
    );
  }

  function extractOpenRouterImageUrls(
    resp: OpenRouterChatCompletionResponse
  ): string[] {
    type ImagesPart = { image_url?: { url?: string } };
    type ChoiceMessage = { images?: ImagesPart[]; content?: unknown };
    type ChoiceDelta = { images?: ImagesPart[] };
    type Choice = { message?: ChoiceMessage; delta?: ChoiceDelta };

    const urls: string[] = [];
    const choice = (resp?.choices?.[0] || {}) as Choice;
    const direct = choice.message?.images || choice.delta?.images || [];
    for (const it of direct) {
      const u = it?.image_url?.url;
      if (typeof u === "string") urls.push(u);
    }
    const content = choice.message?.content;
    // Some providers may return a string content with embedded data URLs or http image links
    if (typeof content === "string") {
      const dataUrls = content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g) || [];
      for (const u of dataUrls) urls.push(u);
      const httpUrls = content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)/gi) || [];
      for (const u of httpUrls) urls.push(u);
    }
    // If content is array of parts with image_url
    if (Array.isArray(content)) {
      for (const part of content as Array<Record<string, unknown>>) {
        const u =
          (part?.image_url as { url?: string } | undefined)?.url ||
          (part?.url as string | undefined);
        if (typeof u === "string") urls.push(u);
      }
    }
    return Array.from(new Set(urls));
  }

  function extractGoogleImageUrls(resp: unknown): string[] {
    const urls: string[] = [];
    // Shape 1: Gemini generateContent style (inlineData)
    try {
      const parts = (
        resp as { candidates?: Array<{ content?: { parts?: unknown[] } }> }
      )?.candidates?.[0]?.content?.parts || [];
      for (const p of parts as Array<Record<string, unknown>>) {
        const d =
          (p as { inlineData?: { data?: string; mimeType?: string } }).inlineData ||
          (p as { inline_data?: { data?: string; mime_type?: string } }).inline_data;
        const data = d?.data as string | undefined;
        const mime =
          (d as { mimeType?: string })?.mimeType ||
          (d as { mime_type?: string })?.mime_type;
        if (data && mime) {
          urls.push(`data:${mime};base64,${data}`);
        }
      }
    } catch {}
    // Shape 2: Image Generation API (generatedImages[].image.bytesBase64Encoded)
    try {
      const gen = (resp as { generatedImages?: Array<{ image?: { bytesBase64Encoded?: string; mimeType?: string } }> })
        ?.generatedImages || [];
      for (const it of gen) {
        const b64 = it?.image?.bytesBase64Encoded as string | undefined;
        const mime = (it?.image?.mimeType as string | undefined) || "image/png";
        if (b64) urls.push(`data:${mime};base64,${b64}`);
      }
    } catch {}
    return Array.from(new Set(urls));
  }

  const match = safeImageDataUrl.match(
    /^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)$/
  );
  if (!match) {
    return NextResponse.json(
      { error: "Invalid image data" },
      { status: 400 }
    );
  }
  const mimeType = match[1];
  const base64Data = match[2];
  let envMimeType: string | null = null;
  let envBase64Data: string | null = null;
  if (safeEnvImageDataUrl) {
    const m2 = safeEnvImageDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!m2) {
      return NextResponse.json({ error: "Invalid environment image data" }, { status: 400 });
    }
    envMimeType = m2[1];
    envBase64Data = m2[2];
  }

  const instructionEchoes: string[] = [];
  // Decide final mode strictly on presence of a valid env image data URL
  const isTwoImagesMode = Boolean(safeEnvImageDataUrl);
  const providerHeader = req.headers.get("x-image-provider");
  const provider =
    providerHeader === "openrouter" || providerHeader === "google"
      ? providerHeader
      : getImageProvider();
  // Dev observability
  try {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug(
        "[generate-images] provider=%s poses=%o mode=%s",
        provider,
        requestedPoses,
        safeEnvImageDataUrl ? "two-images" : "one-image"
      );
      // log options.gender if provided
      const gender = (options as any)?.gender || (options as any)?.Gender || null;
      if (gender) {
        // eslint-disable-next-line no-console
        console.debug("[generate-images] options.gender=", gender);
      }
    }
  } catch {}
  try {
    const buildTask = (pose: Pose, idx: number) => {
      const variantLabel = pose;
      const instruction = isTwoImagesMode
        ? buildInstructionForPoseWithProvidedBackground(options || {}, pose, productReference, variantLabel)
        : buildInstructionForPose(options || {}, pose, productReference, variantLabel);
      instructionEchoes[idx] = instruction;
      if (provider === "openrouter") {
        const messages: OpenRouterChatMessage[] = [
          {
            role: "system",
            content:
              "Tu génères UNIQUEMENT une image correspondant aux instructions. Ne retourne pas de texte.",
          },
          {
            role: "user",
            content: (
              () => {
                // Prefer sending background first (Image 1), then clothing (Image 2), then text
                const parts: any[] = [];
                if (safeEnvImageDataUrl) parts.push({ type: "image_url", image_url: { url: safeEnvImageDataUrl } });
                parts.push({ type: "image_url", image_url: { url: safeImageDataUrl } });
                parts.push({ type: "text", text: instruction });
                return parts;
              }
            )(),
          },
        ];
        const payload = {
          model: getImageModel(),
          messages,
          modalities: ["image"],
          // Some providers honor this to prefer non-text responses
          max_output_tokens: 0,
        };
        return openrouterFetch<OpenRouterChatCompletionResponse>(payload, { cache: "no-store" })
          .then((data) => {
            const urls = extractOpenRouterImageUrls(data);
            return urls[0] || null;
          })
          .catch((e) => { throw e; });
      } else {
        // Google path: prefer Google always unless user explicitly switches provider
        // Send environment image first (Image 1), then clothing image (Image 2), then text
        const parts: Array<Record<string, unknown>> = [];
        if (isTwoImagesMode && safeEnvImageDataUrl && envMimeType && envBase64Data) {
          parts.push({ inline_data: { mime_type: envMimeType, data: envBase64Data } });
        }
        parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
        parts.push({ text: instruction });
        const payload = {
          contents: [{ role: "user", parts }],
          // Relax safety where permitted by REST API enums
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
        } as Record<string, unknown>;
        return googleAiFetch(payload, { cache: "no-store" })
          .then((data) => {
            const urls = extractGoogleImageUrls(data);
            if (urls[0]) return urls[0];
            // If still no image but we received text, surface it as an error hint
            try {
              const firstText = ((data as any)?.candidates?.[0]?.content?.parts || [])
                .map((p: any) => p?.text)
                .filter((t: any) => typeof t === "string")[0];
              if (firstText) throw new Error(String(firstText).slice(0, 280));
            } catch {}
            return null;
          });
      }
    };

    // For two-image mode, throttle to reduce policy refusals
    let settled: PromiseSettledResult<string | null>[];
    if (isTwoImagesMode) {
      settled = [];
      for (let i = 0; i < requestedPoses.length; i++) {
        try {
          const value = await buildTask(requestedPoses[i], i);
          settled.push({ status: "fulfilled", value } as PromiseFulfilledResult<string | null>);
        } catch (e) {
          settled.push({ status: "rejected", reason: e } as PromiseRejectedResult);
        }
        // small stagger
        await new Promise((r) => setTimeout(r, 150));
      }
    } else {
      const tasks = requestedPoses.map((pose, idx) => buildTask(pose, idx));
      settled = await Promise.allSettled(tasks);
    }
    const imagesOut: string[] = [];
    const errorsByIndex: Record<number, string> = {};
    settled.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        if (r.value) imagesOut[idx] = r.value as string;
      } else {
        const raw = r.reason instanceof Error ? r.reason.message : String(r.reason);
        errorsByIndex[idx] = raw;
      }
    });

    // Dev observability: status per pose + basic sizes
    try {
      if (process.env.NODE_ENV !== "production") {
        const status = requestedPoses.map((p, i) => ({ pose: p, ok: Boolean(imagesOut[i]), error: errorsByIndex[i] || null }));
        // Log sizes/mimes for inputs
        const a = (() => { try { const { mime, buffer } = parseDataUrl(safeImageDataUrl); return { mime, bytes: buffer.length }; } catch { return null; } })();
        const b = safeEnvImageDataUrl ? (() => { try { const { mime, buffer } = parseDataUrl(safeEnvImageDataUrl!); return { mime, bytes: buffer.length }; } catch { return null; } })() : null;
        // eslint-disable-next-line no-console
        console.debug("[generate-images] per-pose status=", status, "inputs:", { main: a, env: b });
      }
    } catch {}

    const haveAny = imagesOut.filter(Boolean).length > 0;
    if (!haveAny) {
      const friendly =
        provider === "google"
          ? "La génération d'image a été refusée par Google (politique de sécurité). Modifiez l'image ou les options, puis réessayez."
          : "Aucune image reçue du fournisseur. Réessayez ou changez de modèle.";
      return NextResponse.json({ error: friendly, poses: requestedPoses, errors: errorsByIndex }, { status: 422 });
    }
    const payload: { images: Array<string | null>; instructions?: string[]; poses: Pose[]; errors?: Record<string, string>; debug?: Record<string, unknown> } = {
      images: imagesOut,
      poses: requestedPoses,
    };
    const hasErrors = Object.keys(errorsByIndex).length > 0;
    if (hasErrors) {
      payload.errors = Object.fromEntries(Object.entries(errorsByIndex).map(([i, msg]) => [requestedPoses[Number(i)], msg]));
    }
    // Help debugging locally by returning the exact instructions and mode
    try {
      if (process.env.NODE_ENV !== "production") {
        payload.instructions = instructionEchoes;
        payload.debug = { mode: isTwoImagesMode ? "two-images" : "one-image", imagesCountSent: isTwoImagesMode ? 2 : 1 };
      }
    } catch {}
    return NextResponse.json(payload, { status: 200 });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const lower = raw.toLowerCase();
    // Friendlier messaging when Google blocks for policy/safety
    if (
      lower.includes("google ai error") ||
      lower.includes("safety") ||
      lower.includes("harm_category") ||
      lower.includes("invalid_argument") ||
      lower.includes("blocked") ||
      lower.includes("policy")
    ) {
      return NextResponse.json(
        {
          error:
            "Google a refusé la génération (contenu potentiellement interdit). Modifiez l'image ou les options, puis cliquez sur Réessayer.",
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: raw }, { status: 500 });
  }
}
