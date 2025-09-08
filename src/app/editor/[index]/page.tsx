"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface Description {
  title?: string;
  bulletPoints?: string[];
  descriptionText?: string;
  [key: string]: unknown;
}

interface HistoryItem {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
  description?: Description;
}

export default function EditorPage() {
  const router = useRouter();
  const params = useParams<{ index: string }>();
  const idx = Number(params.index);
  const [data, setData] = useState<HistoryItem | null>(null);
  const [version, setVersion] = useState(1);
  const [poseOn, setPoseOn] = useState(false);
  const [pose, setPose] = useState("");
  const [styleOn, setStyleOn] = useState(false);
  const [style, setStyle] = useState("");
  const [envOn, setEnvOn] = useState(false);
  const [environment, setEnvironment] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("vb_last_result");
    const rawReq = sessionStorage.getItem("vb_generate_payload");
    if (!raw || !rawReq) {
      router.replace("/generate");
      return;
    }
    const res = JSON.parse(raw);
    setData(res);
    const req = JSON.parse(rawReq);
    if (req.pose) {
      setPoseOn(true);
      setPose(req.pose);
    }
    if (req.style) {
      setStyleOn(true);
      setStyle(req.style);
    }
    if (req.environment) {
      setEnvOn(true);
      setEnvironment(req.environment);
    }
  }, [router]);

  async function generateVariation() {
    if (!data) return;
    const base = data.results[idx];
    try {
      const res = await fetch("/api/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: base,
          options: { pose, style, environment },
          count: 1,
        }),
      });
      const json = await res.json();
      if (Array.isArray(json.images) && json.images[0]) {
        const next = { ...data };
        next.results[idx] = json.images[0];
        setData(next);
        setVersion((v) => v + 1);
      }
    } catch {}
  }

  function saveAndReplace() {
    if (!data) return;
    try {
      sessionStorage.setItem("vb_last_result", JSON.stringify(data));
      const rawHist = localStorage.getItem("vintedboost_history");
      if (rawHist) {
        const hist = JSON.parse(rawHist);
        hist[0] = data;
        localStorage.setItem("vintedboost_history", JSON.stringify(hist));
      }
    } catch {}
    router.push("/results");
  }

  if (!data) return null;
  const img = data.results[idx];

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between px-4 py-3">
          <button onClick={() => router.push("/results")} className="text-sm text-gray-600">
            Retour
          </button>
          <h1 className="text-base font-semibold">Modifier l&apos;image</h1>
          <div className="text-sm text-gray-600">v{version}</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-sm flex-1 p-4 pb-24 space-y-6">
        <img
          src={img}
          alt="edit"
          className="w-full rounded-lg border object-cover"
          style={{ aspectRatio: "4/5" }}
        />

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
              <input
                type="text"
                value={pose}
                onChange={(e) => setPose(e.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
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
              <input
                type="text"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={envOn}
                onChange={(e) => setEnvOn(e.target.checked)}
              />
              Environnement
            </label>
            {envOn && (
              <input
                type="text"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            )}
          </div>
        </section>
      </main>

      <footer className="sticky bottom-0 border-t border-gray-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-screen-sm px-4 py-3 flex flex-col gap-2">
          <button
            onClick={generateVariation}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Générer une variation
          </button>
          <button
            onClick={saveAndReplace}
            className="w-full text-sm text-gray-600"
          >
            Enregistrer et remplacer
          </button>
        </div>
      </footer>
    </div>
  );
}
