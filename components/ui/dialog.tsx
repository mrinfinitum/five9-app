"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Native <dialog> modal: focus trap, Escape and backdrop-click close for free. */
export function Dialog({
  title,
  onClose,
  children,
  header,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  size?: "sm" | "md" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const width = size === "sm" ? "w-[min(94vw,28rem)]" : size === "md" ? "w-[min(94vw,40rem)]" : "w-[min(96vw,72rem)]";

  return (
    <dialog
      aria-label={title}
      className={`m-auto max-h-[92vh] ${width} overflow-hidden rounded-xl border border-line bg-panel p-0 text-neutral-100 shadow-2xl backdrop:bg-black/70`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      ref={ref}
    >
      <div className="flex max-h-[92vh] flex-col">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">{header ?? <h2 className="text-lg font-bold text-white">{title}</h2>}</div>
          <button aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-white" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog onClose={() => !busy && onCancel()} size="sm" title={title}>
      <div className="space-y-3 p-5 text-sm text-neutral-300">{body}</div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <button className="btn-ghost" disabled={busy} onClick={onCancel} type="button">{cancelLabel}</button>
        <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={onConfirm} type="button">{confirmLabel}</button>
      </div>
    </Dialog>
  );
}
