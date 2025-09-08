"use client";

import Link from "next/link";
import { useState } from "react";

export default function EditorPage() {
  const [pose, setPose] = useState(false);
  const [style, setStyle] = useState(false);
  const [env, setEnv] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between p-4">
          <Link href="/results" className="text-sm text-blue-600">
            Back
          </Link>
          <h1 className="text-base font-semibold">Edit image</h1>
          <div className="text-sm text-gray-500">v1</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 p-4">
        <div className="aspect-[4/5] w-full rounded-md bg-gray-100" />

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pose} onChange={(e) => setPose(e.target.checked)} />
              Pose
            </label>
            {pose && <input className="mt-2 w-full rounded-md border p-2 text-sm" />}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={style} onChange={(e) => setStyle(e.target.checked)} />
              Style
            </label>
            {style && <input className="mt-2 w-full rounded-md border p-2 text-sm" />}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={env} onChange={(e) => setEnv(e.target.checked)} />
              Environment
            </label>
            {env && <input className="mt-2 w-full rounded-md border p-2 text-sm" />}
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 border-t bg-white p-4">
        <button className="w-full rounded-md bg-blue-600 px-4 py-2 text-white">
          Generate variation
        </button>
        <div className="mt-2 text-center">
          <button className="text-sm text-gray-500" type="button">
            Save & replace
          </button>
        </div>
      </footer>
    </div>
  );
}
