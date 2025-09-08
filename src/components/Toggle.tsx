"use client";

import React from "react";

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  className?: string;
};

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Toggle({ checked, onChange, ariaLabel, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-10 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
        checked ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-600",
        className
      )}
    >
      <span
        className={cx(
          "inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-100 shadow ring-0 transition",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
