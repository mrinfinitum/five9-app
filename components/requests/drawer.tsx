"use client";

import { Archive, ArchiveRestore, CalendarClock, Check, EyeOff, Flag, Link2, Paperclip, Pencil, Send, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { addCommentAction, deleteAttachmentAction, toggleAssigneeAction, updateRequestAction } from "@/app/(app)/b/actions";
import { MAX_ATTACHMENTS, priorityName, statusName, type RequestStatus } from "@/lib/requests/constants";
import type { CurrentUserInfo, Person, RequestAttachment, RequestItem } from "@/lib/requests/types";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import type { Mutate } from "./board";
import { Avatar, PRIORITY_CHIP, PriorityLabel, STATUS_CHIP, formatDateTime, formatFileSize } from "./ui";
import { uploadFiles } from "./upload";

type Props = {
  request: RequestItem;
  team: Person[];
  people: Map<string, Person>;
  requesterOptions: Person[];
  currentUser: CurrentUserInfo;
  typeName: (key: string | null) => string | null;
  focusConversation: boolean;
  mutate: Mutate;
  onClose: () => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
  onMove: (status: RequestStatus) => void;
  onOpenField: (event: React.MouseEvent<HTMLElement>, kind: "status" | "priority" | "type") => void;
  onOpenPerson: (id: string) => void;
  onError: (message: string) => void;
};

const tempId = () => `temp-${Math.random().toString(36).slice(2)}`;

export function RequestDrawer({
  request,
  team,
  people,
  requesterOptions,
  currentUser,
  typeName,
  focusConversation,
  mutate,
  onClose,
  onArchive,
  onDelete,
  onOpenField,
  onOpenPerson,
  onError,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editingRequester, setEditingRequester] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusConversation) return;
    const frame = requestAnimationFrame(() => {
      conversationRef.current?.scrollIntoView({ block: "start" });
      commentRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusConversation]);

  const patch = (local: Partial<RequestItem>) => (list: RequestItem[]) => list.map((r) => (r.id === request.id ? { ...r, ...local } : r));
  const requester = request.requesterId ? people.get(request.requesterId) : null;
  const conversationCount = request.comments.filter((c) => c.kind === "comment").length;

  return (
    <Dialog
      header={
        <div>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand">{request.code}</span>
          {/* A textarea so long titles wrap instead of scrolling off the side on phones. */}
          <textarea
            aria-label="Request title"
            className="mt-0.5 w-full resize-none rounded bg-transparent text-lg font-bold leading-snug text-white outline-none [field-sizing:content] focus:ring-1 focus:ring-brand sm:text-xl"
            defaultValue={request.title}
            maxLength={160}
            onBlur={(e) => {
              const title = e.target.value.replace(/\s+/g, " ").trim();
              if (!title) e.target.value = request.title;
              else if (title !== request.title) mutate(patch({ title }), () => updateRequestAction(request.id, { title }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            rows={1}
          />
          <p className="mt-1 text-sm text-muted">
            Requested by{" "}
            {requester ? (
              <button className="text-neutral-200 underline-offset-2 hover:underline" onClick={() => onOpenPerson(requester.id)} type="button">
                {requester.name}
              </button>
            ) : (
              "Unknown"
            )}
            {typeName(request.requestType) ? ` · ${typeName(request.requestType)}` : ""} · {formatDateTime(request.createdAt)}
            <button className="ml-2 inline-flex items-center gap-1 text-xs text-muted hover:text-white" onClick={() => setEditingRequester(true)} type="button">
              <Pencil className="h-3 w-3" /> Change requester
            </button>
          </p>
          {editingRequester ? (
            <RequesterEditor
              current={request.requesterId}
              onCancel={() => setEditingRequester(false)}
              onSave={(id) => {
                setEditingRequester(false);
                mutate(patch({ requesterId: id }), () => updateRequestAction(request.id, { requesterId: id }));
              }}
              options={requesterOptions}
            />
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              aria-label={request.archivedAt ? `Restore ${request.code} to the board` : `Archive ${request.code}`}
              className="btn-ghost px-2.5 py-1 text-xs"
              onClick={() => onArchive(!request.archivedAt)}
              type="button"
            >
              {request.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              {request.archivedAt ? "Restore" : "Archive"}
            </button>
            <button
              className="btn-ghost px-2.5 py-1 text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              type="button"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? "Link copied" : "Copy link"}
            </button>
            <button
              aria-label={`Delete ${request.code}`}
              className="btn-danger px-2.5 py-1 text-xs"
              onClick={onDelete}
              title="Delete permanently"
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      }
      onClose={onClose}
      size="xl"
      title={`${request.code} ${request.title}`}
    >
      {/* Field controls */}
      <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-4">
        <Control label="Status">
          <button
            className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm font-semibold ${STATUS_CHIP[request.status]}`}
            onClick={(e) => onOpenField(e, "status")}
            type="button"
          >
            {statusName(request.status)}
          </button>
        </Control>
        <Control icon={<Flag className="h-3 w-3" />} label="Priority">
          <button
            className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm font-semibold ${PRIORITY_CHIP[request.priority]}`}
            onClick={(e) => onOpenField(e, "priority")}
            type="button"
          >
            <PriorityLabel name={priorityName(request.priority)} priority={request.priority} />
          </button>
        </Control>
        <Control label="Type">
          <button
            className="w-full truncate rounded-md bg-panel-2 px-2.5 py-1.5 text-left text-sm font-semibold text-neutral-200 ring-1 ring-line"
            onClick={(e) => onOpenField(e, "type")}
            type="button"
          >
            {typeName(request.requestType) ?? "Select type"}
          </button>
        </Control>
        <Control icon={<CalendarClock className="h-3 w-3" />} label="Due">
          <input
            className="field py-1.5"
            defaultValue={request.dueDate ?? ""}
            key={`${request.id}-${request.dueDate ?? "none"}`}
            onBlur={(e) => {
              if (e.target.value === (request.dueDate ?? "")) return;
              const value = e.target.value || null;
              mutate(patch({ dueDate: value }), () => updateRequestAction(request.id, { dueDate: value }));
            }}
            type="date"
          />
        </Control>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Primary */}
        <div className="min-w-0 space-y-6">
          <section>
            <label className="label" htmlFor="request-details">Request details</label>
            <textarea
              className="field min-h-40 whitespace-pre-wrap"
              defaultValue={request.description ?? ""}
              id="request-details"
              maxLength={4000}
              onBlur={(e) => {
                const value = e.target.value;
                if (value.trim() === (request.description ?? "").trim()) return;
                mutate(patch({ description: value.trim() || null }), () => updateRequestAction(request.id, { description: value }));
              }}
              placeholder="No request details were provided."
            />
          </section>

          <Attachments onError={onError} people={people} request={request} canDelete />
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-6">
          <section>
            <h3 className="label">Assignees</h3>
            <div className="flex flex-wrap gap-2">
              {team.map((member) => {
                const on = request.assigneeIds.includes(member.id);
                return (
                  <button
                    aria-pressed={on}
                    className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold ${
                      on ? "border-brand bg-brand/15 text-white" : "border-line text-muted hover:text-white"
                    }`}
                    key={member.id}
                    onClick={() =>
                      mutate(
                        patch({ assigneeIds: on ? request.assigneeIds.filter((id) => id !== member.id) : [...request.assigneeIds, member.id] }),
                        () => toggleAssigneeAction(request.id, member.id, !on),
                      )
                    }
                    type="button"
                  >
                    <Avatar person={member} />
                    {member.id === currentUser.id ? `${member.name} (you)` : member.name}
                  </button>
                );
              })}
            </div>
          </section>

          <div ref={conversationRef}>
            <h3 className="label">Conversation{conversationCount ? ` (${conversationCount})` : ""}</h3>
            <Conversation people={people} request={request} onOpenPerson={onOpenPerson} />
            <CommentForm
              inputRef={commentRef}
              onPost={(body, isInternal) =>
                mutate(
                  patch({
                    comments: [
                      ...request.comments,
                      { id: tempId(), body, authorId: currentUser.id, isInternal, kind: "comment", createdAt: new Date().toISOString() },
                    ],
                  }),
                  () => addCommentAction(request.id, body, isInternal),
                )
              }
              placeholder="Post an update — the requester sees it unless it's marked internal."
              showInternalToggle
            />
          </div>
        </aside>
      </div>
    </Dialog>
  );
}

function Control({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <span className="label flex items-center gap-1">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function RequesterEditor({
  options,
  current,
  onSave,
  onCancel,
}: {
  options: Person[];
  current: string | null;
  onSave: (id: string) => void;
  onCancel: () => void;
}) {
  const listId = useId();
  const initial = options.find((p) => p.id === current);
  const [query, setQuery] = useState(initial ? `${initial.name} — ${initial.email}` : "");
  const [selected, setSelected] = useState(initial?.id ?? "");
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) onSave(selected);
      }}
    >
      <input
        aria-label="New requester"
        autoComplete="off"
        autoFocus
        className="field w-72 py-1.5"
        list={listId}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          setSelected(options.find((p) => `${p.name} — ${p.email}`.toLowerCase() === value.trim().toLowerCase())?.id ?? "");
        }}
        placeholder="Type a name or email…"
        value={query}
      />
      <datalist id={listId}>
        {options.map((p) => (
          <option key={p.id} value={`${p.name} — ${p.email}`} />
        ))}
      </datalist>
      <button className="btn-primary py-1.5 text-xs" disabled={!selected} type="submit">Save requester</button>
      <button className="btn-ghost py-1.5 text-xs" onClick={onCancel} type="button">Cancel</button>
    </form>
  );
}

export function Conversation({
  request,
  people,
  onOpenPerson,
  emptyText = "No comments yet.",
}: {
  request: RequestItem;
  people: Map<string, Person>;
  onOpenPerson?: (id: string) => void;
  emptyText?: string;
}) {
  if (!request.comments.length) return <p className="text-sm text-neutral-500">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {request.comments.map((comment) => {
        const author = comment.authorId ? people.get(comment.authorId) : undefined;
        if (comment.kind === "status_change") {
          return (
            <li className="flex items-start gap-2 text-xs text-muted" key={comment.id}>
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                <span className="text-neutral-300">{comment.body}</span>{" "}
                <span>
                  {author?.name ?? "Five9 Media"} · <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                </span>
              </span>
            </li>
          );
        }
        return (
          <li className={`rounded-lg px-3 py-2 ${comment.isInternal ? "border border-dashed border-amber-700/60 bg-amber-950/20" : "bg-panel-2"}`} key={comment.id}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {author && onOpenPerson ? (
                <button className="font-semibold text-white hover:underline" onClick={() => onOpenPerson(author.id)} type="button">
                  {author.name}
                </button>
              ) : (
                <strong className="text-white">{author?.name ?? "Five9 Media"}</strong>
              )}
              {comment.isInternal ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-900/50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-200">
                  <EyeOff className="h-3 w-3" /> Internal
                </span>
              ) : null}
              <time className="text-muted" dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-200">{comment.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function CommentForm({
  onPost,
  placeholder,
  showInternalToggle = false,
  inputRef,
}: {
  onPost: (body: string, isInternal: boolean) => void;
  placeholder: string;
  showInternalToggle?: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  function submit() {
    const clean = body.trim();
    if (!clean) return;
    onPost(clean, internal);
    setBody("");
    // Each post starts public again, so a follow-up can't go internal by accident.
    setInternal(false);
  }
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="Comment"
        className="field min-h-20 resize-y"
        maxLength={4000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        rows={3}
        value={body}
      />
      <div className="flex items-center gap-3">
        {showInternalToggle ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input checked={internal} className="accent-brand" onChange={(e) => setInternal(e.target.checked)} type="checkbox" />
            <EyeOff className="h-3.5 w-3.5" /> Internal only
          </label>
        ) : null}
        <button className="btn-primary ml-auto py-1.5" disabled={!body.trim()} type="submit">
          <Send className="h-4 w-4" /> Post
        </button>
      </div>
    </form>
  );
}

export function Attachments({
  request,
  people,
  canDelete,
  onError,
}: {
  request: RequestItem;
  people: Map<string, Person>;
  canDelete: boolean;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RequestAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const remaining = MAX_ATTACHMENTS - request.attachments.length;

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    if (files.length > remaining) {
      onError(remaining > 0 ? `You can add ${remaining} more file${remaining === 1 ? "" : "s"} to this request.` : `Requests can have up to ${MAX_ATTACHMENTS} files.`);
      files = files.slice(0, Math.max(0, remaining));
      if (!files.length) return;
    }
    setBusy(true);
    const outcomes = await uploadFiles(request.id, files, (done, total) => setProgress([done, total]));
    setBusy(false);
    setProgress(null);
    const failed = outcomes.filter((o) => !o.ok);
    if (failed.length) onError(`Couldn't upload ${failed.map((f) => `${f.fileName} (${f.error})`).join(", ")}`);
  }

  return (
    <section>
      <h3 className="label">Attachments ({request.attachments.length})</h3>
      {request.attachments.length ? (
        <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
          {request.attachments.map((attachment) => {
            const uploader = attachment.uploadedBy ? people.get(attachment.uploadedBy) : undefined;
            return (
              <li className="flex items-center gap-3 px-3 py-2 text-sm" key={attachment.id}>
                <Paperclip className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <a className="block truncate text-white hover:underline" href={`/api/attachments/${attachment.id}`} rel="noreferrer" target="_blank">
                    {attachment.fileName}
                  </a>
                  <small className="text-muted">
                    {[formatFileSize(attachment.fileSize), uploader?.name].filter(Boolean).join(" · ")}
                  </small>
                </div>
                <a className="text-xs text-muted hover:text-white" href={`/api/attachments/${attachment.id}?download=1`}>Download</a>
                {canDelete ? (
                  <button aria-label={`Delete ${attachment.fileName}`} className="rounded p-1 text-neutral-500 hover:text-brand" onClick={() => setPendingDelete(attachment)} title="Delete file" type="button">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <label
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-4 text-center text-sm transition ${
          dragOver ? "border-brand bg-brand/10" : "border-line hover:border-neutral-500"
        } ${busy ? "pointer-events-none opacity-70" : ""}`}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = busy ? "none" : "copy";
          if (!busy) setDragOver(true);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold text-white">
          <Paperclip className="h-4 w-4" />
          {busy && progress ? `Uploading (${progress[0]}/${progress[1]})…` : dragOver ? "Drop files to upload" : "Choose files"}
        </span>
        <span className="text-xs text-muted">{dragOver ? "Release anywhere in this box" : `or drag & drop here · up to ${MAX_ATTACHMENTS} files total`}</span>
        <input
          disabled={busy}
          hidden
          multiple
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
          type="file"
        />
      </label>
      {pendingDelete ? (
        <ConfirmDialog
          body={
            <>
              <p><strong className="text-white">{pendingDelete.fileName}</strong></p>
              <p>This permanently removes the file from this request. It can&apos;t be recovered.</p>
            </>
          }
          busy={deleting}
          cancelLabel="Keep file"
          confirmLabel={deleting ? "Deleting…" : "Delete file"}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            setDeleting(true);
            const result = await deleteAttachmentAction(pendingDelete.id);
            setDeleting(false);
            setPendingDelete(null);
            if (!result.ok) onError(result.error);
          }}
          title="Delete this file?"
        />
      ) : null}
    </section>
  );
}
