"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function EditorPage() {
  const params = useSearchParams();
  const router = useRouter();
  const image = params.get("image");
  const [poseOn, setPoseOn] = useState(false);
  const [pose, setPose] = useState("");
  const [styleOn, setStyleOn] = useState(false);
  const [style, setStyle] = useState("");
  const [envOn, setEnvOn] = useState(false);
  const [environment, setEnvironment] = useState("");

  if (!image) {
    return (
      <div className="p-4">
        <button onClick={() => router.back()}>Back</button>
        <p className="mt-4 text-sm text-gray-600">No image</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.back()}>Back</button>
        <h1 className="text-base font-medium">Edit image</h1>
        <div className="text-sm">v1</div>
      </header>
      <main className="flex-1 p-4 space-y-4">
        <img src={image} alt="current" className="w-full rounded" />
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
              </div>
            )}
          </div>
        </section>
      </main>
      <footer className="sticky bottom-0 border-t bg-white p-4">
        <button className="w-full rounded bg-blue-600 px-4 py-3 text-white">
          Generate variation
        </button>
        <div className="mt-2 text-center">
          <button className="text-sm text-gray-600">Save & replace</button>
        </div>
      </footer>
    </div>
  );
}
