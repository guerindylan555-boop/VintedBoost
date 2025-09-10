"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaCarouselType } from "embla-carousel";

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type ResultsGalleryProps = {
  sourceUrl: string | null;
  results: string[];
  poses?: string[] | null;
  errorsByPose?: Record<string, string> | null;
  className?: string;
};

/**
 * A lightweight, accessible two-slide gallery:
 * - Slide 0: generated image (first result)
 * - Slide 1: source image
 * Mobile: swipe via native scroll-snap
 * Desktop: segmented control (tabs) to switch
 */
export default function ResultsGallery({ sourceUrl, results, poses, errorsByPose, className }: ResultsGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start", containScroll: "trimSnaps", dragFree: false, skipSnaps: false });

  const slides = useMemo(() => {
    const gens = Array.isArray(results) ? results.filter((u): u is string => typeof u === "string" && !!u) : [];
    const src = sourceUrl || null;
    return src ? [...gens, src] : gens;
  }, [results, sourceUrl]);

  const genCount = useMemo(() => (Array.isArray(results) ? results.filter((u) => typeof u === "string" && !!u).length : 0), [results]);

  const hasSlides = slides.length > 0;
  const hasBoth = slides.length >= 2;
  const hasErrors = Boolean(errorsByPose && Object.keys(errorsByPose).length > 0);

  const onSelect = useCallback((api: EmblaCarouselType) => {
    setSelectedIndex(api.selectedScrollSnap());
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const handler = () => onSelect(emblaApi);
    emblaApi.on("select", handler);
    emblaApi.on("reInit", handler);
    handler();
    return () => {
      emblaApi.off("select", handler);
      emblaApi.off("reInit", handler);
    };
  }, [emblaApi, onSelect, slides.length]);

  return (
    <div className={className}>
      {hasErrors ? (
        <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="font-medium mb-1">Certaines poses n'ont pas pu être générées</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {Object.entries(errorsByPose!).map(([pose, msg]) => (
              <li key={pose}><span className="uppercase text-[10px] font-semibold">{pose}</span>: {msg}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!hasSlides ? (
        <div className={cx("flex h-full min-h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400")}>
          Aucune image à afficher.
        </div>
      ) : null}
      {/* no tabs; use arrows + dots only */}

      {/* Swipeable viewport */}
      {hasSlides ? (
        <div className="relative">
          <div ref={emblaRef} className="overflow-hidden">
            <div className="flex">
              {slides.map((u, i) => (
                <div
                  id={`result-slide-${i}`}
                  key={i}
                  className="relative flex-[0_0_100%]"
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
                    {/* Badge label with optional pose */}
                    <div className="absolute left-2 top-2 rounded-md bg-white/85 dark:bg-gray-900/80 px-2 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-300">
                      {i < genCount ? (poses?.[i] ? `Générée · ${poses?.[i]}` : "Générée") : "Source"}
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
          {/* Arrows overlay */}
          {hasBoth ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between">
              <button
                type="button"
                aria-label="Image précédente"
                onClick={() => emblaApi?.scrollPrev()}
                disabled={!canPrev}
                className={cx(
                  "pointer-events-auto ml-2 h-9 w-9 rounded-full backdrop-blur bg-white/70 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 shadow flex items-center justify-center transition",
                  !canPrev && "opacity-50 cursor-not-allowed"
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <button
                type="button"
                aria-label="Image suivante"
                onClick={() => emblaApi?.scrollNext()}
                disabled={!canNext}
                className={cx(
                  "pointer-events-auto mr-2 h-9 w-9 rounded-full backdrop-blur bg-white/70 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 shadow flex items-center justify-center transition",
                  !canNext && "opacity-50 cursor-not-allowed"
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Dots on mobile */}
      {hasBoth ? (
        <div className="mt-2 flex items-center justify-center gap-1">
          {slides.map((_, i) => (
            <button
              key={i}
              aria-label={`Aller à la diapositive ${i + 1}`}
              aria-current={selectedIndex === i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={cx(
                "h-1.5 w-4 rounded-full transition",
                selectedIndex === i ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-700"
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
