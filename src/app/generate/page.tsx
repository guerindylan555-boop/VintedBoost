"use client";

import { useMemo, useRef, useState } from "react";
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

export default function Generate() {
  const router = useRouter();
  const [images, setImages] = useState<string[]>([]);
  const [reference, setReference] = useState("");
  const [poseEnabled, setPoseEnabled] = useState(false);
  const [pose, setPose] = useState("");
  const [styleEnabled, setStyleEnabled] = useState(false);
  const [style, setStyle] = useState("");
  const [envEnabled, setEnvEnabled] = useState(false);
  const [environment, setEnvironment] = useState("");
  const [language, setLanguage] = useState("fr");
  const [note, setNote] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canGenerate = useMemo(
    () => images.length > 0 && reference.trim().length > 0 && !generating,
    [images, reference, generating]
  );

  function onFiles(files?: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 3 - images.length);
    Promise.all(arr.map(fileToDataURL)).then((urls) => {
      setImages((prev) => [...prev, ...urls].slice(0, 3));
    });
  }

  async function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      const imgRes = await fetch("/api/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: images[0],
          options: {
            pose: poseEnabled ? pose : undefined,
            style: styleEnabled ? style : undefined,
            environment: envEnabled ? environment : undefined,
          },
          count: 3,
        }),
      });
      const imgJson = await imgRes.json();
      if (!imgRes.ok) throw new Error(imgJson?.error || "Erreur images");
      const outImages = (imgJson.images || []) as string[];
      const item = {
        id: `${Date.now()}`,
        createdAt: Date.now(),
        source: images[0],
        results: outImages,
      };
      try {
        localStorage.setItem("vintedboost_last", JSON.stringify(item));
        const rawHist = localStorage.getItem("vintedboost_history");
        const hist = rawHist ? JSON.parse(rawHist) : [];
        const newHist = [item, ...hist].slice(0, 50);
        localStorage.setItem("vintedboost_history", JSON.stringify(newHist));
      } catch {}
      router.push("/results");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Erreur");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto w-full max-w-screen-sm px-4 py-3 flex items-center justify-between">
          <div></div>
          <h1 className="text-lg font-semibold">New listing</h1>
          <button
            onClick={() => router.push("/history")}
            className="text-sm text-blue-600"
          >
            History
          </button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-screen-sm p-4 space-y-6">
        <section>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFiles(e.dataTransfer.files);
            }}
            className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center"
          >
            {images.length === 0 ? (
              <div className="text-sm text-gray-600">
                Upload 1–3 photos (non-worn)
                <div className="mt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md border px-3 py-1 text-sm"
                  >
                    Choose files
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    <img
                      src={img}
                      alt={`src-${i}`}
                      className="h-24 w-24 object-cover rounded-md border"
                    />
                    <button
                      onClick={() =>
                        setImages((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-black/70 text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {images.length < 3 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="h-24 w-24 flex items-center justify-center rounded-md border border-dashed text-sm text-gray-500"
                  >
                    +
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onFiles(e.target.files)}
              className="hidden"
            />
          </div>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Reference (brand/model/EAN or link)"
            className="mt-4 w-full rounded-md border px-3 py-2 text-sm"
          />
        </section>

        <section className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={poseEnabled}
                onChange={(e) => setPoseEnabled(e.target.checked)}
              />
              Pose
            </label>
            {poseEnabled && (
              <div className="mt-2 space-y-2">
                <input
                  value={pose}
                  onChange={(e) => setPose(e.target.value)}
                  placeholder="Describe pose"
                  className="w-full rounded-md border px-3 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {['Frontal', '3/4', 'Profile', 'Hands in pockets'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPose(p)}
                      className="rounded-full bg-gray-100 px-2 py-1 text-xs"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={styleEnabled}
                onChange={(e) => setStyleEnabled(e.target.checked)}
              />
              Style
            </label>
            {styleEnabled && (
              <div className="mt-2 space-y-2">
                <input
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="Image style"
                  className="w-full rounded-md border px-3 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {['Studio neutral', 'Editorial', 'E-commerce clean'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setStyle(p)}
                      className="rounded-full bg-gray-100 px-2 py-1 text-xs"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={envEnabled}
                onChange={(e) => setEnvEnabled(e.target.checked)}
              />
              Environment
            </label>
            {envEnabled && (
              <div className="mt-2 space-y-2">
                <input
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="Background/environment"
                  className="w-full rounded-md border px-3 py-1 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {['Light grey studio', 'White sweep', 'Soft shadow'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEnvironment(p)}
                      className="rounded-full bg-gray-100 px-2 py-1 text-xs"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="shrink-0">Language:</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="fr">French</option>
              <option value="en">English</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={note}
              onChange={(e) => setNote(e.target.checked)}
            />
            Add note: Photos &apos;porté&apos; generated by AI
          </label>
        </section>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4">
        <button
          onClick={generate}
          disabled={!canGenerate}
          className={cx(
            "w-full rounded-md px-4 py-2 text-sm font-semibold shadow-sm",
            canGenerate
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-500"
          )}
        >
          {generating ? "Generating…" : "Generate images + description"}
        </button>
        <div className="mt-2 text-center text-sm text-blue-600">Advanced</div>
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </footer>
    </div>
  );
}

