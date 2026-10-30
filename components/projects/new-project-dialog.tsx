"use client";

import { useState, useTransition } from "react";
import { createProjectAction } from "@/app/(app)/projects/actions";
import { PROJECT_PRIORITIES, PROJECT_STATUSES, PROJECT_TYPES } from "@/lib/projects/constants";
import type { Person } from "@/lib/projects/types";
import { Dialog } from "./dialog";

export function NewProjectDialog({
  team,
  currentUserId,
  onClose,
  onCreated,
}: {
  team: Person[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (id: string | undefined) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([currentUserId]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "");
    setError(null);
    startTransition(async () => {
      const result = await createProjectAction({
        title: get("title"),
        description: get("description"),
        status: get("status"),
        priority: get("priority"),
        projectType: get("projectType"),
        client: get("client"),
        startDate: get("startDate"),
        dueDate: get("dueDate"),
        assigneeIds: assignees,
      });
      if (result.ok) onCreated(result.id);
      else setError(result.error);
    });
  }

  return (
    <Dialog onClose={onClose} title="New project">
      <form className="space-y-4 p-5" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="np-title">Title</label>
          <input autoFocus className="field" id="np-title" maxLength={200} name="title" placeholder="e.g. Spring brand video" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="np-client">Client</label>
            <input className="field" id="np-client" maxLength={200} name="client" placeholder="Client or internal" />
          </div>
          <div>
            <label className="label" htmlFor="np-type">Type</label>
            <select className="field" defaultValue="" id="np-type" name="projectType">
              <option value="">Choose a type…</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="np-status">Status</label>
            <select className="field" defaultValue="inbox" id="np-status" name="status">
              {PROJECT_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="np-priority">Priority</label>
            <select className="field" defaultValue="normal" id="np-priority" name="priority">
              {PROJECT_PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="np-start">Start date</label>
            <input className="field" id="np-start" name="startDate" type="date" />
          </div>
          <div>
            <label className="label" htmlFor="np-due">Due date</label>
            <input className="field" id="np-due" name="dueDate" type="date" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="np-description">Description</label>
          <textarea className="field min-h-24" id="np-description" name="description" placeholder="Goals, deliverables, links…" />
        </div>
        <fieldset>
          <legend className="label">Team</legend>
          <div className="flex flex-wrap gap-2">
            {team.map((person) => {
              const on = assignees.includes(person.id);
              return (
                <button
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-brand bg-brand/20 text-white" : "border-line text-muted hover:text-white"}`}
                  key={person.id}
                  onClick={() => setAssignees(on ? assignees.filter((id) => id !== person.id) : [...assignees, person.id])}
                  type="button"
                >
                  {person.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn-primary" disabled={pending} type="submit">{pending ? "Creating…" : "Create project"}</button>
        </div>
      </form>
    </Dialog>
  );
}
