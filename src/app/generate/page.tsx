"use client";

import { useState, useRef } from "react";
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [reference, setReference] = useState("");
  const [poseOn, setPoseOn] = useState(false);
  const [pose, setPose] = useState("");
  const [styleOn, setStyleOn] = useState(false);
  const [style, setStyle] = useState("");
  const [envOn, setEnvOn] = useState(false);
  const [env, setEnv] = useState("");
  const [language, setLanguage] = useState("fr");
  const [addNote, setAddNote] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const canGenerate = photos.length > 0 && reference.trim().length > 0;

  function onFiles(files?: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 3 - photos.length);
    Promise.all(arr.map(fileToDataURL)).then((urls) => {
      setPhotos((p) => [...p, ...urls].slice(0, 3));
    });
  }

  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  function startGenerate() {
    const payload = {
      photos,
      reference,
      pose: poseOn ? pose : "",
      style: styleOn ? style : "",
      environment: envOn ? env : "",
      language,
      addNote,
    };
    try {
      localStorage.setItem("vb_pending_generate", JSON.stringify(payload));
    } catch {}
    router.push("/run");
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="sticky top-0 border-b bg-white px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-semibold">New listing</div>
        <a href="/history" className="text-sm text-blue-600">History</a>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <div className="rounded-xl border border-gray-300 p-4">
            <div className="text-sm font-medium mb-2">Upload 1–3 photos (non‑worn)</div>
            <div className="flex gap-2 mb-3">
              {photos.map((p, i) => (
                <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden border">
                  <img src={p} alt="upload" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black/70 text-white text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < 3 && (
                <button
                  onClick={() => fileInput.current?.click()}
                  className="h-20 w-20 rounded-lg border border-dashed flex items-center justify-center text-gray-500"
                >
                  +
                </button>
              )}
            </div>
            <input
              type="file"
              multiple
              accept="image/*"
              ref={fileInput}
              onChange={(e) => onFiles(e.target.files)}
              className="hidden"
            />
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference (brand/model/EAN or link)"
              className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </section>

        <section className="space-y-4">
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
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {['Frontal','3/4','Profile','Hands in pockets'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setPose(c)}
                      className="rounded-full border px-2 py-1"
                    >
                      {c}
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
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {['Studio neutral','Editorial','E‑commerce clean'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setStyle(c)}
                      className="rounded-full border px-2 py-1"
                    >
                      {c}
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
                checked={envOn}
                onChange={(e) => setEnvOn(e.target.checked)}
              />
              Environment
            </label>
            {envOn && (
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                  placeholder="Background/environment"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {['Light grey studio','White sweep','Soft shadow'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setEnv(c)}
                      className="rounded-full border px-2 py-1"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="fr">French</option>
              <option value="en">English</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addNote}
              onChange={(e) => setAddNote(e.target.checked)}
            />
            Add note: Photos ‘porté’ generated by AI
          </label>
        </section>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4">
        <button
          onClick={startGenerate}
          disabled={!canGenerate}
          className={cx(
            "w-full rounded-md px-4 py-3 text-sm font-semibold",
            canGenerate ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
          )}
        >
          Generate images + description
        </button>
        <div className="mt-2 text-center">
          <button
            onClick={() => alert("Advanced options coming soon")}
            className="text-sm text-gray-500"
          >
            Advanced
          </button>
        </div>
      </footer>
    </div>
  );
}

