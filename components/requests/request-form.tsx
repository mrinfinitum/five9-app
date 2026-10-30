"use client";

import { Paperclip, Send, UserRound, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { submitRequestAction } from "@/app/(app)/b/actions";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, SUBMIT_PRIORITIES } from "@/lib/requests/constants";
import type { Person, RequestType } from "@/lib/requests/types";
import { formatFileSize } from "./ui";
import { uploadFiles } from "./upload";

export type CreatedRequest = { id: string; code: string; failedUploads: string[] };

export function RequestForm({
  boardId,
  requestTypes,
  requesterOptions,
  currentUserId,
  onCreated,
  onCancel,
}: {
  boardId: string;
  requestTypes: RequestType[];
  /** Team only: lets the team file a request on someone's behalf. */
  requesterOptions?: Person[];
  currentUserId: string;
  onCreated: (created: CreatedRequest) => void;
  onCancel?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "uploading">("idle");
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const self = requesterOptions?.find((p) => p.id === currentUserId);
  const [requesterQuery, setRequesterQuery] = useState(self ? `${self.name} — ${self.email}` : "");
  const [requesterId, setRequesterId] = useState(self?.id ?? "");
  const busy = status !== "idle";

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setFiles((current) => {
      const next = [...current];
      for (const file of Array.from(list)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`${file.name} is larger than 50 MB and was skipped.`);
          continue;
        }
        if (next.length >= MAX_ATTACHMENTS) {
          setError(`Up to ${MAX_ATTACHMENTS} files per request.`);
          break;
        }
        if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
      }
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (requesterOptions && !requesterId) {
      setError("Choose a requester from the suggestions.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "");
    setError(null);
    setStatus("submitting");
    const result = await submitRequestAction({
      boardId,
      title: get("title"),
      requestType: get("requestType"),
      priority: get("priority"),
      dueDate: get("dueDate"),
      description: get("description"),
      requesterId: requesterOptions ? requesterId : undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setStatus("idle");
      return;
    }
    let failedUploads: string[] = [];
    if (files.length) {
      setStatus("uploading");
      const outcomes = await uploadFiles(result.id, files, (done, total) => setProgress([done, total]));
      failedUploads = outcomes.filter((o) => !o.ok).map((o) => o.fileName);
    }
    setStatus("idle");
    setFiles([]);
    onCreated({ id: result.id, code: result.code, failedUploads });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {requesterOptions ? (
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <UserRound className="h-3.5 w-3.5" /> Requester
          </legend>
          <input
            aria-label="Requester"
            autoComplete="off"
            className="field"
            disabled={busy}
            list={listId}
            onChange={(e) => {
              const value = e.target.value;
              const match = requesterOptions.find((p) => `${p.name} — ${p.email}`.toLowerCase() === value.trim().toLowerCase());
              setRequesterQuery(value);
              setRequesterId(match?.id ?? "");
            }}
            placeholder="Type a name or email…"
            value={requesterQuery}
          />
          <datalist id={listId}>
            {requesterOptions.map((p) => (
              <option key={p.id} value={`${p.name} — ${p.email}`} />
            ))}
          </datalist>
          <p className="mt-1.5 text-xs text-muted">
            {requesterId ? "Requester selected — they'll get the updates." : "Pick who this request is for."}
          </p>
        </fieldset>
      ) : null}

      <label className="block">
        <span className="label">What do you need?</span>
        <input className="field" disabled={busy} maxLength={160} name="title" placeholder="e.g. 30-second promo video for the spring launch" required />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-3">
          <span className="label">Request type</span>
          <select className="field" defaultValue={requestTypes[0]?.key} disabled={busy} name="requestType">
            {requestTypes.map((t) => (
              <option key={t.key} value={t.key}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Priority</span>
          <select className="field" defaultValue="normal" disabled={busy} name="priority">
            {SUBMIT_PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Needed by</span>
          <input className="field" disabled={busy} name="dueDate" type="date" />
        </label>
      </div>

      <label className="block">
        <span className="label">Details</span>
        <textarea
          className="field min-h-32"
          disabled={busy}
          maxLength={4000}
          name="description"
          placeholder="Audience, sizes, formats, links to examples, key messages — the more detail, the faster the turnaround."
          required
          rows={6}
        />
      </label>

      <div>
        <span className="label">Attachments (optional, up to {MAX_ATTACHMENTS} files, 50 MB each)</span>
        <label
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition ${
            dragOver ? "border-brand bg-brand/10" : "border-line hover:border-neutral-500"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) addFiles(e.dataTransfer.files);
          }}
        >
          <span className="inline-flex items-center gap-1.5 font-semibold text-white">
            <Paperclip className="h-4 w-4" /> Attach files
          </span>
          <span className="text-xs text-muted">or drag &amp; drop here</span>
          <input disabled={busy} hidden multiple onChange={(e) => addFiles(e.target.files)} ref={fileInputRef} type="file" />
        </label>
        {files.length ? (
          <ul className="mt-2 space-y-1">
            {files.map((file, index) => (
              <li className="flex items-center gap-2 rounded-md bg-panel-2 px-3 py-1.5 text-sm" key={`${file.name}-${file.size}-${index}`}>
                <Paperclip className="h-3.5 w-3.5 text-muted" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <small className="text-muted">{formatFileSize(file.size)}</small>
                <button
                  aria-label={`Remove ${file.name}`}
                  className="text-muted hover:text-white"
                  disabled={busy}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200" role="alert">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button className="btn-ghost" disabled={busy} onClick={onCancel} type="button">Cancel</button>
        ) : null}
        <button className="btn-primary" disabled={busy} type="submit">
          <Send className="h-4 w-4" />
          {status === "uploading" && progress
            ? `Uploading files (${progress[0]}/${progress[1]})…`
            : status === "submitting"
              ? "Submitting…"
              : "Submit request"}
        </button>
      </div>
    </form>
  );
}
