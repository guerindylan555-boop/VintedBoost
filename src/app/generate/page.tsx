"use client";

import { useState, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function GeneratePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pose, setPose] = useState(false);
  const [poseText, setPoseText] = useState("");
  const [style, setStyle] = useState(false);
  const [styleText, setStyleText] = useState("");
  const [env, setEnv] = useState(false);
  const [envText, setEnvText] = useState("");

  const router = useRouter();

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (f) setFile(f);
  }

  function generate() {
    router.push("/results");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between p-4">
          <div />
          <h1 className="text-base font-semibold">New listing</h1>
          <Link href="/history" className="text-sm text-blue-600">
            History
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-6 p-4">
        <section>
          <label className="block rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">
            <input type="file" className="hidden" onChange={onFileChange} />
            {file ? file.name : "Upload 1 photo (non‑worn)"}
          </label>
        </section>

        <section className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pose} onChange={(e) => setPose(e.target.checked)} />
              Pose
            </label>
            {pose && (
              <div className="mt-2 space-y-2">
                <input
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="Describe pose (e.g., frontal)"
                  value={poseText}
                  onChange={(e) => setPoseText(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    "Frontal",
                    "3/4",
                    "Profile",
                    "Hands in pockets",
                  ].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="rounded-full border px-2 py-1"
                      onClick={() => setPoseText(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={style} onChange={(e) => setStyle(e.target.checked)} />
              Style
            </label>
            {style && (
              <div className="mt-2 space-y-2">
                <input
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="Image style (e.g., studio)"
                  value={styleText}
                  onChange={(e) => setStyleText(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {["Studio neutral", "Editorial", "E‑commerce clean"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="rounded-full border px-2 py-1"
                      onClick={() => setStyleText(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={env} onChange={(e) => setEnv(e.target.checked)} />
              Environment
            </label>
            {env && (
              <div className="mt-2 space-y-2">
                <input
                  className="w-full rounded-md border p-2 text-sm"
                  placeholder="Background/environment"
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  {
                    ["Light grey studio", "White sweep", "Soft shadow"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="rounded-full border px-2 py-1"
                        onClick={() => setEnvText(c)}
                      >
                        {c}
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <label className="block text-sm font-medium">Language</label>
          <select className="mt-1 w-full rounded-md border p-2 text-sm">
            <option>French</option>
            <option>English</option>
          </select>
        </section>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4">
        <button
          onClick={generate}
          disabled={!file}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Generate images + description
        </button>
        <div className="mt-2 text-center">
          <button className="text-sm text-gray-500" type="button">
            Advanced
          </button>
        </div>
      </footer>
    </div>
  );
}
