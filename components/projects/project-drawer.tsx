"use client";

import { Archive, ArchiveRestore, Link2, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  addCommentAction,
  addExpenseAction,
  addSubtaskAction,
  deleteCommentAction,
  deleteExpenseAction,
  deleteProjectAction,
  deleteSubtaskAction,
  setProjectArchivedAction,
  toggleAssigneeAction,
  updateExpenseStatusAction,
  updateProjectAction,
  updateSubtaskAction,
  type ProjectPatch,
} from "@/app/(app)/projects/actions";
import {
  EXPENSE_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  SUBTASK_STATUSES,
  type ExpenseStatus,
  type SubtaskStatus,
} from "@/lib/projects/constants";
import { projectCode, type Person, type Project, type Subtask } from "@/lib/projects/types";
import { Dialog } from "./dialog";
import type { Mutate } from "./project-board";
import { Avatar, SUBTASK_STYLE, formatDateTime, formatMoney } from "./ui";

type Props = {
  project: Project;
  team: Person[];
  teamById: Map<string, Person>;
  currentUser: { id: string; isAdmin: boolean };
  mutate: Mutate;
  onClose: () => void;
  onError: (message: string) => void;
};

const tempId = () => `temp-${Math.random().toString(36).slice(2)}`;

export function ProjectDrawer({ project, team, teamById, currentUser, mutate, onClose, onError }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  /** Patch this project locally and on the server. */
  function patch(local: Partial<Project>, server: ProjectPatch) {
    mutate(
      (list) => list.map((p) => (p.id === project.id ? { ...p, ...local } : p)),
      () => updateProjectAction(project.id, server),
    );
  }

  function updateLocal(update: (p: Project) => Project) {
    return (list: Project[]) => list.map((p) => (p.id === project.id ? update(p) : p));
  }

  return (
    <Dialog
      header={
        <div>
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-brand">{projectCode(project.number)}</div>
          <input
            aria-label="Project title"
            className="mt-1 w-full rounded bg-transparent text-xl font-bold text-white outline-none focus:ring-1 focus:ring-brand"
            defaultValue={project.title}
            maxLength={200}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (!title) e.target.value = project.title;
              else if (title !== project.title) patch({ title }, { title });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
      }
      onClose={onClose}
      side
      title={`${projectCode(project.number)} ${project.title}`}
    >
      <div className="space-y-8 p-5">
        {project.archivedAt ? (
          <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-muted">This project is archived.</p>
        ) : null}

        {/* Details */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select className="field" onChange={(e) => patch({ status: e.target.value as Project["status"] }, { status: e.target.value })} value={project.status}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="field" onChange={(e) => patch({ priority: e.target.value as Project["priority"] }, { priority: e.target.value })} value={project.priority}>
              {PROJECT_PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select className="field" onChange={(e) => patch({ projectType: e.target.value || null }, { projectType: e.target.value })} value={project.projectType ?? ""}>
              <option value="">No type</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Client">
            <input
              className="field"
              defaultValue={project.client ?? ""}
              maxLength={200}
              onBlur={(e) => {
                const client = e.target.value.trim();
                if (client !== (project.client ?? "")) patch({ client: client || null }, { client });
              }}
              placeholder="Client or internal"
            />
          </Field>
          <Field label="Start date">
            <input className="field" onChange={(e) => patch({ startDate: e.target.value || null }, { startDate: e.target.value })} type="date" value={project.startDate ?? ""} />
          </Field>
          <Field label="Due date">
            <input className="field" onChange={(e) => patch({ dueDate: e.target.value || null }, { dueDate: e.target.value })} type="date" value={project.dueDate ?? ""} />
          </Field>
        </section>

        {/* Team */}
        <section>
          <h3 className="label">Team</h3>
          <div className="flex flex-wrap gap-2">
            {team.map((person) => {
              const on = project.assigneeIds.includes(person.id);
              return (
                <button
                  aria-pressed={on}
                  className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold ${on ? "border-brand bg-brand/15 text-white" : "border-line text-muted hover:text-white"}`}
                  key={person.id}
                  onClick={() =>
                    mutate(
                      updateLocal((p) => ({
                        ...p,
                        assigneeIds: on ? p.assigneeIds.filter((id) => id !== person.id) : [...p.assigneeIds, person.id],
                      })),
                      () => toggleAssigneeAction(project.id, person.id, !on),
                    )
                  }
                  type="button"
                >
                  <Avatar person={person} />
                  {person.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* Description */}
        <section>
          <label className="label" htmlFor="pd-description">Description</label>
          <textarea
            className="field min-h-32"
            defaultValue={project.description ?? ""}
            id="pd-description"
            onBlur={(e) => {
              const description = e.target.value;
              if (description.trim() !== (project.description ?? "").trim()) patch({ description: description.trim() || null }, { description });
            }}
            placeholder="Goals, deliverables, links, notes…"
          />
        </section>

        <Subtasks currentProject={project} mutate={mutate} onError={onError} team={team} teamById={teamById} updateLocal={updateLocal} />

        <Budget currentProject={project} mutate={mutate} onError={onError} patch={patch} updateLocal={updateLocal} />

        <Comments currentProject={project} currentUser={currentUser} mutate={mutate} teamById={teamById} updateLocal={updateLocal} />

        {/* Actions */}
        <section className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <button
            className="btn-ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            type="button"
          >
            <Link2 className="h-4 w-4" /> {copied ? "Link copied" : "Copy link"}
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              const archived = !project.archivedAt;
              mutate(
                updateLocal((p) => ({ ...p, archivedAt: archived ? new Date().toISOString() : null })),
                () => setProjectArchivedAction(project.id, archived),
              );
              if (archived) onClose();
            }}
            type="button"
          >
            {project.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {project.archivedAt ? "Restore" : "Archive"}
          </button>
          {currentUser.isAdmin ? (
            confirmDelete ? (
              <span className="ml-auto flex items-center gap-2 text-sm">
                <span className="text-red-300">Delete permanently?</span>
                <button className="btn-ghost px-2.5 py-1.5" onClick={() => setConfirmDelete(false)} type="button">Cancel</button>
                <button
                  className="btn-danger px-2.5 py-1.5"
                  onClick={() => {
                    onClose();
                    mutate((list) => list.filter((p) => p.id !== project.id), () => deleteProjectAction(project.id));
                  }}
                  type="button"
                >
                  Delete
                </button>
              </span>
            ) : (
              <button className="btn-danger ml-auto" onClick={() => setConfirmDelete(true)} type="button">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

type SectionProps = {
  currentProject: Project;
  mutate: Mutate;
  updateLocal: (update: (p: Project) => Project) => (list: Project[]) => Project[];
};

function Subtasks({
  currentProject: project,
  mutate,
  updateLocal,
  team,
  teamById,
  onError,
}: SectionProps & { team: Person[]; teamById: Map<string, Person>; onError: (m: string) => void }) {
  const [title, setTitle] = useState("");
  const done = project.subtasks.filter((s) => s.status === "done").length;
  const total = project.subtasks.length;

  function updateSubtask(subtask: Subtask, local: Partial<Subtask>, server: Parameters<typeof updateSubtaskAction>[1]) {
    if (subtask.id.startsWith("temp-")) return onError("Hold on — that subtask is still saving.");
    mutate(
      updateLocal((p) => ({ ...p, subtasks: p.subtasks.map((s) => (s.id === subtask.id ? { ...s, ...local } : s)) })),
      () => updateSubtaskAction(subtask.id, server),
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="label mb-0">Subtasks</h3>
        {total ? (
          <>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2" aria-hidden="true">
              <div className="h-full bg-brand transition-all" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span className="text-xs text-muted">{done}/{total} done</span>
          </>
        ) : null}
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {project.subtasks.map((subtask) => (
          <li className="flex flex-wrap items-center gap-2 px-3 py-2" key={subtask.id}>
            <input
              aria-label="Subtask title"
              className={`min-w-40 flex-1 rounded bg-transparent text-sm outline-none focus:ring-1 focus:ring-brand ${subtask.status === "done" ? "text-muted line-through" : "text-white"}`}
              defaultValue={subtask.title}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (!value) e.target.value = subtask.title;
                else if (value !== subtask.title) updateSubtask(subtask, { title: value }, { title: value });
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <select
              aria-label={`Status for ${subtask.title}`}
              className={`rounded px-2 py-1 text-xs font-semibold outline-none ${SUBTASK_STYLE[subtask.status]}`}
              onChange={(e) => updateSubtask(subtask, { status: e.target.value as SubtaskStatus }, { status: e.target.value })}
              value={subtask.status}
            >
              {SUBTASK_STATUSES.map((s) => (
                <option className="bg-panel text-white" key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
            <select
              aria-label={`Assignee for ${subtask.title}`}
              className="max-w-36 rounded border border-line bg-ink px-2 py-1 text-xs text-neutral-200"
              onChange={(e) => updateSubtask(subtask, { assigneeId: e.target.value || null }, { assigneeId: e.target.value || null })}
              value={subtask.assigneeId ?? ""}
            >
              <option value="">Unassigned</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              {subtask.assigneeId && !teamById.has(subtask.assigneeId) ? <option value={subtask.assigneeId}>Former member</option> : null}
            </select>
            <input
              aria-label={`Due date for ${subtask.title}`}
              className="rounded border border-line bg-ink px-2 py-1 text-xs text-neutral-200"
              onChange={(e) => updateSubtask(subtask, { dueDate: e.target.value || null }, { dueDate: e.target.value || null })}
              type="date"
              value={subtask.dueDate ?? ""}
            />
            <button
              aria-label={`Delete ${subtask.title}`}
              className="rounded p-1 text-neutral-500 hover:text-brand"
              onClick={() => {
                if (subtask.id.startsWith("temp-")) return;
                mutate(updateLocal((p) => ({ ...p, subtasks: p.subtasks.filter((s) => s.id !== subtask.id) })), () => deleteSubtaskAction(subtask.id));
              }}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        <li className="px-3 py-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const clean = title.trim();
              if (!clean) return;
              setTitle("");
              const temp: Subtask = { id: tempId(), title: clean, status: "not_started", assigneeId: null, dueDate: null, sortOrder: Number.MAX_SAFE_INTEGER };
              mutate(updateLocal((p) => ({ ...p, subtasks: [...p.subtasks, temp] })), () => addSubtaskAction(project.id, clean));
            }}
          >
            <input className="field py-1.5" maxLength={240} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask…" value={title} />
            <button className="btn-ghost py-1.5" disabled={!title.trim()} type="submit">Add</button>
          </form>
        </li>
      </ul>
    </section>
  );
}

function Budget({
  currentProject: project,
  mutate,
  updateLocal,
  patch,
  onError,
}: SectionProps & { patch: (local: Partial<Project>, server: ProjectPatch) => void; onError: (m: string) => void }) {
  const [desc, setDesc] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("planned");

  const active = project.expenses.filter((e) => e.status !== "cancelled");
  const spent = active.filter((e) => e.status === "paid").reduce((sum, e) => sum + e.amountCents, 0);
  const committed = active.filter((e) => e.status === "committed").reduce((sum, e) => sum + e.amountCents, 0);
  const planned = active.filter((e) => e.status === "planned").reduce((sum, e) => sum + e.amountCents, 0);
  const remaining = project.budgetCents - spent - committed - planned;
  const usedPct = project.budgetCents ? Math.min(100, ((spent + committed) / project.budgetCents) * 100) : 0;

  function toCents(value: string) {
    const n = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  }

  return (
    <section>
      <h3 className="label">Budget & expenses</h3>
      <div className="rounded-lg border border-line">
        <div className="grid gap-4 border-b border-line p-3 sm:grid-cols-[12rem_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Approved budget</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
              <input
                className="field pl-7 tabular-nums"
                defaultValue={project.budgetCents ? (project.budgetCents / 100).toFixed(2) : ""}
                inputMode="decimal"
                onBlur={(e) => {
                  const value = e.target.value.trim() === "" ? 0 : toCents(e.target.value);
                  if (value === null) {
                    onError("Enter the budget as a number, like 2500.");
                    e.target.value = project.budgetCents ? (project.budgetCents / 100).toFixed(2) : "";
                  } else if (value !== project.budgetCents) {
                    patch({ budgetCents: value }, { budgetCents: value });
                  }
                }}
                placeholder="0.00"
              />
            </div>
          </label>
          <dl className="grid grid-cols-4 gap-2 text-center">
            <Stat label="Paid" value={formatMoney(spent)} />
            <Stat label="Committed" value={formatMoney(committed)} />
            <Stat label="Planned" value={formatMoney(planned)} />
            <Stat label="Remaining" tone={remaining < 0 ? "text-brand" : "text-emerald-400"} value={formatMoney(remaining)} />
          </dl>
          {project.budgetCents ? (
            <div className="sm:col-span-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div className={`h-full ${remaining < 0 ? "bg-brand" : "bg-emerald-500"}`} style={{ width: `${usedPct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{Math.round(usedPct)}% of budget paid or committed</p>
            </div>
          ) : null}
        </div>
        {project.expenses.length ? (
          <ul className="divide-y divide-line">
            {project.expenses.map((expense) => (
              <li className="flex items-center gap-3 px-3 py-2 text-sm" key={expense.id}>
                <div className="min-w-0 flex-1">
                  <div className={`truncate ${expense.status === "cancelled" ? "text-muted line-through" : "text-white"}`}>{expense.description}</div>
                  {expense.vendor ? <div className="truncate text-xs text-muted">{expense.vendor}</div> : null}
                </div>
                <select
                  aria-label={`Status for ${expense.description}`}
                  className="rounded border border-line bg-ink px-2 py-1 text-xs text-neutral-200"
                  onChange={(e) => {
                    if (expense.id.startsWith("temp-")) return;
                    const next = e.target.value as ExpenseStatus;
                    mutate(
                      updateLocal((p) => ({ ...p, expenses: p.expenses.map((x) => (x.id === expense.id ? { ...x, status: next } : x)) })),
                      () => updateExpenseStatusAction(expense.id, next),
                    );
                  }}
                  value={expense.status}
                >
                  {EXPENSE_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.name}</option>
                  ))}
                </select>
                <span className="w-24 text-right tabular-nums text-neutral-200">{formatMoney(expense.amountCents, true)}</span>
                <button
                  aria-label={`Delete ${expense.description}`}
                  className="rounded p-1 text-neutral-500 hover:text-brand"
                  onClick={() => {
                    if (expense.id.startsWith("temp-")) return;
                    mutate(updateLocal((p) => ({ ...p, expenses: p.expenses.filter((x) => x.id !== expense.id) })), () => deleteExpenseAction(expense.id));
                  }}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="grid gap-2 border-t border-line p-3 sm:grid-cols-[1fr_1fr_7rem_7rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const cleanDesc = desc.trim();
            const value = toCents(amount);
            if (!cleanDesc) return onError("Describe the expense.");
            if (value === null) return onError("Enter the amount as a number, like 450.");
            setDesc("");
            setVendor("");
            setAmount("");
            const temp = { id: tempId(), description: cleanDesc, vendor: vendor.trim() || null, status, amountCents: value, expenseDate: null };
            mutate(updateLocal((p) => ({ ...p, expenses: [...p.expenses, temp] })), () =>
              addExpenseAction(project.id, { description: cleanDesc, vendor, status, amountCents: value }),
            );
          }}
        >
          <input aria-label="Expense description" className="field py-1.5" maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder="Expense (e.g. drone rental)" value={desc} />
          <input aria-label="Vendor" className="field py-1.5" maxLength={200} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" value={vendor} />
          <input aria-label="Amount" className="field py-1.5 tabular-nums" inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="$0.00" value={amount} />
          <select aria-label="Expense status" className="field py-1.5" onChange={(e) => setStatus(e.target.value as ExpenseStatus)} value={status}>
            {EXPENSE_STATUSES.filter((s) => s.key !== "cancelled").map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
          <button className="btn-ghost py-1.5" type="submit">Add</button>
        </form>
      </div>
    </section>
  );
}

function Stat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md bg-panel-2 px-2 py-2">
      <dt className="text-[0.65rem] uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`mt-0.5 text-sm font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function Comments({
  currentProject: project,
  mutate,
  updateLocal,
  teamById,
  currentUser,
}: SectionProps & { teamById: Map<string, Person>; currentUser: { id: string; isAdmin: boolean } }) {
  const [body, setBody] = useState("");

  function submit() {
    const clean = body.trim();
    if (!clean) return;
    setBody("");
    const temp = { id: tempId(), body: clean, authorId: currentUser.id, createdAt: new Date().toISOString() };
    mutate(updateLocal((p) => ({ ...p, comments: [...p.comments, temp] })), () => addCommentAction(project.id, clean));
  }

  return (
    <section>
      <h3 className="label">Updates ({project.comments.length})</h3>
      <ul className="space-y-3">
        {project.comments.map((comment) => {
          const author = comment.authorId ? teamById.get(comment.authorId) : undefined;
          const canDelete = !comment.id.startsWith("temp-") && (comment.authorId === currentUser.id || currentUser.isAdmin);
          return (
            <li className="flex gap-3" key={comment.id}>
              {author ? <Avatar person={author} size="md" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-panel-2" />}
              <div className="min-w-0 flex-1 rounded-lg bg-panel-2 px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-white">{author?.name ?? "Former member"}</span>
                  <span className="text-muted">{formatDateTime(comment.createdAt)}</span>
                  {canDelete ? (
                    <button
                      aria-label="Delete update"
                      className="ml-auto text-neutral-500 hover:text-brand"
                      onClick={() =>
                        mutate(updateLocal((p) => ({ ...p, comments: p.comments.filter((c) => c.id !== comment.id) })), () => deleteCommentAction(comment.id))
                      }
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-200">{comment.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          aria-label="Post an update"
          className="field min-h-11 flex-1 resize-y"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Post an update for the team… (⌘↵ to send)"
          rows={2}
          value={body}
        />
        <button aria-label="Send update" className="btn-primary h-11" disabled={!body.trim()} type="submit">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
