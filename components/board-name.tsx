"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";
import { updateBoardAction } from "@/app/(app)/admin/actions";

/** Board name with an inline rename for admins. The board's link doesn't change. */
export function BoardName({ boardId, name, canEdit }: { boardId: string; name: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {name}
        {canEdit ? (
          <button
            aria-label="Rename board"
            className="rounded p-0.5 text-muted hover:text-brand"
            onClick={() => {
              setValue(name);
              setError(null);
              setEditing(true);
            }}
            title="Rename board"
            type="button"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <form
      className="inline-flex flex-wrap items-center gap-1.5 normal-case tracking-normal"
      onSubmit={(e) => {
        e.preventDefault();
        const next = value.trim();
        if (next === name) return setEditing(false);
        startTransition(async () => {
          const result = await updateBoardAction(boardId, { name: next });
          if (result.ok) setEditing(false);
          else setError(result.error);
        });
      }}
    >
      <input
        aria-label="Board name"
        autoFocus
        className="field w-72 py-1 text-sm font-semibold"
        disabled={pending}
        maxLength={80}
        minLength={2}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        required
        value={value}
      />
      <button aria-label="Save name" className="btn-primary px-2 py-1" disabled={pending} type="submit">
        <Check className="h-4 w-4" />
      </button>
      <button aria-label="Cancel" className="btn-ghost px-2 py-1" disabled={pending} onClick={() => setEditing(false)} type="button">
        <X className="h-4 w-4" />
      </button>
      {error ? <span className="text-xs font-normal text-red-300">{error}</span> : null}
    </form>
  );
}
