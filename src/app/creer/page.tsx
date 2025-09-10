"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Toggle from "@/components/Toggle";
import { buildInstruction, type MannequinOptions, type Pose } from "@/lib/prompt";

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined") {
      const maybe = (crypto as unknown as { randomUUID?: () => string })?.randomUUID;
      if (typeof maybe === "function") {
        const id = maybe();
        if (id) return id;
      }
    }
  } catch {}
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Small utility to avoid UI hanging on slow API routes
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

type HistItem = {
  id: string;
  createdAt: number | string;
  source: string;
  results: string[];
  description?: Record<string, unknown> | null;
  updatedAt?: number | string;
  status?: "draft" | "final";
  meta?: {
    options: MannequinOptions;
    product: { brand: string; model: string; condition?: string };
    descEnabled: boolean;
  };
  title?: string;
};

export default function CreatePage() {
  const router = useRouter();
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outImages, setOutImages] = useState<string[]>([]);
  const fileInputGalleryRef = useRef<HTMLInputElement | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  // no local results rendering; results are shown on /resultats/[id]
  const [, setHistory] = useState<HistItem[]>([]);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);

  const [product, setProduct] = useState<{ brand: string; model: string; condition?: string }>(
    { brand: "", model: "", condition: "" }
  );
  const [title, setTitle] = useState("");

  const [options, setOptions] = useState<MannequinOptions>({
    gender: "femme",
    size: "xs",
    pose: "face",
    background: "chambre",
    style: "amateur",
  });
  const [showPrompt, setShowPrompt] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(true);
  const [imageOptsEnabled, setImageOptsEnabled] = useState(true);
  const [descEnabled, setDescEnabled] = useState(false);
  const [editCollapsed, setEditCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  // description/result generation is deferred to /resultats/[id]

  const GENDERS = ["femme", "homme"] as const;
  const SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"] as const;
  const CONDITIONS = ["neuf", "très bon état", "bon état", "satisfaisant"] as const;
  const POSES: Pose[] = ["face", "trois-quarts", "profil"];
  const STYLES = ["professionnel", "amateur"] as const;
  const BACKGROUNDS = ["chambre", "salon", "studio", "extérieur"] as const;

  const canGenerate = useMemo(
    () => Boolean(imageDataUrl && !generating),
    [imageDataUrl, generating]
  );

  const promptPreview = useMemo(() => {
    const selected = (options.poses && options.poses.length > 0)
      ? options.poses[0]
      : (options.pose as Pose | undefined) || "face";
    return buildInstruction({ ...options, pose: selected }, undefined, "aperçu");
  }, [options]);

  // Helpers: local history upsert + last
  function upsertLocalHistory(partial: HistItem) {
    setHistory((prev) => {
      const idx = prev.findIndex((x) => x.id === partial.id);
      const next = [...prev];
      if (idx >= 0) next[idx] = { ...next[idx], ...partial, updatedAt: Date.now() };
      else next.unshift({ ...partial, updatedAt: Date.now() });
      try { localStorage.setItem("vintedboost_history", JSON.stringify(next)); } catch {}
      try { localStorage.setItem("vintedboost_last", JSON.stringify(next[0])); } catch {}
      return next;
    });
  }

  async function persistServer(item: HistItem) {
    try {
      await fetchWithTimeout(
        "/api/history",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            source: item.source,
            results: item.results || [],
            createdAt: item.createdAt,
            description: item.description ?? null,
          }),
        },
        2000
      );
    } catch {}
  }

  function onFiles(files?: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    fileToDataURL(file)
      .then((dataUrl) => {
        setImageDataUrl(dataUrl);
        setError(null);
        setOutImages([]);
        setEditCollapsed(false);
        // Create or update draft immediately
        setCurrentItemId((curr) => {
          const id = curr || newId();
          const item: HistItem = {
            id,
            createdAt: curr ? Date.now() : Date.now(),
            source: dataUrl,
            results: [],
            description: null,
            status: "draft",
            title: title?.trim() || undefined,
          };
          upsertLocalHistory(item);
          // Best-effort server persist
          persistServer(item);
          return id;
        });
      })
      .catch(() => setError("Impossible de lire l'image"));
  }

  function generate() {
    if (!imageDataUrl) return;
    setGenerating(true);
    setError(null);
    setEditCollapsed(true);
    setOptionsOpen(false);
    // Ensure we have an item id, and store snapshot meta
    let id = currentItemId;
    if (!id) id = newId();
    const item: HistItem = {
      id,
      createdAt: Date.now(),
      source: imageDataUrl,
      results: [],
      description: null,
      status: "draft",
      meta: {
        options,
        product,
        descEnabled,
      },
      title: title?.trim() || undefined,
    };
    upsertLocalHistory(item);
    persistServer(item);
    setCurrentItemId(id);
    // Navigate to results page where generation happens with loading screen
    try { router.push(`/resultats/${encodeURIComponent(String(id))}`); } finally {
      setGenerating(false);
    }
  }

  function onToggleDesc(next: boolean) {
    setDescEnabled(next);
    if (next) setOptionsOpen(true);
  }

  // description generation moved to /resultats/[id]

  // Persist UI preferences only (not last item)
  useEffect(() => {
    try {
      const rawOpts = localStorage.getItem("vintedboost_options");
      if (rawOpts) {
        try {
          const o = JSON.parse(rawOpts) || {};
          if (o.morphology && !o.size) o.size = o.morphology;
          delete o.customText;
          delete o.subject;
          setOptions((prev) => ({ ...prev, ...o }));
        } catch {}
      }
      const rawImgOptsEnabled = localStorage.getItem("vintedboost_image_options_enabled");
      if (rawImgOptsEnabled != null) {
        setImageOptsEnabled(rawImgOptsEnabled === "true");
        setOptionsOpen(rawImgOptsEnabled === "true");
      }
      const rawProd = localStorage.getItem("vintedboost_product");
      if (rawProd) {
        try {
          const p = JSON.parse(rawProd) || {};
          setProduct((prev) => ({ ...prev, ...p }));
        } catch {}
      }
      const rawDescEnabled = localStorage.getItem("vintedboost_desc_enabled");
      if (rawDescEnabled != null) {
        const enabled = rawDescEnabled === "true";
        setDescEnabled(enabled);
        if (enabled) setOptionsOpen(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("vintedboost_options", JSON.stringify(options)); } catch {}
  }, [options]);
  useEffect(() => {
    try { localStorage.setItem("vintedboost_product", JSON.stringify(product)); } catch {}
  }, [product]);
  useEffect(() => {
    try { localStorage.setItem("vintedboost_image_options_enabled", String(imageOptsEnabled)); } catch {}
  }, [imageOptsEnabled]);
  useEffect(() => {
    try { localStorage.setItem("vintedboost_desc_enabled", String(descEnabled)); } catch {}
  }, [descEnabled]);

  // Save actions
  function saveDraft() {
    if (!imageDataUrl || !currentItemId) return;
    const item: HistItem = {
      id: currentItemId,
      createdAt: Date.now(),
      source: imageDataUrl,
      results: outImages,
      status: "draft",
    };
    upsertLocalHistory(item);
    persistServer(item);
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 to-white text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-screen-md px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold uppercase tracking-widest">CRÉER</h1>
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">Nouvelle annonce</span>
          </div>
          <div className="flex items-center gap-3" />
        </div>
      </header>

      <main className="mx-auto max-w-screen-md p-4">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Carte: Annonce (upload, toggle description, options) */}
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-1 md:row-start-1">
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
                    placeholder="Ex: Robe Zara noire taille S"
                    value={title}
                    onChange={(e)=>setTitle(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>)=>{ if (e.key==='Enter') setEditingTitle(false); if (e.key==='Escape') { setEditingTitle(false); } }}
                    maxLength={100}
                    className="min-w-0 grow rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setEditingTitle(false)}
                    className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Valider
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTitle(false)}
                    className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wide">Annonce</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!imageDataUrl) fileInputCameraRef.current?.click();
                    else fileInputGalleryRef.current?.click();
                  }}
                  aria-label={imageDataUrl ? "Téléverser une image" : "Prendre une photo"}
                  title={imageDataUrl ? "Téléverser" : "Prendre une photo"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                >
                  {imageDataUrl ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M3 16.5V18A2.25 2.25 0 0 0 5.25 20.25H18.75A2.25 2.25 0 0 0 21 18V16.5" />
                      <path d="M7.5 10.5 12 6l4.5 4.5" />
                      <path d="M12 6v12" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M9 7l1.5-2h3L15 7h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h3z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageDataUrl(null);
                    setOutImages([]);
                    setError(null);
                    setCurrentItemId(null);
                  }}
                  aria-label="Réinitialiser"
                  title="Réinitialiser"
                  disabled={!imageDataUrl}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M16.023 9.348h4.992V4.356" />
                    <path d="M21.015 12.97a8.25 8.25 0 1 1-2.215-5.63" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); onFiles(e.dataTransfer.files); }}
              className={cx(
                "relative w-full aspect-[4/3] rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden",
                dragActive ? "border-brand-500 bg-brand-50/40 dark:bg-brand-900/20" : "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
              )}
            >
              {imageDataUrl ? (
                <Image src={imageDataUrl} alt="source" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" unoptimized />
              ) : (
                <div className="text-center text-sm text-gray-600">
                  Glissez-déposez l’image du vêtement non porté
                  <div className="mt-2">ou</div>
                  <button onClick={() => fileInputGalleryRef.current?.click()} className="mt-2 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-50">
                    Choisir un fichier
                  </button>
                </div>
              )}
              {/* Gallery picker */}
              <input ref={fileInputGalleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => onFiles(e.target.files)} className="hidden" />
              {/* Camera capture */}
              <input ref={fileInputCameraRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={(e) => onFiles(e.target.files)} className="hidden" />
            </div>

            <div className={cx("mt-4", editCollapsed ? "hidden" : "block")}> 
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Générer la description</div>
                <Toggle checked={descEnabled} onChange={onToggleDesc} ariaLabel="Activer la génération de la description" />
              </div>
              {descEnabled ? (
                <div className="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Marque</label>
                      <input value={product.brand} onChange={(e) => setProduct((p) => ({ ...p, brand: e.target.value }))} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-gray-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Modèle</label>
                      <input value={product.model} onChange={(e) => setProduct((p) => ({ ...p, model: e.target.value }))} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-gray-100" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">État</label>
                    <div className="flex flex-wrap gap-2">
                      {CONDITIONS.map((c) => (
                        <button key={c} onClick={() => setProduct((p) => ({ ...p, condition: c }))} className={cx("rounded-md border px-2 py-1 text-xs uppercase", product.condition === c ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800")}>{c}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Options image */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Options image</div>
                  <Toggle checked={imageOptsEnabled} onChange={setImageOptsEnabled} ariaLabel="Afficher les options image" />
                </div>
                {imageOptsEnabled ? (
                  <div className={cx("grid grid-cols-1 gap-3", optionsOpen ? "opacity-100" : "opacity-100")}> 
                    <div>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Genre</div>
                      <div className="flex flex-wrap gap-2">
                        {GENDERS.map((g) => (
                          <button key={g} onClick={() => setOptions((o) => ({ ...o, gender: g }))} className={cx("rounded-md border px-2 py-1 text-xs uppercase", options.gender === g ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800")}>{g}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Taille</div>
                      <div className="flex flex-wrap gap-2">
                        {SIZES.map((s) => (
                          <button key={s} onClick={() => setOptions((o) => ({ ...o, size: s }))} className={cx("rounded-md border px-2 py-1 text-xs uppercase", options.size === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800")}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Pose</div>
                        <button
                          type="button"
                          onClick={() => setOptions((o) => ({ ...o, poses: [...POSES], pose: undefined }))}
                          className="text-[10px] uppercase text-brand-700 hover:underline"
                        >
                          Tout sélectionner
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {POSES.map((p) => {
                          const selectedList = Array.isArray(options.poses) ? options.poses : [];
                          const isSelected = selectedList.includes(p) || options.pose === p;
                          return (
                            <button
                              key={p}
                              onClick={() =>
                                setOptions((o) => {
                                  const current = Array.isArray(o.poses) ? [...o.poses] : (o.pose ? [o.pose as Pose] : []);
                                  const idx = current.indexOf(p);
                                  if (idx >= 0) current.splice(idx, 1);
                                  else current.push(p);
                                  // Ensure at least one selected; if user deselects last, fallback to face
                                  const next = current.length > 0 ? current : ["face"];
                                  return { ...o, poses: next, pose: undefined };
                                })
                              }
                              className={cx(
                                "rounded-md border px-2 py-1 text-xs uppercase",
                                isSelected ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                              )}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Style</div>
                      <div className="flex flex-wrap gap-2">
                        {STYLES.map((s) => (
                          <button key={s} onClick={() => setOptions((o) => ({ ...o, style: s }))} className={cx("rounded-md border px-2 py-1 text-xs uppercase", options.style === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800")}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Environnement / Fond</div>
                      <div className="flex flex-wrap gap-2">
                        {BACKGROUNDS.map((b) => (
                          <button key={b} onClick={() => setOptions((o) => ({ ...o, background: b }))} className={cx("rounded-md border px-2 py-1 text-xs uppercase", options.background === b ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800")}>{b}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Texte d’instruction</div>
                        <Toggle checked={showPrompt} onChange={setShowPrompt} ariaLabel="Afficher le texte d’instruction" />
                      </div>
                      {showPrompt && (
                        <textarea readOnly value={promptPreview} className="w-full min-h-24 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-200" />
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => { if (canGenerate) generate(); }}
                disabled={!canGenerate}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
                  canGenerate ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                )}
              >
                {generating ? "Génération…" : descEnabled ? "Générer image + description" : "Générer l’image"}
              </button>
            </div>
            {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

            {imageDataUrl ? (
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={saveDraft}
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Enregistrer le brouillon
                </button>
              </div>
            ) : null}
          </section>

          {/* Les résultats ne sont plus affichés ici; voir /resultats/[id] */}
        </div>
      </main>
    </div>
  );
}
