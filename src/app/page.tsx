"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildInstruction, type MannequinOptions } from "@/lib/prompt";

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

export default function Home() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outImages, setOutImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [history, setHistory] = useState<
    { id: string; createdAt: number; source: string; results: string[] }[]
  >([]);

  const [options, setOptions] = useState<MannequinOptions>({
    gender: "femme",
    size: "m",
    pose: "face",
    background: "studio",
    style: "professionnel",
  });
  const [showPrompt, setShowPrompt] = useState(false);

  const GENDERS = ["femme", "homme"] as const;
  const SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"] as const;
  const POSES = ["face", "trois-quarts", "profil", "assis", "marche"] as const;
  const STYLES = ["professionnel", "amateur"] as const;
  const BACKGROUNDS = ["chambre", "salon", "studio", "extérieur"] as const;

  const canGenerate = useMemo(
    () => Boolean(imageDataUrl && !generating),
    [imageDataUrl, generating]
  );

  const promptPreview = useMemo(
    () => buildInstruction(options || {}, undefined, "aperçu"),
    [options]
  );

  function onFiles(files?: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    fileToDataURL(file).then(setImageDataUrl).catch(() => {
      setError("Impossible de lire l'image");
    });
  }

  async function generate() {
    if (!imageDataUrl) return;
    setGenerating(true);
    setError(null);
    setOutImages([]);
    try {
      const imgRes = await fetch("/api/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, options, count: 1 }),
      });
      const imgJson = await imgRes.json();
      if (!imgRes.ok) throw new Error(imgJson?.error || "Erreur images");
      const images = (imgJson.images || []) as string[];
      setOutImages(images);
      const item = {
        id: `${Date.now()}`,
        createdAt: Date.now(),
        source: imageDataUrl,
        results: images,
      };
      setHistory((h) => [item, ...h].slice(0, 50));
      try {
        localStorage.setItem("vintedboost_last", JSON.stringify(item));
      } catch {}

      // Persist on server (Vercel Postgres)
      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
      } catch {}
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Erreur");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    try {
      const rawHist = localStorage.getItem("vintedboost_history");
      if (rawHist) setHistory(JSON.parse(rawHist));
      const rawLast = localStorage.getItem("vintedboost_last");
      if (rawLast) {
        const last = JSON.parse(rawLast);
        if (last?.source) setImageDataUrl(last.source);
        if (Array.isArray(last?.results)) setOutImages(last.results);
      }
      const rawOpts = localStorage.getItem("vintedboost_options");
      if (rawOpts) {
        try {
          const o = JSON.parse(rawOpts) || {};
          // migration: support older keys
          if (o.morphology && !o.size) o.size = o.morphology;
          delete o.customText;
          delete o.subject; // drop legacy subject
          setOptions((prev) => ({ ...prev, ...o }));
        } catch {}
      }
    } catch {}
    // Attempt to hydrate from server history as source of truth when available
    (async () => {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.items)) setHistory(data.items);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_history", JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_options", JSON.stringify(options));
    } catch {}
  }, [options]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b border-gray-100">
        <div className="mx-auto max-w-screen-md px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">VintedBoost — Try‑On</h1>
          <div className="text-xs text-gray-500">MVP</div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-md p-4">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 bg-white/70 backdrop-blur p-4 shadow-sm">
            <h2 className="text-base font-semibold mb-3">Votre photo</h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                onFiles(e.dataTransfer.files);
              }}
              className={cx(
                "relative w-full aspect-[4/3] rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden",
                dragActive ? "border-blue-500 bg-blue-50/40" : "border-gray-300 bg-gray-50"
              )}
            >
              {imageDataUrl ? (
                <img
                  src={imageDataUrl}
                  alt="source"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="text-center text-sm text-gray-600">
                  Glissez-déposez l’image du vêtement non porté
                  <div className="mt-2">ou</div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
                  >
                    Choisir un fichier
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => onFiles(e.target.files)}
                className="hidden"
              />
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Options d’image</h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="mb-1 text-xs text-gray-600">Genre</div>
                  <div className="flex flex-wrap gap-2">
                    {GENDERS.map((g) => (
                      <button
                        key={g}
                        onClick={() => setOptions((o) => ({ ...o, gender: g }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs",
                          options.gender === g
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-gray-600">Taille du vêtement</div>
                  <div className="flex flex-wrap gap-2">
                    {SIZES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setOptions((o) => ({ ...o, size: s }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs",
                          options.size === s
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        )}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-gray-600">Pose</div>
                  <div className="flex flex-wrap gap-2">
                    {POSES.map((p) => (
                      <button
                        key={p}
                        onClick={() => setOptions((o) => ({ ...o, pose: p }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs",
                          options.pose === p
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-gray-600">Style d’image</div>
                  <div className="flex flex-wrap gap-2">
                    {STYLES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setOptions((o) => ({ ...o, style: s }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs",
                          options.style === s
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs text-gray-600">Environnement / Fond</div>
                  <div className="flex flex-wrap gap-2">
                    {BACKGROUNDS.map((b) => (
                      <button
                        key={b}
                        onClick={() => setOptions((o) => ({ ...o, background: b }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs",
                          options.background === b
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={showPrompt}
                      onChange={(e) => setShowPrompt(e.target.checked)}
                    />
                    Afficher le texte d’instruction envoyé au modèle
                  </label>
                  {showPrompt && (
                    <textarea
                      readOnly
                      value={promptPreview}
                      className="w-full min-h-24 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={generate}
                disabled={!canGenerate}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
                  canGenerate
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-200 text-gray-500"
                )}
              >
                {generating ? "Génération…" : "Générer l’image portée"}
              </button>
              {imageDataUrl && (
                <button
                  onClick={() => {
                    setImageDataUrl(null);
                    setOutImages([]);
                    setError(null);
                  }}
                  className="inline-flex shrink-0 items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            {error ? (
              <div className="mt-3 text-sm text-red-600">{error}</div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white/70 backdrop-blur p-4 shadow-sm">
            <h2 className="text-base font-semibold mb-3">Résultat</h2>
            {outImages.length === 0 ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-gray-500">
                Aucune image générée pour l’instant.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {outImages.map((u, i) => (
                  <a
                    key={i}
                    href={u}
                    download={`tryon_${i + 1}.png`}
                    className="group relative block overflow-hidden rounded-xl border border-gray-200"
                    title="Télécharger"
                  >
                    <img
                      src={u}
                      alt={`sortie ${i + 1}`}
                      className="w-full object-cover"
                      style={{ aspectRatio: "4 / 5" }}
                    />
                    <div className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                      Télécharger
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white/70 backdrop-blur p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Historique</h2>
            {history.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    try {
                      const blob = new Blob([
                        JSON.stringify(history, null, 2),
                      ], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "vintedboost_history.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {}
                  }}
                  className="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
                >
                  Exporter
                </button>
                <button
                  onClick={() => setHistory([])}
                  className="text-xs text-gray-500 hover:text-red-600"
                >
                  Effacer
                </button>
              </div>
            )}
          </div>
          {history.length === 0 ? (
            <div className="text-sm text-gray-500">
              Aucune génération enregistrée pour l’instant.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setImageDataUrl(h.source);
                    setOutImages(h.results || []);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 p-2 text-left hover:bg-gray-50"
                >
                  <img
                    src={h.source}
                    alt="source"
                    className="h-16 w-16 shrink-0 rounded-md border object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {new Date(h.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span>{h.results.length} résultat(s)</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
