"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useParams, useRouter } from "next/navigation";
import LoadingScreen from "@/components/LoadingScreen";
import ResultsGallery from "@/components/ResultsGallery";
import DescriptionPanel from "@/components/DescriptionPanel";
import Toggle from "@/components/Toggle";
import Image from "next/image";
import { buildInstructionForPose, buildInstructionForPoseWithProvidedBackground, type Pose, type MannequinOptions } from "@/lib/prompt";

type Item = {
  id: string;
  createdAt: number | string;
  updatedAt?: number | string;
  source: string;
  results: string[];
  description?: Record<string, unknown> | null;
  status?: "draft" | "final";
  meta?: {
    options: MannequinOptions;
    product: { brand: string; model: string; condition?: string };
    descEnabled: boolean;
    env?: { useDefault: boolean; kind: "chambre" | "salon"; image?: string };
  };
  title?: string;
};

function upsertLocalHistory(item: Item) {
  try {
    const raw = localStorage.getItem("vintedboost_history");
    const prev = raw ? (JSON.parse(raw) as Item[]) : [];
    const idx = prev.findIndex((x) => String(x.id) === String(item.id));
    const next = [...prev];
    if (idx >= 0) next[idx] = { ...next[idx], ...item, updatedAt: Date.now() };
    else next.unshift({ ...item, updatedAt: Date.now() });
    localStorage.setItem("vintedboost_history", JSON.stringify(next));
    localStorage.setItem("vintedboost_last", JSON.stringify(next[0]));
  } catch {}
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...(init || {}), signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export default function ResultatsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loadingItem, setLoadingItem] = useState(true);
  const [step, setStep] = useState<"idle" | "prepare" | "generating" | "saving" | "done" | "error">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [title, setTitle] = useState("");
  const [savingEdits, setSavingEdits] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editDescMode, setEditDescMode] = useState(false);
  const [descText, setDescText] = useState("");
  const [genPoses, setGenPoses] = useState<string[] | null>(null);
  const [genErrors, setGenErrors] = useState<Record<string, string> | null>(null);
  // Debug view toggle and captured request details
  const [showDebug, setShowDebug] = useState(false);
  const [genInstructions, setGenInstructions] = useState<string[] | null>(null);
  const [genMode, setGenMode] = useState<"one-image" | "two-images" | null>(null);
  const [genProvider, setGenProvider] = useState<string | null>(null);
  const [requestedPoses, setRequestedPoses] = useState<string[] | null>(null);

  // Load item (unified: id is the jobId)
  useEffect(() => {
    const jobId = decodeURIComponent(String(id || ""));
    if (!jobId) { setLoadingItem(false); return; }
    let found: Item | null = null;
    // sessionStorage snapshot by jobId
    try {
      const tmp = sessionStorage.getItem(`vintedboost_tmp_${jobId}`);
      if (tmp) {
        const obj = JSON.parse(tmp) as (Item & { jobId?: string | null });
        if (obj && obj.source) found = obj as Item;
      }
    } catch {}
    (async () => {
      if (!found) {
        try {
          const r = await fetch(`/api/jobs/${encodeURIComponent(String(jobId))}`);
          if (r.ok) {
            const job = await r.json() as { main_image?: string; env_image?: string | null; options?: MannequinOptions; product?: any };
            if (job?.main_image) {
              const background = (job?.options as any)?.background;
              const envKindGuess = (background === 'salon' || background === 'chambre') ? background : 'chambre';
              found = {
                id: jobId,
                createdAt: Date.now(),
                source: job.main_image,
                results: [],
                status: "draft",
                meta: {
                  options: (job.options || {}) as MannequinOptions,
                  product: (job.product || { brand: "", model: "" }),
                  descEnabled: false,
                  env: job.env_image ? { useDefault: true, kind: envKindGuess, image: job.env_image } : undefined,
                },
              } as Item;
            }
          }
        } catch {}
      }
      setItem(found);
      setLoadingItem(false);
      try {
        const desc = (found?.description || null) as (null | { title?: string; descriptionText?: string });
        const t = (found?.title || desc?.title || "").toString();
        if (t) setTitle(String(t));
        const d = (desc?.descriptionText || "").toString();
        if (d) setDescText(String(d));
      } catch {}
    })();
  }, [id]);

  const descEnabled = Boolean(item?.meta?.descEnabled);

  const debugData = useMemo(() => {
    if (!item || !item.source) return null as null | {
      provider: string;
      mode: "one-image" | "two-images";
      envImageUrl: string | null;
      mainImageUrl: string;
      poses: Pose[];
      instructionsByPose: Array<{ pose: Pose; instruction: string }>;
    };
    const provider = genProvider || (() => { try { return localStorage.getItem("imageProvider") || "google"; } catch { return "google"; } })();
    const envImageUrl = item?.meta?.env?.useDefault ? (item?.meta?.env?.image || null) : null;
    const mode: "one-image" | "two-images" = genMode || (envImageUrl ? "two-images" : "one-image");
    const opts = (item?.meta?.options || {}) as MannequinOptions;
    const poses: Pose[] = (() => {
      const allowed: Pose[] = ["face", "trois-quarts", "profil"];
      const fromRequested = Array.isArray(requestedPoses) ? requestedPoses.filter((p): p is Pose => allowed.includes(p as Pose)) : [];
      if (fromRequested.length > 0) return fromRequested as Pose[];
      const fromGen = Array.isArray(genPoses) ? genPoses.filter((p): p is Pose => allowed.includes(p as Pose)) : [];
      if (fromGen.length > 0) return fromGen as Pose[];
      const fromOptions = Array.isArray(opts?.poses) ? opts.poses.filter((p): p is Pose => allowed.includes(p as Pose)) : [];
      if (fromOptions.length > 0) return fromOptions as Pose[];
      const single = (opts?.pose || "face") as Pose;
      return [allowed.includes(single) ? single : "face"];
    })();
    let instructionsByPose: Array<{ pose: Pose; instruction: string }> = [];
    if (Array.isArray(genInstructions) && genInstructions.length > 0) {
      instructionsByPose = poses.map((p, idx) => ({ pose: p, instruction: genInstructions[idx] || "" })).filter((x) => Boolean(x.instruction));
    }
    if (instructionsByPose.length === 0) {
      instructionsByPose = poses.map((p) => ({
        pose: p,
        instruction: envImageUrl
          ? buildInstructionForPoseWithProvidedBackground(opts, p, undefined, p)
          : buildInstructionForPose(opts, p, undefined, p),
      }));
    }
    return {
      provider,
      mode,
      envImageUrl,
      mainImageUrl: item.source,
      poses,
      instructionsByPose,
    };
  }, [item, genPoses, genMode, genInstructions, requestedPoses]);

  // Safe JSON reader: falls back to text for non-JSON errors (e.g., 502 Bad Gateway)
  async function readJsonOrText(res: Response): Promise<unknown> {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return res.json();
    }
    try {
      const txt = await res.text();
      return txt;
    } catch {
      return null;
    }
  }

  // If we have a jobId for this legacy item, also show a link to the new results page
  const linkedJobId = useMemo(() => decodeURIComponent(String(id || "")) || null, [id]);

  async function runGeneration() {
    if (!item) return;
    let context = "Initialisation";
    try {
      setError(null);
      setStep("prepare");
      setProgress(8);
      context = "Préparation";

      // Parallel generation: images and (optional) description
      setStep("generating");
      setProgress(20);
      context = "Génération (images + description)";
      const provider = (() => {
        try {
          return localStorage.getItem("imageProvider");
        } catch {
          return null;
        }
      })();
      const sharedHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (provider) sharedHeaders["X-Image-Provider"] = provider;

      // Resolve environment image just-in-time to avoid missing image due to stale history
      let envImageForRequest: string | null = null;
      let envKindForRequest: "chambre" | "salon" | null = null;
      try {
        const useDefault = Boolean(item.meta?.env?.useDefault);
        envKindForRequest = (item.meta?.env?.kind === "salon" || item.meta?.env?.kind === "chambre") ? item.meta?.env?.kind : null;
        const existing = (useDefault ? (item.meta?.env?.image || null) : null) || null;
        if (useDefault) {
          if (existing) {
            envImageForRequest = existing;
          } else if (envKindForRequest) {
            // Fetch default env for the selected kind
            try {
              const res = await fetch(`/api/environments?kind=${encodeURIComponent(envKindForRequest)}`, { cache: "no-store" });
              if (res.ok) {
                const data = await res.json();
                const items = Array.isArray((data as any)?.items) ? ((data as any).items as Array<{ id: string; kind: string; image: string; isDefault?: boolean }>) : [];
                const def = items.find((x) => x.isDefault);
                if (def?.image) {
                  envImageForRequest = def.image;
                  // Update local item so future retries reuse it
                  const newer: Item = { ...item, meta: { ...(item.meta || {}), env: { useDefault: true, kind: envKindForRequest, image: def.image } } };
                  setItem(newer);
                  upsertLocalHistory(newer);
                }
              }
            } catch {}
          }
        }
      } catch {}

      // New flow: trigger generation on prepared job if we have a jobId; else fallback to legacy endpoint
      const imagesReq = (async () => {
        const jid = linkedJobId;
        if (jid) {
          const res = await fetch(`/api/jobs/${encodeURIComponent(String(jid))}/generate`, { method: "POST", headers: sharedHeaders });
          const payload = await readJsonOrText(res);
          if (!res.ok) {
            const msg = (payload && typeof payload === 'object' && (payload as any).error)
              ? String((payload as any).error)
              : (typeof payload === 'string' && payload.trim()) ? payload.trim() : "Échec de la génération";
            throw new Error(msg);
          }
          const json = (payload && typeof payload === 'object') ? (payload as any) : {};
          const imagesAll = Array.isArray(json?.images) ? (json.images as Array<string | null | undefined>) : [];
          const posesOrdered = Array.isArray(json?.poses) ? (json.poses as string[]) : null;
          const errorsByPose = (json && typeof json === 'object' ? (json as any).errors as Record<string, string> : null) || null;
          const posesForSuccess = posesOrdered ? imagesAll.map((img, i) => (img ? posesOrdered[i] : null)).filter(Boolean) as string[] : null;
          setGenPoses(posesForSuccess);
          setRequestedPoses(posesOrdered);
          setGenErrors(errorsByPose);
          try { const instr = Array.isArray(json?.instructions) ? (json.instructions as string[]) : null; setGenInstructions(instr); } catch {}
          try {
            const dbg = (json as any)?.debug?.mode;
            if (dbg === 'one-image' || dbg === 'two-images') setGenMode(dbg);
            const p = (json as any)?.debug?.provider;
            if (typeof p === 'string') setGenProvider(p);
          } catch {}
          return imagesAll.filter((u): u is string => typeof u === 'string' && !!u);
        }
        // Legacy fallback (should be rare)
        const res = await fetch("/api/generate-images", {
          method: "POST",
          headers: sharedHeaders,
          body: JSON.stringify({ imageDataUrl: item.source, environmentImageDataUrl: envImageForRequest, options: item.meta?.options, poses: item.meta?.options?.poses }),
        });
        const payload = await readJsonOrText(res);
        if (!res.ok) {
          const envMode = Boolean(item.meta?.env?.useDefault && item.meta?.env?.image);
          const baseMsg = (payload && typeof payload === 'object' && (payload as any).error) ? String((payload as any).error) : (typeof payload === 'string' && payload.trim()) ? payload.trim() : "Échec de la génération des images";
          const suggestions = envMode ? "\n\nAstuce: Google peut refuser le mode 2‑images. Vous pouvez: essayer sans environnement, modifier le prompt/style/poses, changer d’environnement, ou sélectionner manuellement OpenRouter dans Paramètres." : "";
          throw new Error(baseMsg + suggestions);
        }
        const json = (payload && typeof payload === 'object') ? (payload as any) : {};
        const imagesAll = Array.isArray(json?.images) ? (json.images as Array<string | null | undefined>) : [];
        const posesOrdered = Array.isArray(json?.poses) ? (json.poses as string[]) : null;
        const errorsByPose = (json && typeof json === 'object' ? (json as any).errors as Record<string, string> : null) || null;
        const posesForSuccess = posesOrdered ? imagesAll.map((img, i) => (img ? posesOrdered[i] : null)).filter(Boolean) as string[] : null;
        setGenPoses(posesForSuccess);
        setRequestedPoses(posesOrdered);
        setGenErrors(errorsByPose);
        try { const instr = Array.isArray(json?.instructions) ? (json.instructions as string[]) : null; setGenInstructions(instr); } catch {}
        try { const dbg = (json as any)?.debug?.mode; if (dbg === 'one-image' || dbg === 'two-images') setGenMode(dbg); } catch {}
        return imagesAll.filter((u): u is string => typeof u === 'string' && !!u);
      })()
        .then(async (res) => {
          const images = res as string[];
          // Dev echo
          try {
            if (process.env.NODE_ENV !== 'production') {
              if (Array.isArray(genInstructions)) console.debug('[jobs] instructions', genInstructions);
              if (genMode) console.debug('[jobs] mode', genMode);
            }
          } catch {}
          const next: Item = { ...item, results: images };
          setItem(next);
          upsertLocalHistory(next);
          return images;
        });

      const descReq = descEnabled
        ? fetch("/api/describe-photo", {
            method: "POST",
            headers: sharedHeaders,
            body: JSON.stringify({
              imageDataUrl: item.source,
              product: {
                brand: item.meta?.product.brand || null,
                model: item.meta?.product.model || null,
                gender: item.meta?.options.gender || null,
                size: item.meta?.options.size || null,
                condition: (item.meta?.product.condition as string | null) || null,
              },
            }),
          })
            .then(async (res) => {
              const payload = await readJsonOrText(res);
              if (!res.ok) {
                const base = (payload && typeof payload === 'object' && (payload as any).error)
                  ? String((payload as any).error)
                  : (typeof payload === 'string' && payload.trim()) ? payload.trim() : 'Échec de la génération de la description';
                throw new Error(base);
              }
              return (payload || {}) as Record<string, unknown>;
            })
        : Promise.resolve(null as Record<string, unknown> | null);

      const [imgSettled, descSettled] = await Promise.allSettled([imagesReq, descReq]);

      if (imgSettled.status !== "fulfilled") {
        throw new Error(imgSettled.reason instanceof Error ? imgSettled.reason.message : String(imgSettled.reason));
      }

      let finalWithImages: Item = { ...item, results: imgSettled.value };
      setItem(finalWithImages);
      upsertLocalHistory(finalWithImages);
      setProgress(descEnabled ? 70 : 90);

      if (descEnabled) {
        let descError: string | null = null;
        let data: Record<string, unknown> = {};
        if (descSettled.status !== "fulfilled") {
          descError = descSettled.reason instanceof Error ? descSettled.reason.message : String(descSettled.reason);
        } else {
          data = descSettled.value || {} as Record<string, unknown>;
        }
        // Auto-title if missing
        let nextTitle = (title || "").trim();
        if (!nextTitle) {
          const dTitle = typeof (data as any)?.title === "string" ? ((data as any).title as string) : "";
          if (dTitle) nextTitle = dTitle;
          else {
            const brand = (finalWithImages.meta?.product.brand || "").trim();
            const model = (finalWithImages.meta?.product.model || "").trim();
            const size = (finalWithImages.meta?.options.size || "").toString().toUpperCase();
            const base = [brand, model].filter(Boolean).join(" ");
            if (base) nextTitle = size ? `${base} (${size})` : base;
            if (!nextTitle) {
              const text = typeof (data as any)?.descriptionText === "string" ? ((data as any).descriptionText as string) : "";
              if (text) nextTitle = text.slice(0, 60).replace(/\s+\S*$/, "").trim();
            }
            if (!nextTitle) nextTitle = `Annonce du ${new Date(finalWithImages.createdAt).toLocaleDateString()}`;
          }
        }
        const withDesc: Item = { ...finalWithImages, description: data, title: nextTitle };
        setItem(withDesc);
        setTitle(withDesc.title || "");
        setDescText(typeof (data as any)?.descriptionText === "string" ? ((data as any).descriptionText as string) : "");
        upsertLocalHistory(withDesc);
        finalWithImages = withDesc;
        // If description failed, show banner but do not block results
        if (descError) {
          setError(`Description non générée: ${descError}`);
        }
      }

      // Persist to /api/history once after generation
      try {
        const saveBody = {
          id: finalWithImages.id,
          source: finalWithImages.source,
          results: finalWithImages.results,
          createdAt: finalWithImages.createdAt,
          description: finalWithImages.description ?? null,
        };
        await fetchWithTimeout("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saveBody) }, 2000);
      } catch {}

      // Saving/done
      setStep("saving");
      setProgress(96);
      setTimeout(() => { setStep("done"); setProgress(100); }, 200);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Étape: ${step === "generating" ? "Génération" : step === "prepare" ? "Préparation" : step === "saving" ? "Finalisation" : context} - ${msg || "Erreur inconnue"}`);
      setStep("error");
      setProgress(null);
    }
  }

  // Auto-start generation once item is hydrated and not yet started
  useEffect(() => {
    if (!started && !loadingItem && item && item.source) {
      setStarted(true);
      runGeneration();
    }
  }, [started, loadingItem, item?.source]);

  function retry() {
    setStarted(false);
    setError(null);
    setStep("idle");
    setProgress(null);
    runGeneration();
  }

  function saveDraft() {
    if (!item) return;
    const prevDesc = (item.description || null) as (null | { title?: string; [k: string]: unknown });
    const nextDesc: Record<string, unknown> | null = prevDesc ? { ...prevDesc, title: (title || "").trim() || prevDesc.title } : item.description ?? null;
    const updated: Item = { ...item, title: (title || "").trim() || item.title, description: nextDesc, status: "draft", updatedAt: Date.now() };
    setItem(updated);
    upsertLocalHistory(updated);
    try {
      fetchWithTimeout(
        "/api/history",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: updated.id, source: updated.source, results: updated.results, createdAt: updated.createdAt, description: updated.description ?? null }) },
        2000
      );
    } catch {}
    // Redirect to Mes annonces
    try { router.push("/annonces"); } catch {}
  }
  function saveFinal() {
    if (!item) return;
    const prevDesc = (item.description || null) as (null | { title?: string; [k: string]: unknown });
    const nextDesc: Record<string, unknown> | null = prevDesc ? { ...prevDesc, title: (title || "").trim() || prevDesc.title } : item.description ?? null;
    const updated: Item = { ...item, title: (title || "").trim() || item.title, description: nextDesc, status: "final", updatedAt: Date.now() };
    setItem(updated);
    upsertLocalHistory(updated);
    try {
      fetchWithTimeout(
        "/api/history",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: updated.id, source: updated.source, results: updated.results, createdAt: updated.createdAt, description: updated.description ?? null }) },
        2000
      );
    } catch {}
    // Redirect to Mes annonces
    try { router.push("/annonces"); } catch {}
  }

  async function saveTitleAndDescription() {
    if (!item) return;
    setSavingEdits(true);
    try {
      const prevDesc = (item.description || null) as (null | { title?: string; descriptionText?: string; [k: string]: unknown });
      const nextDesc: Record<string, unknown> = prevDesc ? { ...prevDesc, title: (title || "").trim() || prevDesc.title, descriptionText: descText } : { title: (title || "").trim() || undefined, descriptionText: descText };
      const updated: Item = { ...item, title: title?.trim() || item.title, description: nextDesc, updatedAt: Date.now() };
      setItem(updated);
      upsertLocalHistory(updated);
      // PATCH server
      try {
        const resp = await fetchWithTimeout(
          `/api/history/${encodeURIComponent(String(item.id))}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: nextDesc }) },
          2000
        );
        if (!resp.ok) {
          await fetchWithTimeout(
            "/api/history",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, source: item.source, results: item.results, createdAt: item.createdAt, description: nextDesc }) },
            2000
          );
        }
      } catch {}
      setEditDescMode(false);
    } finally {
      setSavingEdits(false);
    }
  }

  if (loadingItem) {
    return (
      <div className="mx-auto max-w-screen-md p-4">
        <LoadingScreen title="Chargement…" subtitle="Récupération de l’annonce" progress={null} />
      </div>
    );
  }

  if (!item || !item.source) {
    return (
      <div className="mx-auto max-w-screen-md p-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-6 text-center">
          <div className="text-sm text-gray-600 dark:text-gray-300">Annonce introuvable ou incomplète.</div>
          <button onClick={() => router.push("/creer") } className="mt-3 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Revenir à la création</button>
        </div>
      </div>
    );
  }

  const showLoading = step !== "done" && step !== "error";

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold uppercase tracking-wide">Résultat</h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Debug Gemini</span>
            <Toggle checked={showDebug} onChange={setShowDebug} ariaLabel="Afficher les entrées envoyées à Gemini" />
          </div>
        </div>
        {/* Titre: afficher uniquement hors chargement/erreur */}
        {!showLoading && step !== "error" ? (
          <div className="mb-3">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Titre de l’annonce</label>
            {!editingTitle ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-3 py-2">
                  <div className="truncate text-sm" title={title || "Ajouter un titre"}>{title || "Ajouter un titre"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  aria-label="Modifier le titre"
                  title="Modifier le titre"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={title}
                  onChange={(e)=>setTitle(e.target.value)}
                  maxLength={100}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>)=>{ if (e.key === 'Enter') { saveTitleAndDescription(); setEditingTitle(false); } if (e.key === 'Escape') { try { const desc = (item?.description||null) as (null|{ title?: string }); const t = (item?.title || desc?.title || "").toString(); setTitle(t); } catch {}; setEditingTitle(false); } }}
                  className="min-w-0 grow rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  placeholder="Ex: Robe Zara noire taille S"
                  autoFocus
                />
                <button onClick={async()=>{ await saveTitleAndDescription(); setEditingTitle(false); }} disabled={savingEdits} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{savingEdits?"Enregistrement…":"Enregistrer"}</button>
                <button
                  type="button"
                  onClick={() => { try { const desc = (item?.description||null) as (null|{ title?: string }); const t = (item?.title || desc?.title || "").toString(); setTitle(t); } catch {}; setEditingTitle(false); }}
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        ) : null}
        {showLoading ? (
          <LoadingScreen
            title="Génération en cours"
            subtitle={descEnabled ? "Images et description en parallèle" : "Génération des images"}
            progress={progress}
            stepLabel={
              step === "prepare" ? "Préparation"
              : step === "generating" ? (descEnabled ? "Images + description" : "Images")
              : step === "saving" ? "Finalisation"
              : "Initialisation"
            }
            onCancel={() => router.push("/creer")}
          />
        ) : step === "error" ? (
          <LoadingScreen
            title="Échec de la génération"
            subtitle="Vous pouvez réessayer ou revenir à la création"
            error={error || "Une erreur est survenue."}
            onRetry={retry}
            onCancel={() => router.push("/creer")}
          />
        ) : (
          <>
            {/* unified page: no alt job page link */}
            {showDebug && debugData ? (
              <div className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 p-3">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Entrées envoyées à Gemini</div>
                <div className="mb-2 text-xs text-gray-600 dark:text-gray-300">Mode: <span className="font-medium">{debugData.mode}</span> · Provider: <span className="font-medium">{debugData.provider}</span></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {debugData.mode === "two-images" ? (
                    <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-2 py-1 text-[11px] bg-gray-50 dark:bg-gray-800">Image 1 — Arrière‑plan</div>
                      <div className="relative h-40 bg-gray-50 dark:bg-gray-900">
                        {debugData.envImageUrl ? (
                          <Image src={debugData.envImageUrl} alt="Arrière‑plan envoyé" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" unoptimized />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-2 py-1 text-[11px] bg-gray-50 dark:bg-gray-800">{debugData.mode === "two-images" ? "Image 2" : "Image"} — Vêtement</div>
                    <div className="relative h-40 bg-gray-50 dark:bg-gray-900">
                      <Image src={debugData.mainImageUrl} alt="Vêtement envoyé" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" unoptimized />
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-3">
                  {debugData.instructionsByPose.map((it) => (
                    <div key={it.pose} className="rounded-md border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-800">
                        <div className="text-[11px] uppercase">Pose: <span className="font-medium">{it.pose}</span></div>
                        {/* Copy button */}
                        <button
                          type="button"
                          onClick={() => { try { navigator.clipboard.writeText(it.instruction); } catch {} }}
                          className="text-[11px] text-brand-700 hover:underline"
                        >Copier</button>
                      </div>
                      <textarea readOnly value={it.instruction} className="w-full min-h-24 resize-y bg-white dark:bg-gray-900 px-2 py-1 text-[12px] text-gray-700 dark:text-gray-200" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {error && step === "done" ? (
              <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">{error}</div>
            ) : null}
            <ResultsGallery sourceUrl={item.source} results={item.results} poses={genPoses || undefined} errorsByPose={genErrors || undefined} />
            <div className="mt-3">
              {!editDescMode ? (
                <>
                  <DescriptionPanel data={item.description || null} />
                  <div className="mt-2 flex items-center justify-end">
                    <button onClick={()=>setEditDescMode(true)} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Modifier la description</button>
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 p-3">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Description</label>
                  <textarea value={descText} onChange={(e)=>setDescText(e.target.value)} className="w-full min-h-40 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200" />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button onClick={()=>setEditDescMode(false)} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Annuler</button>
                    <button onClick={saveTitleAndDescription} disabled={savingEdits} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{savingEdits?"Enregistrement…":"Enregistrer"}</button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => router.push("/creer")} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Créer une autre annonce</button>
              <button type="button" onClick={saveDraft} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Enregistrer en brouillon</button>
              <button type="button" onClick={saveFinal} className="rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm transition bg-brand-600 text-white hover:bg-brand-700">Enregistrer en annonce définitive</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
