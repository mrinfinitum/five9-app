"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { Popover, anchorFrom, type Anchor } from "./popover";

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * A dropdown drawn by the app rather than the operating system, so its menu
 * follows the light/dark theme (native menus can come out dark on a light page).
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  size = "md",
  className = "",
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<(Anchor & { width: number }) | null>(null);
  const open = (button: HTMLElement) => setAnchor({ ...anchorFrom(button), width: Math.max(140, button.offsetWidth) });
  const current = options.find((o) => o.value === value);
  const close = () => {
    setAnchor(null);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        aria-expanded={Boolean(anchor)}
        aria-haspopup="listbox"
        aria-label={label}
        className={`inline-flex items-center justify-between gap-2 rounded-md border border-line bg-ink text-left text-white hover:border-neutral-600 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-default disabled:opacity-60 ${
          size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-base sm:text-sm"
        } ${className}`}
        disabled={disabled}
        onClick={(e) => open(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            open(e.currentTarget);
          }
        }}
        ref={buttonRef}
        type="button"
      >
        <span className="truncate">{current?.label ?? "Choose"}</span>
        <ChevronDown aria-hidden="true" className={`shrink-0 text-muted ${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
      </button>
      {anchor ? (
        <Popover anchor={anchor} label={label} onClose={close} width={anchor.width}>
          <div
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option]")];
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              items[(index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
            }}
            role="listbox"
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  aria-selected={selected}
                  autoFocus={selected}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-panel focus:bg-panel focus:outline-none ${selected ? "font-semibold text-white" : "text-neutral-300"}`}
                  key={option.value}
                  onClick={() => {
                    if (!selected) onChange(option.value);
                    close();
                  }}
                  role="option"
                  type="button"
                >
                  <Check aria-hidden="true" className={`h-4 w-4 shrink-0 text-brand ${selected ? "" : "invisible"}`} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
