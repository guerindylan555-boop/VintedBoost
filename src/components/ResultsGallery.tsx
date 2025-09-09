"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type ResultsGalleryProps = {
  sourceUrl: string | null;
  results: string[]; // only first is used as primary slide for now
  className?: string;
};

/**
 * A lightweight, accessible two-slide gallery:
 * - Slide 0: generated image (first result)
 * - Slide 1: source image
 * Mobile: swipe via native scroll-snap
 * Desktop: segmented control (tabs) to switch
 */
export default function ResultsGallery({ sourceUrl, results, className }: ResultsGalleryProps) {
  const [active, setActive] = useState(0); // 0 = generated, 1 = source
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const slides = useMemo(() => {
    const gen = results[0] || null;
    const src = sourceUrl || null;
    return [gen, src].filter((x): x is string => Boolean(x));
  }, [results, sourceUrl]);

  const hasSlides = slides.length > 0;

  // snap to selected tab on desktop click
  function scrollToIndex(idx: number) {
    const el = viewportRef.current;
    if (!el) return;
    const w = el.clientWidth;
    el.scrollTo({ left: w * idx, behavior: "smooth" });
  }

  // Track active slide on scroll (for mobile)
  function onScroll() {
    const el = viewportRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (idx !== active) setActive(idx);
  }

  useEffect(() => {
    scrollToIndex(active);
  }, [active]);

  const hasBoth = slides.length >= 2;

  return (
    <div className={className}>
      {!hasSlides ? (
        <div className={cx("flex h-full min-h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400")}>
          Aucune image à afficher.
        </div>
      ) : null}
      {/* no tabs; use arrows + dots only */}

      {/* Swipeable viewport */}
      {hasSlides ? (
        <div className="relative">
          <div
            ref={viewportRef}
            onScroll={onScroll}
            className="relative overflow-x-auto overflow-y-hidden touch-pan-x snap-x snap-mandatory no-scrollbar"
            style={{ WebkitOverflowScrolling: "touch", scrollBehavior: "smooth" }}
          >
            <div className="flex w-full">
              {slides.map((u, i) => (
                <div
                  id={`result-slide-${i}`}
                  key={i}
                  className="relative w-full flex-none snap-start"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} sur ${slides.length}`}
                >
                  <a
                    href={u}
                    download={`tryon_${i + 1}.png`}
                    title="Télécharger"
                    className="group relative block overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
                    style={{ aspectRatio: "4 / 5" }}
                  >
                    <Image
                      src={u}
                      alt={i === 0 ? "image générée" : "image source"}
                      fill
                      sizes="100vw"
                      className="object-cover"
                      unoptimized
                    />
                    <div className="absolute right-2 top-2 rounded-md bg-black/60 dark:bg-black/70 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                      Télécharger
                    </div>
                    {/* Badge label */}
                    <div className="absolute left-2 top-2 rounded-md bg-white/85 dark:bg-gray-900/80 px-2 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-300">
                      {i === 0 ? "Générée" : "Source"}
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
          {/* Arrows overlay */}
          {hasBoth ? (
            <>
              <button
                type="button"
                aria-label="Image précédente"
                onClick={() => setActive((v) => Math.max(0, v - 1))}
                disabled={active === 0}
                className={cx(
                  "absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full backdrop-blur bg-white/70 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 shadow flex items-center justify-center transition",
                  active === 0 && "opacity-50 cursor-not-allowed"
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <button
                type="button"
                aria-label="Image suivante"
                onClick={() => setActive((v) => Math.min(slides.length - 1, v + 1))}
                disabled={active === slides.length - 1}
                className={cx(
                  "absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full backdrop-blur bg-white/70 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 shadow flex items-center justify-center transition",
                  active === slides.length - 1 && "opacity-50 cursor-not-allowed"
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Dots on mobile */}
      {hasSlides ? (
        <div className="mt-2 flex items-center justify-center gap-1">
          {slides.map((_, i) => (
            <button
              key={i}
              aria-label={`Aller à la diapositive ${i + 1}`}
              onClick={() => setActive(i)}
              className={cx(
                "h-1.5 w-4 rounded-full transition",
                active === i ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-700"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
