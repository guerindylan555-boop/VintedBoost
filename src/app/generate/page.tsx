"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

function fileToDataURL(file: File): Promise<string> {
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
  const [poseOn, setPoseOn] = useState(false);
  const [pose, setPose] = useState("");
  const [styleOn, setStyleOn] = useState(false);
  const [style, setStyle] = useState("");
  const [envOn, setEnvOn] = useState(false);
  const [environment, setEnvironment] = useState("");

  function onFiles(files?: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    fileToDataURL(file).then(setImageDataUrl).catch(() => {
      // ignore errors
    });
  }

  function handleGenerate() {
    if (!imageDataUrl) return;
    const pending = {
      source: imageDataUrl,
      options: {
        pose: poseOn ? pose : undefined,
        style: styleOn ? style : undefined,
        environment: envOn ? environment : undefined,
      },
    };
    try {
      localStorage.setItem("vintedboost_pending", JSON.stringify(pending));
    } catch {}
    router.push("/results");
  }

  const canGenerate = Boolean(imageDataUrl);

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div />
        <h1 className="text-base font-medium">New listing</h1>
        <a href="/history" className="text-sm text-blue-600">
          History
        </a>
      </header>
      <main className="flex-1 p-4 space-y-6">
        <section>
          <div
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt="upload"
                className="mx-auto max-h-60 object-contain"
              />
            ) : (
              <div className="text-sm text-gray-500">
                Upload 1 photo (non‑worn)
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={poseOn}
                onChange={() => setPoseOn(!poseOn)}
              />
              Pose
            </label>
            {poseOn && (
              <div className="mt-2 space-y-2">
                <input
                  value={pose}
                  onChange={(e) => setPose(e.target.value)}
                  placeholder="Describe pose"
                  className="w-full rounded border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    "Frontal",
                    "3/4",
                    "Profile",
                    "Hands in pockets",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setPose(chip)}
                      className="rounded-full border px-3 py-1 text-xs"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={styleOn}
                onChange={() => setStyleOn(!styleOn)}
              />
              Style
            </label>
            {styleOn && (
              <div className="mt-2 space-y-2">
                <input
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="Image style"
                  className="w-full rounded border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    "Studio neutral",
                    "Editorial",
                    "E‑commerce clean",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setStyle(chip)}
                      className="rounded-full border px-3 py-1 text-xs"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={envOn}
                onChange={() => setEnvOn(!envOn)}
              />
              Environment
            </label>
            {envOn && (
              <div className="mt-2 space-y-2">
                <input
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="Background/environment"
                  className="w-full rounded border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    "Light grey studio",
                    "White sweep",
                    "Soft shadow",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setEnvironment(chip)}
                      className="rounded-full border px-3 py-1 text-xs"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <label className="block text-sm font-medium mb-1">Language</label>
          <select className="w-full rounded border px-3 py-2 text-sm">
            <option>French</option>
          </select>
        </section>
      </main>
      <footer className="sticky bottom-0 border-t bg-white p-4">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
        >
          Generate images + description
        </button>
        <div className="mt-2 text-center">
          <a href="#" className="text-sm text-gray-600">
            Advanced
          </a>
        </div>
      </footer>
    </div>
  );
}
