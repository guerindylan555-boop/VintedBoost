"use client";

import { useMemo, useRef, useState } from "react";

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

  const canGenerate = useMemo(
    () => Boolean(imageDataUrl && !generating),
    [imageDataUrl, generating]
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
        body: JSON.stringify({ imageDataUrl, options: {}, count: 1 }),
      });
      const imgJson = await imgRes.json();
      if (!imgRes.ok) throw new Error(imgJson?.error || "Erreur images");
      setOutImages(imgJson.images || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Erreur");
    } finally {
      setGenerating(false);
    }
  }

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
      </main>
    </div>
  );
}
