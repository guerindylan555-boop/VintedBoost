"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";

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

export default function GeneratePage() {
  const router = useRouter();
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poseOn, setPoseOn] = useState(false);
  const [pose, setPose] = useState("");
  const [styleOn, setStyleOn] = useState(false);
  const [style, setStyle] = useState("");
  const [envOn, setEnvOn] = useState(false);
  const [environment, setEnvironment] = useState("");
  const [language, setLanguage] = useState("fr");

  const canGenerate = useMemo(() => Boolean(imageDataUrl), [imageDataUrl]);

  function onFiles(files?: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    fileToDataURL(file).then(setImageDataUrl).catch(() => {
      setError("Impossible de lire l'image");
    });
  }

  function startGeneration() {
    if (!imageDataUrl) return;
    const payload = {
      imageDataUrl,
      pose: poseOn ? pose : "",
      style: styleOn ? style : "",
      environment: envOn ? environment : "",
      language,
    };
    try {
      sessionStorage.setItem("vb_generate_payload", JSON.stringify(payload));
    } catch {}
    router.push("/results");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="text-sm text-gray-600">
            Retour
          </button>
          <h1 className="text-base font-semibold">New listing</h1>
          <button
            onClick={() => router.push("/history")}
            className="text-sm text-blue-600"
          >
            History
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-sm flex-1 p-4 pb-24">
        <section className="rounded-2xl border border-gray-200 bg-white/70 backdrop-blur p-4 shadow-sm">
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
                Upload 1 photo (non-worn)
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
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </section>

        <section className="mt-6 grid gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={poseOn}
                onChange={(e) => setPoseOn(e.target.checked)}
              />
              Pose
            </label>
            {poseOn && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={pose}
                  onChange={(e) => setPose(e.target.value)}
                  placeholder="Describe pose"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    "Frontal",
                    "3/4",
                    "Profile",
                    "Hands in pockets",
                  ].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPose(p)}
                      className="rounded-full border border-gray-200 px-2 py-1"
                      type="button"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={styleOn}
                onChange={(e) => setStyleOn(e.target.checked)}
              />
              Style
            </label>
            {styleOn && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="Image style"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {["Studio neutral", "Editorial", "E-commerce clean"].map(
                    (p) => (
                      <button
                        key={p}
                        onClick={() => setStyle(p)}
                        className="rounded-full border border-gray-200 px-2 py-1"
                        type="button"
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={envOn}
                onChange={(e) => setEnvOn(e.target.checked)}
              />
              Environment
            </label>
            {envOn && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="Background/environment"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    "Light grey studio",
                    "White sweep",
                    "Soft shadow",
                  ].map((p) => (
                    <button
                      key={p}
                      onClick={() => setEnvironment(p)}
                      className="rounded-full border border-gray-200 px-2 py-1"
                      type="button"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="fr">French</option>
              <option value="en">English</option>
            </select>
          </div>
        </section>
      </main>

      <footer className="sticky bottom-0 border-t border-gray-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-screen-sm px-4 py-3">
          <button
            onClick={startGeneration}
            disabled={!canGenerate}
            className={cx(
              "w-full rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
              canGenerate
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-200 text-gray-500"
            )}
          >
            Generate images + description
          </button>
          <button
            type="button"
            className="mt-2 block w-full text-center text-sm text-gray-500"
          >
            Advanced
          </button>
        </div>
      </footer>
    </div>
  );
}
