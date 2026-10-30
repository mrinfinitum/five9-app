"use client";

import { Mail, Phone } from "lucide-react";
import { useState } from "react";
import { updatePhoneAction } from "@/app/(app)/b/actions";
import { isClosedStatus, statusName } from "@/lib/requests/constants";
import type { Person, RequestItem } from "@/lib/requests/types";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, formatDateTime } from "./ui";

export function PersonCard({
  person,
  requests,
  isTeam,
  canEditPhone,
  onClose,
  onOpenRequest,
  onError,
}: {
  person: Person | null;
  requests: RequestItem[];
  isTeam: boolean;
  canEditPhone: boolean;
  onClose: () => void;
  onOpenRequest: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [savedPhone, setSavedPhone] = useState(person?.phone ?? null);
  const [busy, setBusy] = useState(false);

  if (!person) {
    return (
      <Dialog onClose={onClose} size="sm" title="Person">
        <p className="p-5 text-sm text-muted">This person no longer has an account.</p>
      </Dialog>
    );
  }

  const theirs = requests.filter((r) => r.requesterId === person.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeCount = theirs.filter((r) => !isClosedStatus(r.status)).length;
  const completedCount = theirs.filter((r) => r.status === "completed").length;
  const latest = theirs[0];

  return (
    <Dialog
      header={
        <div className="flex items-center gap-3">
          <Avatar person={person} size="lg" />
          <div className="min-w-0">
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-brand">
              {person.role === "admin" ? "Admin" : isTeam ? "Board member" : "Not on this board"}
            </span>
            <h2 className="truncate text-lg font-bold text-white">{person.name}</h2>
            <a className="inline-flex items-center gap-1 text-sm text-muted hover:text-white" href={`mailto:${person.email}`}>
              <Mail className="h-3.5 w-3.5" /> {person.email}
            </a>
          </div>
        </div>
      }
      onClose={onClose}
      size="sm"
      title={person.name}
    >
      <div className="space-y-4 p-5">
        <div className="rounded-lg border border-line p-3">
          {editing ? (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const result = await updatePhoneAction(person.id, phone);
                setBusy(false);
                if (!result.ok) return onError(result.error);
                setSavedPhone(result.phone);
                setEditing(false);
              }}
            >
              <label className="label" htmlFor="person-phone">Phone</label>
              <input autoFocus className="field" disabled={busy} id="person-phone" maxLength={40} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 503-555-0100" type="tel" value={phone} />
              <div className="flex gap-2">
                <button className="btn-primary py-1.5 text-xs" disabled={busy} type="submit">{busy ? "Saving…" : "Save phone"}</button>
                <button className="btn-ghost py-1.5 text-xs" disabled={busy} onClick={() => setEditing(false)} type="button">Cancel</button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted" />
              <div className="min-w-0 flex-1">
                <small className="block text-xs text-muted">Phone</small>
                {savedPhone ? <a className="text-white hover:underline" href={`tel:${savedPhone}`}>{savedPhone}</a> : <strong className="text-neutral-400">No phone on file</strong>}
              </div>
              {canEditPhone ? (
                <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setEditing(true)} type="button">
                  {savedPhone ? "Edit" : "Add phone"}
                </button>
              ) : null}
            </div>
          )}
        </div>

        <dl aria-label="Request activity" className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Total requests", theirs.length],
            ["Active", activeCount],
            ["Completed", completedCount],
          ].map(([label, value]) => (
            <div className="rounded-lg bg-panel-2 px-2 py-2" key={label}>
              <dt className="text-[0.65rem] uppercase tracking-wider text-muted">{label}</dt>
              <dd className="text-xl font-black tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>

        {latest ? (
          <div>
            <span className="label">Most recent request</span>
            <button className="w-full rounded-lg border border-line px-3 py-2 text-left hover:border-neutral-500" onClick={() => onOpenRequest(latest.id)} type="button">
              <span className="font-mono text-xs text-muted">{latest.code}</span>
              <strong className="block truncate text-white">{latest.title}</strong>
              <small className="text-muted">{statusName(latest.status)} · {formatDateTime(latest.createdAt)}</small>
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">No request history on this board.</p>
        )}
      </div>
    </Dialog>
  );
}
