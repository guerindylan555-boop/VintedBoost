"use client";

import React from "react";

type SpinnerProps = {
  size?: "xs" | "sm" | "md" | "lg";
  label?: string;
  className?: string;
};

const sizeToClass: Record<NonNullable<SpinnerProps["size"]>, string> = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export default function Spinner({ size = "md", label, className }: SpinnerProps) {
  return (
    <div className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}
      role="status" aria-live="polite" aria-busy="true">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={[sizeToClass[size], "animate-spin text-gray-400"].join(" ")}> 
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
      </svg>
      {label ? <span className="text-xs text-gray-600 dark:text-gray-300">{label}</span> : null}
    </div>
  );
}
