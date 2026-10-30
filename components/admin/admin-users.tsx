"use client";

import { Lock, MailPlus, RotateCw, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useState, useTransition } from "react";
import {
  deleteUserAction,
  inviteUserAction,
  renameUserAction,
  resendInviteAction,
  setActiveAction,
  setRoleAction,
  type AdminResult,
} from "@/app/(app)/admin/actions";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
  isActive: boolean;
  isPreset: boolean;
  isSelf: boolean;
  invitedPending: boolean;
  lastSignInAt: string | null;
  createdAt: string;
};

function formatWhen(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminUsers({ rows, missingPresets }: { rows: AdminUserRow[]; missingPresets: string[] }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function run(action: () => Promise<AdminResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice({ tone: "error", text: result.error });
      else if (result.message) setNotice({ tone: "ok", text: result.message });
    });
  }

  const admins = rows.filter((r) => r.role === "admin" && r.isActive).length;
  const active = rows.filter((r) => r.isActive && !r.invitedPending).length;
  const invited = rows.filter((r) => r.invitedPending && r.isActive).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Active members" value={active} />
        <Summary label="Pending invites" value={invited} />
        <Summary label="Admins" value={admins} />
      </div>

      {notice ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-900 bg-emerald-950/40 text-emerald-200" : "border-red-900 bg-red-950/50 text-red-200"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      <InviteForm disabled={pending} onInvite={(input) => run(() => inviteUserAction(input))} />

      {missingPresets.length ? (
        <section className="card border-brand/40 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-brand" /> Preset admins without an account
          </h2>
          <p className="mt-1 text-xs text-muted">These emails are listed in ADMIN_EMAILS but haven&apos;t been invited yet.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {missingPresets.map((email) => (
              <li key={email}>
                <button className="btn-ghost py-1.5 text-xs" disabled={pending} onClick={() => run(() => inviteUserAction({ email, role: "admin" }))} type="button">
                  <MailPlus className="h-3.5 w-3.5" /> Invite {email}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Users</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Person</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Last sign-in</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const locked = row.isPreset || row.isSelf;
                return (
                  <tr className={`border-t border-line ${row.isActive ? "" : "opacity-60"}`} key={row.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-panel-2 text-muted">
                          <UserRound className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <input
                            aria-label={`Name for ${row.email}`}
                            className="w-full max-w-56 rounded bg-transparent font-semibold text-white outline-none placeholder:font-normal placeholder:text-neutral-600 focus:ring-1 focus:ring-brand"
                            defaultValue={row.name ?? ""}
                            onBlur={(e) => {
                              if (e.target.value.trim() !== (row.name ?? "")) run(() => renameUserAction(row.id, e.target.value));
                            }}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            placeholder="Add a name"
                          />
                          <div className="truncate text-xs text-muted">
                            {row.email}
                            {row.isSelf ? " · you" : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.isPreset ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand/20 px-2.5 py-1 text-xs font-semibold text-white" title="Set by ADMIN_EMAILS">
                          <Lock className="h-3 w-3" /> Preset admin
                        </span>
                      ) : (
                        <select
                          aria-label={`Role for ${row.email}`}
                          className="rounded border border-line bg-ink px-2 py-1 text-xs text-neutral-200 disabled:opacity-60"
                          disabled={pending || row.isSelf}
                          onChange={(e) => run(() => setRoleAction(row.id, e.target.value as "admin" | "member"))}
                          value={row.role}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!row.isActive ? (
                        <Badge tone="muted">Deactivated</Badge>
                      ) : row.invitedPending ? (
                        <Badge tone="amber">Invited</Badge>
                      ) : (
                        <Badge tone="green">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{formatWhen(row.lastSignInAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {row.invitedPending && row.isActive ? (
                          <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={pending} onClick={() => run(() => resendInviteAction(row.id))} type="button">
                            <RotateCw className="h-3.5 w-3.5" /> Resend
                          </button>
                        ) : null}
                        {!locked ? (
                          <button
                            className="btn-ghost px-2.5 py-1.5 text-xs"
                            disabled={pending}
                            onClick={() => run(() => setActiveAction(row.id, !row.isActive))}
                            type="button"
                          >
                            {row.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        ) : null}
                        {!locked ? (
                          confirmDelete === row.id ? (
                            <>
                              <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setConfirmDelete(null)} type="button">Cancel</button>
                              <button
                                className="btn-danger px-2.5 py-1.5 text-xs"
                                disabled={pending}
                                onClick={() => {
                                  setConfirmDelete(null);
                                  run(() => deleteUserAction(row.id));
                                }}
                                type="button"
                              >
                                Confirm delete
                              </button>
                            </>
                          ) : (
                            <button aria-label={`Delete ${row.email}`} className="btn-ghost px-2 py-1.5 text-xs hover:text-brand" onClick={() => setConfirmDelete(row.id)} type="button">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InviteForm({ onInvite, disabled }: { onInvite: (input: { email: string; fullName: string; role: string }) => void; disabled: boolean }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("member");

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white">
        <MailPlus className="h-4 w-4 text-brand" /> Invite someone
      </h2>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          onInvite({ email, fullName, role });
          setEmail("");
          setFullName("");
          setRole("member");
        }}
      >
        <input aria-label="Email" className="field" onChange={(e) => setEmail(e.target.value)} placeholder="name@five9media.com" required type="email" value={email} />
        <input aria-label="Full name" className="field" onChange={(e) => setFullName(e.target.value)} placeholder="Full name (optional)" value={fullName} />
        <select aria-label="Role" className="field" onChange={(e) => setRole(e.target.value)} value={role}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn-primary" disabled={disabled} type="submit">Send invite</button>
      </form>
      <p className="mt-2 text-xs text-muted">They&apos;ll get an email with a link to set their password.</p>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums text-white">{value}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "green" | "amber" | "muted"; children: React.ReactNode }) {
  const styles = {
    green: "bg-emerald-950 text-emerald-300 ring-emerald-800",
    amber: "bg-amber-950 text-amber-300 ring-amber-800",
    muted: "bg-panel-2 text-muted ring-line",
  } as const;
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[tone]}`}>{children}</span>;
}
