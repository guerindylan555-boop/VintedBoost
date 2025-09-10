import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import { openrouterFetch, OpenRouterChatMessage, OpenRouterChatCompletionResponse } from "@/lib/openrouter";
import { googleAiFetch } from "@/lib/google-ai";
import { buildInstructionForPose, buildInstructionForPoseWithProvidedBackground, type Pose } from "@/lib/prompt";

export const runtime = "nodejs";

function getImageProvider() {
  const forced = (process.env.IMAGE_PROVIDER || "").toLowerCase();
  if (forced === "google" || forced === "openrouter") return forced;
  return "google";
}

function getImageModel() {
  return process.env.OPENROUTER_IMAGE_MODEL || "fal-ai/flux-pro";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = String(params?.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Ensure auxiliary tables/columns
  async function ensureResultsTable() {
    await query(`
      CREATE TABLE IF NOT EXISTS generation_results (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        pose TEXT NOT NULL,
        image TEXT,
        error TEXT,
        instruction TEXT,
        latency_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_generation_results_job ON generation_results(job_id);`);
  }
  await ensureResultsTable();
  // If job is still in 'created', flip to 'queued' early for consistency
  try {
    await query(`UPDATE generation_jobs SET status = CASE WHEN status = 'created' THEN 'queued' ELSE status END WHERE id = $1`, [params.id]);
  } catch {}

  // Load prepared job
  const { rows } = await query<{
    session_id: string;
    requested_mode: string;
    final_mode: string;
    options: any;
    product: any;
    poses: string[] | null;
    main_image: string;
    env_image: string | null;
    debug: any | null;
  }>(
    `SELECT session_id, requested_mode, final_mode, options, product, poses, main_image, env_image, debug
     FROM generation_jobs WHERE id = $1 LIMIT 1`,
    [id]
  );
  const job = rows?.[0];
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.session_id !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const providerHeader = req.headers.get("x-image-provider");
  const provider = providerHeader === "openrouter" || providerHeader === "google" ? providerHeader : getImageProvider();

  // Mark job as running and set provider/started_at
  try {
    await query(
      `UPDATE generation_jobs SET status = 'running', provider = $2, started_at = NOW() WHERE id = $1 AND status IN ('created','queued')`,
      [id, provider]
    );
  } catch {}

  const finalMode = (job.final_mode === "two" ? "two" : "one") as "one" | "two";
  const poses: Pose[] = (() => {
    const allowed: Pose[] = ["face", "trois-quarts", "profil"];
    const src = Array.isArray(job.poses) && job.poses.length ? job.poses : ["face"];
    return Array.from(new Set(src.filter((p): p is Pose => allowed.includes(p as Pose)))).slice(0, 3);
  })();

  const instructionEchoes: string[] = [];

  function extractOpenRouterImageUrls(resp: OpenRouterChatCompletionResponse): string[] {
    const urls: string[] = [];
    const choice: any = resp?.choices?.[0] || {};
    const direct = choice.message?.images || choice.delta?.images || [];
    for (const it of direct) {
      const u = it?.image_url?.url;
      if (typeof u === "string") urls.push(u);
    }
    const content = choice.message?.content;
    if (typeof content === "string") {
      const dataUrls = content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g) || [];
      for (const u of dataUrls) urls.push(u);
      const httpUrls = content.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|gif)/gi) || [];
      for (const u of httpUrls) urls.push(u);
    }
    if (Array.isArray(content)) {
      for (const part of content as Array<Record<string, unknown>>) {
        const u = (part as any)?.image_url?.url || (part as any)?.url;
        if (typeof u === "string") urls.push(u);
      }
    }
    return Array.from(new Set(urls));
  }

  function extractGoogleImageUrls(resp: unknown): string[] {
    const urls: string[] = [];
    try {
      const parts = (resp as any)?.candidates?.[0]?.content?.parts || [];
      for (const p of parts as Array<Record<string, unknown>>) {
        const d = (p as any)?.inlineData || (p as any)?.inline_data;
        const data = d?.data as string | undefined;
        const mime = d?.mimeType || d?.mime_type;
        if (data && mime) urls.push(`data:${mime};base64,${data}`);
      }
    } catch {}
    try {
      const gen = (resp as any)?.generatedImages || [];
      for (const it of gen) {
        const b64 = it?.image?.bytesBase64Encoded;
        const mime = it?.image?.mimeType || "image/png";
        if (b64) urls.push(`data:${mime};base64,${b64}`);
      }
    } catch {}
    return Array.from(new Set(urls));
  }

  const buildTask = async (pose: Pose, idx: number) => {
    const instruction = finalMode === "two"
      ? buildInstructionForPoseWithProvidedBackground(job.options || {}, pose, undefined, pose)
      : buildInstructionForPose(job.options || {}, pose, undefined, pose);
    instructionEchoes[idx] = instruction;
    const started = Date.now();
    if (provider === "openrouter") {
      const messages: OpenRouterChatMessage[] = [
        { role: "system", content: "Tu génères UNIQUEMENT une image correspondant aux instructions. Ne retourne pas de texte." },
        {
          role: "user",
          content: (() => {
            const parts: any[] = [];
            if (finalMode === "two" && job.env_image) parts.push({ type: "image_url", image_url: { url: job.env_image } });
            parts.push({ type: "image_url", image_url: { url: job.main_image } });
            parts.push({ type: "text", text: instruction });
            return parts;
          })(),
        },
      ];
      const payload = { model: getImageModel(), messages, modalities: ["image"], max_output_tokens: 0 };
      const d = await openrouterFetch<OpenRouterChatCompletionResponse>(payload, { cache: "no-store" });
      const url = extractOpenRouterImageUrls(d)[0] || null;
      const latency = Date.now() - started;
      try {
        await query(
          `INSERT INTO generation_results (id, job_id, pose, image, error, instruction, latency_ms)
           VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
          [randomUUID(), id, pose, url, instruction, latency]
        );
      } catch {}
      return url;
    }

    // Google
    const toInline = (dataUrl: string) => {
      const m = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) return null;
      return { mime_type: m[1], data: m[2] };
    };
    const parts: Array<Record<string, unknown>> = [];
    if (finalMode === "two" && job.env_image) {
      const a = toInline(job.env_image);
      if (a) parts.push({ inline_data: a });
    }
    const b = toInline(job.main_image);
    if (b) parts.push({ inline_data: b });
    parts.push({ text: instruction });
    const payload = {
      contents: [{ role: "user", parts }],
      safetySettings: [
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    } as Record<string, unknown>;
    const d = await googleAiFetch(payload, { cache: "no-store" });
    const url = extractGoogleImageUrls(d)[0] || null;
    const latency = Date.now() - started;
    try {
      await query(
        `INSERT INTO generation_results (id, job_id, pose, image, error, instruction, latency_ms)
         VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
        [randomUUID(), id, pose, url, instruction, latency]
      );
    } catch {}
    return url;
  };

  let settled: PromiseSettledResult<string | null>[] = [];
  if (finalMode === "two") {
    for (let i = 0; i < poses.length; i++) {
      try {
        const v = await buildTask(poses[i], i);
        settled.push({ status: "fulfilled", value: v } as PromiseFulfilledResult<string | null>);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        settled.push({ status: "rejected", reason: e } as PromiseRejectedResult);
        // Persist failure row
        try {
          await query(
            `INSERT INTO generation_results (id, job_id, pose, image, error, instruction, latency_ms)
             VALUES ($1, $2, $3, NULL, $4, $5, NULL)`,
            [randomUUID(), id, poses[i], err, instructionEchoes[i] || ""]
          );
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  } else {
    settled = await Promise.allSettled(poses.map((p, i) => buildTask(p, i)));
  }

  const images: Array<string | null> = [];
  const errorsByIndex: Record<number, string> = {};
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") images[i] = r.value as string | null;
    else errorsByIndex[i] = r.reason instanceof Error ? r.reason.message : String(r.reason);
  });

  // Persist results
  const updatedDebug = { ...(job as any)?.debug || {}, mode: finalMode === "two" ? "two-images" : "one-image", instructions: instructionEchoes };
  try {
    const anyOk = images.filter(Boolean).length > 0;
    await query(
      `UPDATE generation_jobs SET status = $2, results = $3::jsonb, debug = $4::jsonb, ended_at = NOW() WHERE id = $1`,
      [
        id,
        anyOk ? 'done' : 'failed',
        JSON.stringify({ images, poses, errorsByIndex }),
        JSON.stringify(updatedDebug)
      ]
    );
  } catch {}

  const out: any = { images, poses, instructions: instructionEchoes, debug: updatedDebug };
  return NextResponse.json(out, { status: 200 });
}
