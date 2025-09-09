"use client";

import React, { useMemo, useState } from "react";

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type DescriptionPanelProps = {
  data: Record<string, unknown> | null;
  generating?: boolean;
  error?: string | null;
  className?: string;
};

function buildText(d: Record<string, unknown>): string {
  try {
    const proposalsRaw = d["proposals"];
    if (Array.isArray(proposalsRaw) && proposalsRaw.length) {
      const blocks = proposalsRaw.slice(0, 3).map((p) => {
        const obj = (p ?? {}) as Record<string, unknown>;
        const title = typeof obj["title"] === "string" ? (obj["title"] as string) : "";
        const bpRaw = obj["bulletPoints"];
        const bpArr = Array.isArray(bpRaw) ? (bpRaw as unknown[]) : [];
        const bullets = bpArr
          .filter((x): x is string => typeof x === "string")
          .map((b) => `• ${b}`)
          .join("\n");
        const text = typeof obj["descriptionText"] === "string" ? (obj["descriptionText"] as string) : "";
        const brand = typeof obj["brand"] === "string" && obj["brand"] ? `Marque: ${obj["brand"]}\n` : "";
        const model = typeof obj["model"] === "string" && obj["model"] ? `Modèle: ${obj["model"]}\n` : "";
        return [title, brand + model, bullets, text].filter(Boolean).join("\n\n");
      });
      return blocks.join("\n\n\n");
    }
    const titleVal = d["title"];
    const title = typeof titleVal === "string" ? titleVal : "";
    const bulletsRaw = d["bulletPoints"];
    const bulletsArr = Array.isArray(bulletsRaw) ? (bulletsRaw as unknown[]) : [];
    const bullets = bulletsArr
      .filter((x): x is string => typeof x === "string")
      .map((b) => `• ${b}`)
      .join("\n");
    const textVal = d["descriptionText"];
    const text = typeof textVal === "string" ? textVal : "";
    const brandVal = d["brand"];
    const brand = typeof brandVal === "string" && brandVal ? `Marque: ${brandVal}\n` : "";
    const modelVal = d["model"];
    const model = typeof modelVal === "string" && modelVal ? `Modèle: ${modelVal}\n` : "";
    return [title, brand + model, bullets, text].filter(Boolean).join("\n\n").trim() || JSON.stringify(d, null, 2);
  } catch {
    return JSON.stringify(d, null, 2);
  }
}

export default function DescriptionPanel({ data, generating, error, className }: DescriptionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const compiled = useMemo(() => (data ? buildText(data) : ""), [data]);

  if (generating) {
    return (
      <div className={cx("text-sm text-gray-500 dark:text-gray-400", className)}>Génération de la description…</div>
    );
  }
  if (error) {
    return (
      <div className={cx("text-sm text-red-600 dark:text-red-400", className)}>{error}</div>
    );
  }
  if (!data) return null;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(compiled);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  // Pull structured fields for nicer rendering
  const brand = typeof data["brand"] === "string" ? (data["brand"] as string) : undefined;
  const model = typeof data["model"] === "string" ? (data["model"] as string) : undefined;
  const title = typeof data["title"] === "string" ? (data["title"] as string) : undefined;
  const bulletPoints = Array.isArray(data["bulletPoints"]) ? (data["bulletPoints"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const descriptionText = typeof data["descriptionText"] === "string" ? (data["descriptionText"] as string) : undefined;

  return (
    <div className={cx("rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-gray-600 dark:text-gray-300">Description générée</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopy}
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {copied ? "Copié !" : "Copier"}
          </button>
          <a
            download="description.txt"
            href={"data:text/plain;charset=utf-8," + encodeURIComponent(compiled)}
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Export .txt
          </a>
        </div>
      </div>

      {(brand || model || title) ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {title ? <span className="font-semibold text-gray-900 dark:text-gray-100">{title}</span> : null}
          {brand ? (
            <span className="rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 text-gray-700 dark:text-gray-200">Marque: {brand}</span>
          ) : null}
          {model ? (
            <span className="rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 text-gray-700 dark:text-gray-200">Modèle: {model}</span>
          ) : null}
        </div>
      ) : null}

      {bulletPoints.length ? (
        <ul className="mb-2 list-disc space-y-1 pl-5 text-xs text-gray-800 dark:text-gray-200">
          {bulletPoints.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}

      {descriptionText ? (
        <div>
          <div className={cx(
            "relative text-sm text-gray-800 dark:text-gray-200 transition-all",
            expanded ? "max-h-[999px]" : "max-h-24 overflow-hidden"
          )}>
            {descriptionText}
            {!expanded ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
            ) : null}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs text-brand-700 hover:underline dark:text-brand-300"
          >
            {expanded ? "Réduire" : "Lire plus"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

