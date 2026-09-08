"use client";

import { cn } from "@/lib/utils";

// A toggle chip in a filter row (division filters in the staff workspaces).
// Orange is the "active" surface (DESIGN.md §8.1/§8.2); white text and
// semibold, since a 12.5px label on solid orange needs the weight.
export function FilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
        active
          ? "border-brand-orange bg-brand-orange font-semibold text-white"
          : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
