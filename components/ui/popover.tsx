"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Anchor = { top: number; left: number };

/** Position a menu just below the clicked element. */
export function anchorFrom(element: HTMLElement): Anchor {
  const rect = element.getBoundingClientRect();
  return { top: rect.bottom + 6, left: rect.left };
}

/** Floating panel at a screen position. Closes on outside click or Escape. */
export function Popover({
  anchor,
  onClose,
  title,
  subtitle,
  children,
  label,
  width = 280,
}: {
  anchor: Anchor;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  label: string;
  width?: number;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState(anchor);

  // Keep the panel on screen.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8));
    const top = anchor.top + rect.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - rect.height - 8) : anchor.top;
    setPosition({ top, left });
  }, [anchor]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Modal dialogs sit in the browser's top layer, so a menu opened from inside
  // one must render inside it to be visible and clickable.
  const openDialogs = document.querySelectorAll("dialog[open]");
  const container = (openDialogs[openDialogs.length - 1] as HTMLElement | undefined) ?? document.body;

  return createPortal(
    <div className="fixed inset-0 z-[80]" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()} role="presentation">
      <section
        aria-label={label}
        className="fixed max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-panel-2 p-1.5 text-sm shadow-2xl shadow-black/70"
        onPointerDown={(e) => e.stopPropagation()}
        ref={panelRef}
        role="dialog"
        style={{ top: position.top, left: position.left, width }}
      >
        {title ? (
          <header className="flex items-start gap-2 px-2 pb-2 pt-1">
            <div className="min-w-0 flex-1">
              <strong className="block text-white">{title}</strong>
              {subtitle ? <span className="text-xs text-muted">{subtitle}</span> : null}
            </div>
            <button aria-label="Close" className="rounded p-0.5 text-muted hover:text-white" onClick={onClose} type="button">
              <X className="h-4 w-4" />
            </button>
          </header>
        ) : null}
        {children}
      </section>
    </div>,
    container,
  );
}

export function PopoverOption({
  selected,
  onClick,
  children,
  danger,
  disabled,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left disabled:cursor-default disabled:opacity-60 ${
        danger ? "text-red-300 hover:bg-red-950/60" : selected ? "bg-brand/15 text-white" : "text-neutral-200 hover:bg-panel"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
