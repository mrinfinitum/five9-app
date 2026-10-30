"use client";

import { ExternalLink, ImagePlus, Pencil, KanbanSquare, Lock, MailPlus, Plus, RotateCw, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  createBoardAction,
  createBoardLogoUploadAction,
  setBoardLogoAction,
  setBoardLogoTintAction,
  deleteBoardAction,
  deleteUserAction,
  inviteUserAction,
  renameUserAction,
  resendInviteAction,
  setActiveAction,
  setBoardAccessAction,
  setRoleAction,
  updateBoardAction,
  type AdminResult,
} from "@/app/(app)/admin/actions";
import { LogoImage } from "@/components/board-logo";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { BOARD_LOGO_BUCKET, LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/requests/constants";
import { createClient } from "@/lib/supabase/client";

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
  /** Boards this person is a member of (admins see every board regardless). */
  boardIds: string[];
};

export type AdminBoardRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoDarkUrl: string | null;
  logoLightUrl: string | null;
  logoDarkTint: string | null;
  logoLightTint: string | null;
  /** PNG copy used in emails (generated from the light-mode logo). */
  emailLogoUrl: string | null;
  requestCount: number;
};

function formatWhen(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminConsole({ users, boards, missingPresets }: { users: AdminUserRow[]; boards: AdminBoardRow[]; missingPresets: string[] }) {
  const [tab, setTab] = useState<"users" | "boards">("users");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function run(action: () => Promise<AdminResult>, success?: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice({ tone: "error", text: result.error });
      else if (result.message || success) setNotice({ tone: "ok", text: result.message ?? success! });
    });
  }

  const activeMembers = users.filter((u) => u.isActive && !u.invitedPending).length;
  const invited = users.filter((u) => u.invitedPending && u.isActive).length;
  const admins = users.filter((u) => u.role === "admin" && u.isActive).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Active users" value={activeMembers} />
        <Summary label="Pending invites" value={invited} />
        <Summary label="Admins" value={admins} />
        <Summary label="Boards" value={boards.length} />
      </div>

      <div className="flex gap-1 rounded-lg border border-line bg-panel p-1 sm:w-fit" role="tablist">
        {(
          [
            ["users", "Users", Users],
            ["boards", "Boards", KanbanSquare],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            aria-selected={tab === key}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold ${tab === key ? "bg-brand text-on-brand" : "text-muted hover:text-white"}`}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {notice ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-900 bg-emerald-950/40 text-emerald-200" : "border-red-900 bg-red-950/50 text-red-200"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      {tab === "users" ? (
        <UsersTab boards={boards} missingPresets={missingPresets} pending={pending} run={run} users={users} />
      ) : (
        <BoardsTab boards={boards} pending={pending} run={run} users={users} />
      )}
    </div>
  );
}

type Run = (action: () => Promise<AdminResult>, success?: string) => void;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersTab({
  users,
  boards,
  missingPresets,
  pending,
  run,
}: {
  users: AdminUserRow[];
  boards: AdminBoardRow[];
  missingPresets: string[];
  pending: boolean;
  run: Run;
}) {
  const [confirmDelete, setConfirmDelete] = useState<AdminUserRow | null>(null);
  const [accessFor, setAccessFor] = useState<AdminUserRow | null>(null);
  const boardName = new Map(boards.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <InviteForm boards={boards} disabled={pending} onInvite={(input) => run(() => inviteUserAction(input))} />

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
        <div className="md:overflow-x-auto">
          {/* Phones: each user is a stacked card. Wider screens: a regular table. */}
          <table className="block w-full text-left text-sm md:table md:min-w-[860px]">
            <thead className="hidden text-xs uppercase tracking-wider text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-2 font-semibold">Person</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Boards</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Last sign-in</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {users.map((row) => {
                const locked = row.isPreset || row.isSelf;
                return (
                  <tr className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 align-top md:table-row md:p-0 ${row.isActive ? "" : "opacity-60"}`} key={row.id}>
                    <td className="w-full md:table-cell md:w-auto md:px-4 md:py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel-2 text-muted">
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
                    <td className="md:table-cell md:px-4 md:py-3">
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
                    <td className="w-full md:table-cell md:w-auto md:px-4 md:py-3">
                      {row.role === "admin" ? (
                        <span className="text-xs text-muted">All boards</span>
                      ) : (
                        <div className="flex max-w-72 flex-wrap items-center gap-1">
                          {row.boardIds.length ? (
                            row.boardIds.map((boardId) => (
                              <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[0.7rem] text-neutral-300" key={boardId}>
                                {boardName.get(boardId) ?? "Board"}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-amber-300">No boards</span>
                          )}
                          <button className="text-xs font-semibold text-muted underline-offset-2 hover:text-white hover:underline" onClick={() => setAccessFor(row)} type="button">
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="md:table-cell md:px-4 md:py-3">
                      {!row.isActive ? <Badge tone="muted">Deactivated</Badge> : row.invitedPending ? <Badge tone="amber">Invited</Badge> : <Badge tone="green">Active</Badge>}
                    </td>
                    <td className="text-xs text-muted md:table-cell md:px-4 md:py-3"><span className="md:hidden">Last sign-in: </span>{formatWhen(row.lastSignInAt)}</td>
                    <td className="w-full md:table-cell md:w-auto md:px-4 md:py-3">
                      <div className="flex items-center gap-1.5 md:justify-end">
                        {row.invitedPending && row.isActive ? (
                          <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={pending} onClick={() => run(() => resendInviteAction(row.id))} type="button">
                            <RotateCw className="h-3.5 w-3.5" /> Resend
                          </button>
                        ) : null}
                        {!locked ? (
                          <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={pending} onClick={() => run(() => setActiveAction(row.id, !row.isActive))} type="button">
                            {row.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        ) : null}
                        {!locked ? (
                          <button aria-label={`Delete ${row.email}`} className="btn-ghost px-2 py-1.5 text-xs hover:text-brand" onClick={() => setConfirmDelete(row)} type="button">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {accessFor ? (
        <Dialog onClose={() => setAccessFor(null)} size="sm" title={`Boards for ${accessFor.name ?? accessFor.email}`}>
          <div className="space-y-2 p-5">
            <p className="text-xs text-muted">Members have full control of their boards.</p>
            {boards.length ? (
              boards.map((board) => (
                <MemberCheckbox
                  checked={accessFor.boardIds.includes(board.id)}
                  disabled={pending}
                  key={board.id}
                  label={board.name}
                  onChange={(member) => {
                    run(() => setBoardAccessAction(board.id, accessFor.id, member));
                    setAccessFor({ ...accessFor, boardIds: toggled(accessFor.boardIds, board.id, member) });
                  }}
                />
              ))
            ) : (
              <p className="text-sm text-muted">Create a board first.</p>
            )}
          </div>
        </Dialog>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          body={<p>Remove <strong className="text-white">{confirmDelete.email}</strong>? They lose access immediately. Their past requests and comments stay.</p>}
          confirmLabel="Remove user"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const target = confirmDelete;
            setConfirmDelete(null);
            run(() => deleteUserAction(target.id));
          }}
          title="Remove this user?"
        />
      ) : null}
    </div>
  );
}

function toggled(ids: string[], id: string, on: boolean) {
  return on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id);
}

function MemberCheckbox({
  label,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  detail?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-panel-2 px-3 py-2">
      <input checked={checked} className="h-4 w-4 shrink-0 accent-brand" disabled={disabled} onChange={(e) => onChange(e.target.checked)} type="checkbox" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white">{label}</span>
        {detail ? <span className="block truncate text-xs text-muted">{detail}</span> : null}
      </span>
    </label>
  );
}

function InviteForm({
  boards,
  onInvite,
  disabled,
}: {
  boards: AdminBoardRow[];
  onInvite: (input: { email: string; fullName: string; role: string; boardIds: string[] }) => void;
  disabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("member");
  const [boardIds, setBoardIds] = useState<string[]>([]);

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white">
        <MailPlus className="h-4 w-4 text-brand" /> Invite someone
      </h2>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onInvite({
            email,
            fullName,
            role,
            boardIds: role === "admin" ? [] : boardIds,
          });
          setEmail("");
          setFullName("");
          setRole("member");
          setBoardIds([]);
        }}
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto]">
          <input aria-label="Email" className="field" onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required type="email" value={email} />
          <input aria-label="Full name" className="field" onChange={(e) => setFullName(e.target.value)} placeholder="Full name (optional)" value={fullName} />
          <select aria-label="Role" className="field" onChange={(e) => setRole(e.target.value)} value={role}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn-primary" disabled={disabled} type="submit">Send invite</button>
        </div>
        {role === "member" ? (
          boards.length ? (
            <div>
              <span className="label">Boards</span>
              <p className="mb-2 text-xs text-muted">Tick the boards they&apos;re a member of. Members have full control of those boards.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {boards.map((board) => (
                  <MemberCheckbox
                    checked={boardIds.includes(board.id)}
                    key={board.id}
                    label={board.name}
                    onChange={(member) => setBoardIds((current) => toggled(current, board.id, member))}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-300">Create a board first so new members have somewhere to go.</p>
          )
        ) : (
          <p className="text-xs text-muted">Admins see every board, plus this admin screen.</p>
        )}
      </form>
      <p className="mt-2 text-xs text-muted">They&apos;ll get an email with a link to set their password.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

function BoardsTab({ boards, users, pending, run }: { boards: AdminBoardRow[]; users: AdminUserRow[]; pending: boolean; run: Run }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [membersFor, setMembersFor] = useState<AdminBoardRow | null>(null);
  const [deleting, setDeleting] = useState<AdminBoardRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [localBoards, setLocalBoards] = useState<Record<string, string[]>>({});
  const members = users.filter((u) => u.role !== "admin");
  const isMember = (user: AdminUserRow, boardId: string) => (localBoards[user.id] ?? user.boardIds).includes(boardId);

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4 text-brand" /> New board
        </h2>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createBoardAction({ name, description }));
            setName("");
            setDescription("");
          }}
        >
          <input aria-label="Board name" className="field" maxLength={80} minLength={2} onChange={(e) => setName(e.target.value)} placeholder="Board name, e.g. Client — Cascade Dental" required value={name} />
          <input aria-label="Description" className="field" maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="What this board is for (optional)" value={description} />
          <button className="btn-primary" disabled={pending} type="submit">Create board</button>
        </form>
      </section>

      <section className="space-y-3">
        {boards.length ? (
          boards.map((board) => {
            const memberCount = members.filter((u) => isMember(u, board.id)).length;
            return (
              <article className="card p-4" key={board.id}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <LogoEditor board={board} disabled={pending} run={run} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <label className="group flex items-center gap-2">
                    <input
                      aria-label="Board name"
                      className="-mx-2 w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 text-lg font-bold text-white outline-none hover:border-line focus:border-brand"
                      defaultValue={board.name}
                      title="Click to rename this board"
                      maxLength={80}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value && value !== board.name) run(() => updateBoardAction(board.id, { name: value }), "Board renamed.");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    />
                    <Pencil aria-hidden="true" className="h-4 w-4 shrink-0 text-muted opacity-60 group-hover:opacity-100" />
                    </label>
                    <input
                      aria-label="Board description"
                      className="w-full rounded bg-transparent text-sm text-muted outline-none placeholder:text-neutral-600 focus:ring-1 focus:ring-brand"
                      defaultValue={board.description ?? ""}
                      maxLength={300}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (board.description ?? "")) run(() => updateBoardAction(board.id, { description: e.target.value }), "Description saved.");
                      }}
                      placeholder="Add a description"
                    />
                    <p className="text-xs text-muted">
                      Link: /b/{board.slug} (stays the same if you rename) · {board.requestCount} request{board.requestCount === 1 ? "" : "s"} · {memberCount} member
                      {memberCount === 1 ? "" : "s"} · admins see all boards
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link className="btn-ghost px-2.5 py-1.5 text-xs" href={`/b/${board.slug}`}>
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </Link>
                    <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setMembersFor(board)} type="button">
                      <Users className="h-3.5 w-3.5" /> Members
                    </button>
                    <button
                      className="btn-danger px-2.5 py-1.5 text-xs"
                      onClick={() => {
                        setConfirmText("");
                        setDeleting(board);
                      }}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="card p-6 text-sm text-muted">No boards yet. Create one above.</p>
        )}
      </section>

      {membersFor ? (
        <Dialog onClose={() => setMembersFor(null)} size="sm" title={`Members of ${membersFor.name}`}>
          <div className="space-y-2 p-5">
            <p className="text-xs text-muted">Members have full control of this board. Admins always have access.</p>
            {members.length ? (
              members.map((user) => (
                <MemberCheckbox
                  checked={isMember(user, membersFor.id)}
                  detail={user.name ? user.email : null}
                  disabled={pending}
                  key={user.id}
                  label={user.name ?? user.email}
                  onChange={(member) => {
                    setLocalBoards((current) => ({ ...current, [user.id]: toggled(current[user.id] ?? user.boardIds, membersFor.id, member) }));
                    run(() => setBoardAccessAction(membersFor.id, user.id, member));
                  }}
                />
              ))
            ) : (
              <p className="text-sm text-muted">Invite members from the Users tab first.</p>
            )}
          </div>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          body={
            <>
              <p>
                This permanently deletes <strong className="text-white">{deleting.name}</strong> and its {deleting.requestCount} request
                {deleting.requestCount === 1 ? "" : "s"}, including conversations and files. It can&apos;t be undone.
              </p>
              <label className="block">
                <span className="label">Type the board name to confirm</span>
                <input autoFocus className="field" onChange={(e) => setConfirmText(e.target.value)} value={confirmText} />
              </label>
            </>
          }
          confirmLabel="Delete board"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            if (confirmText.trim() !== deleting.name) return;
            const target = deleting;
            setDeleting(null);
            run(() => deleteBoardAction(target.id));
          }}
          title="Delete this board?"
        />
      ) : null}
    </div>
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

function LogoEditor({ board, disabled, run }: { board: AdminBoardRow; disabled: boolean; run: Run }) {
  const onlyOne = Boolean(board.logoDarkUrl) !== Boolean(board.logoLightUrl);
  return (
    <div className="w-full shrink-0 space-y-2 md:w-72">
      <div className="grid grid-cols-2 gap-2">
        <LogoSlot board={board} disabled={disabled} mode="dark" run={run} />
        <LogoSlot board={board} disabled={disabled} mode="light" run={run} />
      </div>
      {board.emailLogoUrl ? (
        <div
          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
            !board.logoLightUrl && !board.logoLightTint ? "border-[#2a2a2a] bg-[#0a0a0a]" : "border-[#e0e0de] bg-[#ffffff]"
          }`}
          title="PNG copy used in emails"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG preview */}
          <img alt={`${board.name} email logo`} className="h-6 w-auto max-w-[140px] object-contain" src={board.emailLogoUrl} />
          <span className="ml-auto text-[0.6rem] font-semibold uppercase tracking-wider text-[#686868]">Email · PNG</span>
        </div>
      ) : null}
      <p className="text-[0.7rem] text-muted">
        {onlyOne
          ? "One logo is used in both modes until you add the other — use Color to repaint it per mode."
          : "SVG, PNG, JPG, WebP or GIF · up to 2 MB each. Color repaints single-color logos."}
      </p>
    </div>
  );
}

function useLogoUpload(board: AdminBoardRow, mode: "dark" | "light", run: Run) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return setError("Use SVG, PNG, JPG, WebP, or GIF.");
    if (file.size > MAX_LOGO_BYTES) return setError("Up to 2 MB.");
    setBusy(true);
    try {
      const target = await createBoardLogoUploadAction(board.id, file.type, file.size);
      if (!target.ok) throw new Error(target.error);
      const { error: uploadError } = await createClient()
        .storage.from(BOARD_LOGO_BUCKET)
        .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);
      run(() => setBoardLogoAction(board.id, target.path, mode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, upload };
}

function UploadButton({ busy, disabled, label, onFile }: { busy: boolean; disabled: boolean; label: string; onFile: (file: File | undefined) => void }) {
  return (
    <label className={`btn-ghost cursor-pointer px-1.5 py-0.5 text-[0.7rem] ${busy || disabled ? "pointer-events-none opacity-60" : ""}`}>
      <ImagePlus className="h-3 w-3" /> {busy ? "Uploading…" : label}
      <input
        accept={LOGO_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        type="file"
      />
    </label>
  );
}

/** Preview on the background the logo will actually appear on. */
function LogoPreview({
  board,
  mode,
  src,
  tint,
  faded = false,
}: {
  board: AdminBoardRow;
  mode: "dark" | "light";
  src: string | null;
  tint: string | null;
  faded?: boolean;
}) {
  return (
    <div
      className={`relative grid h-16 place-items-center overflow-hidden rounded-lg border p-2 ${
        mode === "dark" ? "border-[#2a2a2a] bg-[#0a0a0a]" : "border-[#e0e0de] bg-[#f4f4f3]"
      }`}
      title={mode === "dark" ? "Dark mode" : "Light mode"}
    >
      {src ? (
        <span className={faded ? "opacity-60" : ""}>
          <LogoImage alt={`${board.name} ${mode} mode logo`} height={44} src={src} tint={tint} />
        </span>
      ) : (
        <span className={`text-[0.7rem] ${mode === "dark" ? "text-[#9a9a9a]" : "text-[#686868]"}`}>No logo</span>
      )}
      <span className={`absolute left-1 top-0.5 text-[0.55rem] font-semibold uppercase ${mode === "dark" ? "text-[#9a9a9a]" : "text-[#686868]"}`}>
        {mode}
      </span>
      {src && faded ? <span className="absolute bottom-0.5 right-1 text-[0.55rem] font-semibold uppercase text-brand">Shared</span> : null}
    </div>
  );
}

function LogoSlot({ board, mode, disabled, run }: { board: AdminBoardRow; mode: "dark" | "light"; disabled: boolean; run: Run }) {
  const { busy, error, upload } = useLogoUpload(board, mode, run);
  const own = mode === "dark" ? board.logoDarkUrl : board.logoLightUrl;
  const fallback = mode === "dark" ? board.logoLightUrl : board.logoDarkUrl;
  const shown = own ?? fallback;
  const tint = mode === "dark" ? board.logoDarkTint : board.logoLightTint;

  return (
    <div className="space-y-1">
      <LogoPreview board={board} faded={!own} mode={mode} src={shown} tint={tint} />
      <div className="flex flex-wrap gap-1">
        <UploadButton busy={busy} disabled={disabled} label={own ? "Replace" : "Upload"} onFile={upload} />
        {own ? (
          <button className="btn-ghost px-1.5 py-0.5 text-[0.7rem]" disabled={disabled} onClick={() => run(() => setBoardLogoAction(board.id, null, mode))} type="button">
            Remove
          </button>
        ) : null}
      </div>
      {shown ? <TintPicker disabled={disabled} mode={mode} onChange={(color) => run(() => setBoardLogoTintAction(board.id, mode, color))} value={tint} /> : null}
      {error ? <p className="text-[0.7rem] text-red-300" role="alert">{error}</p> : null}
    </div>
  );
}

const TINT_PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#121212" },
  { label: "Five9 red", value: "#e10600" },
];

/** Original colours, a preset, or any custom colour for one logo slot. */
function TintPicker({
  value,
  mode,
  disabled,
  onChange,
}: {
  value: string | null;
  mode: "dark" | "light";
  disabled: boolean;
  onChange: (color: string | null) => void;
}) {
  const [custom, setCustom] = useState(value ?? (mode === "dark" ? "#ffffff" : "#121212"));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swatch = "h-4 w-4 rounded-full ring-1 ring-[#8a8a8a]";
  return (
    <div className="space-y-1">
      <span className="block text-[0.6rem] font-semibold uppercase tracking-wider text-muted">Color</span>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${mode} mode logo color`}>
        <button
          aria-pressed={!value}
          className={`rounded px-1.5 py-0.5 text-[0.65rem] ${!value ? "bg-brand text-on-brand" : "text-muted hover:text-white"}`}
          disabled={disabled}
          onClick={() => onChange(null)}
          title="Keep the logo's own colors"
          type="button"
        >
          Original
        </button>
        {TINT_PRESETS.map((preset) => (
          <button
            aria-label={preset.label}
            aria-pressed={value === preset.value}
            className={`grid h-6 w-6 place-items-center rounded ${value === preset.value ? "ring-2 ring-brand" : ""}`}
            disabled={disabled}
            key={preset.value}
            onClick={() => onChange(preset.value)}
            title={preset.label}
            type="button"
          >
            <span className={swatch} style={{ background: preset.value }} />
          </button>
        ))}
        <label
          className={`relative grid h-6 w-6 cursor-pointer place-items-center rounded ${value && !TINT_PRESETS.some((p) => p.value === value) ? "ring-2 ring-brand" : ""}`}
          title="Custom color"
        >
          <span className={swatch} style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
          <input
            aria-label="Custom color"
            className="absolute inset-0 cursor-pointer opacity-0"
            disabled={disabled}
            onChange={(e) => {
              const color = e.target.value;
              setCustom(color);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => onChange(color), 500);
            }}
            type="color"
            value={custom}
          />
        </label>
      </div>
    </div>
  );
}
