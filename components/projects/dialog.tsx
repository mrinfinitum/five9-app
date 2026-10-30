"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Native <dialog> with Escape/backdrop close. `side` renders as a right-hand drawer. */
export function Dialog({
  title,
  onClose,
  children,
  side = false,
  header,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  side?: boolean;
  header?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      aria-label={title}
      className={
        side
          ? "fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-2xl border-l border-line bg-panel p-0 text-neutral-100 backdrop:bg-black/70"
          : "m-auto w-[min(92vw,40rem)] rounded-xl border border-line bg-panel p-0 text-neutral-100 backdrop:bg-black/70"
      }
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      ref={ref}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">{header ?? <h2 className="text-lg font-bold text-white">{title}</h2>}</div>
          <button aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-white" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
