"use client";

import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  KanbanSquare,
  ListChecks,
  MessageSquare,
  Plus,
  Search,
  Table2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  archiveCompletedProjectsAction,
  setProjectArchivedAction,
  updateProjectAction,
  type ActionResult,
} from "@/app/(app)/projects/actions";
import { PROJECT_PRIORITIES, PROJECT_STATUSES, PROJECT_TYPES, labelFor, type ProjectStatus } from "@/lib/projects/constants";
import { projectCode, type Person, type Project } from "@/lib/projects/types";
import { NewProjectDialog } from "./new-project-dialog";
import { ProjectDrawer } from "./project-drawer";
import { AvatarStack, PriorityFlag, STATUS_ACCENT, formatDate, formatMoney, useToday } from "./ui";

export type Mutate = (update: (projects: Project[]) => Project[], action: () => Promise<ActionResult>) => void;

type Props = {
  projects: Project[];
  team: Person[];
  currentUser: { id: string; isAdmin: boolean };
};

export function ProjectBoard({ projects, team, currentUser }: Props) {
  const [optimistic, applyOptimistic] = useOptimistic(projects, (state: Project[], update: (p: Project[]) => Project[]) =>
    update(state),
  );
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "table">("board");
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");
  const [type, setType] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = useToday();

  const mutate: Mutate = useCallback(
    (update, action) => {
      startTransition(async () => {
        applyOptimistic(update);
        const result = await action();
        if (!result.ok) setToast(result.error);
      });
    },
    [applyOptimistic],
  );

  // Open a project from a shared link (?project=F9-1001).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("project");
    if (!code) return;
    const match = projects.find((p) => projectCode(p.number) === code || p.id === code);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL
    if (match) setSelectedId(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const selected = projects.find((p) => p.id === selectedId);
    if (selected) url.searchParams.set("project", projectCode(selected.number));
    else url.searchParams.delete("project");
    window.history.replaceState(null, "", url);
  }, [selectedId, projects]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const teamById = useMemo(() => new Map(team.map((p) => [p.id, p])), [team]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return optimistic.filter((project) => {
      if (Boolean(project.archivedAt) !== showArchived) return false;
      if (assignee === "me" && !project.assigneeIds.includes(currentUser.id)) return false;
      if (assignee === "none" && project.assigneeIds.length) return false;
      if (!["all", "me", "none"].includes(assignee) && !project.assigneeIds.includes(assignee)) return false;
      if (priority !== "all" && project.priority !== priority) return false;
      if (type !== "all" && project.projectType !== type) return false;
      if (!q) return true;
      return [project.title, project.client, project.description, projectCode(project.number)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
  }, [optimistic, query, assignee, priority, type, showArchived, currentUser.id]);

  const byStatus = useMemo(() => {
    const groups = new Map<ProjectStatus, Project[]>(PROJECT_STATUSES.map((s) => [s.key, []]));
    for (const project of filtered) groups.get(project.status)?.push(project);
    for (const list of groups.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return groups;
  }, [filtered]);

  const archivedCount = optimistic.filter((p) => p.archivedAt).length;
  const completedOpen = optimistic.filter((p) => !p.archivedAt && p.status === "completed").length;
  const selected = optimistic.find((p) => p.id === selectedId) ?? null;

  function moveProject(projectId: string, status: ProjectStatus, beforeId: string | null) {
    if (beforeId === projectId) return;
    const column = (byStatus.get(status) ?? []).filter((p) => p.id !== projectId);
    const found = beforeId ? column.findIndex((p) => p.id === beforeId) : -1;
    const index = found === -1 ? column.length : found;
    const prev = column[index - 1]?.sortOrder;
    const next = column[index]?.sortOrder;
    const sortOrder =
      prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1000 : next === undefined ? prev + 1000 : (prev + next) / 2;

    const current = optimistic.find((p) => p.id === projectId);
    if (!current || (current.status === status && current.sortOrder === sortOrder)) return;
    mutate(
      (list) => list.map((p) => (p.id === projectId ? { ...p, status, sortOrder } : p)),
      () => updateProjectAction(projectId, { status, sortOrder }),
    );
  }

  const filtersActive = query || assignee !== "all" || priority !== "all" || type !== "all";

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-line bg-panel p-0.5" role="group" aria-label="Board view">
          <ViewButton active={view === "board"} icon={<KanbanSquare className="h-4 w-4" />} label="Board" onClick={() => setView("board")} />
          <ViewButton active={view === "table"} icon={<Table2 className="h-4 w-4" />} label="Table" onClick={() => setView("table")} />
        </div>
        <label className="relative min-w-52 flex-1 sm:max-w-xs">
          <span className="sr-only">Search projects</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="field pl-9" onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…" value={query} />
        </label>
        <select aria-label="Filter by person" className="field w-auto" onChange={(e) => setAssignee(e.target.value)} value={assignee}>
          <option value="all">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {team.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </select>
        <select aria-label="Filter by priority" className="field w-auto" onChange={(e) => setPriority(e.target.value)} value={priority}>
          <option value="all">All priorities</option>
          {PROJECT_PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </select>
        <select aria-label="Filter by type" className="field w-auto" onChange={(e) => setType(e.target.value)} value={type}>
          <option value="all">All types</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.name}</option>
          ))}
        </select>
        {filtersActive ? (
          <button
            className="btn-ghost px-2.5"
            onClick={() => {
              setQuery("");
              setAssignee("all");
              setPriority("all");
              setType("all");
            }}
            type="button"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setShowArchived(!showArchived)} type="button">
            {showArchived ? <KanbanSquare className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showArchived ? "Back to active" : `Archived (${archivedCount})`}
          </button>
          <button className="btn-primary" onClick={() => setCreating(true)} type="button">
            <Plus className="h-4 w-4" /> New project
          </button>
        </div>
      </div>

      {showArchived ? (
        <ArchivedList
          onOpen={setSelectedId}
          onRestore={(id) =>
            mutate(
              (list) => list.map((p) => (p.id === id ? { ...p, archivedAt: null } : p)),
              () => setProjectArchivedAction(id, false),
            )
          }
          projects={filtered}
          teamById={teamById}
        />
      ) : view === "board" ? (
        <BoardView
          byStatus={byStatus}
          completedOpen={completedOpen}
          onArchiveCompleted={() =>
            mutate(
              (list) => list.map((p) => (p.status === "completed" && !p.archivedAt ? { ...p, archivedAt: new Date().toISOString() } : p)),
              archiveCompletedProjectsAction,
            )
          }
          onMove={moveProject}
          onOpen={setSelectedId}
          teamById={teamById}
          today={today}
        />
      ) : (
        <TableView byStatus={byStatus} onOpen={setSelectedId} teamById={teamById} today={today} />
      )}

      {creating ? (
        <NewProjectDialog
          currentUserId={currentUser.id}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            if (id) setSelectedId(id);
          }}
          team={team}
        />
      ) : null}

      {selected ? (
        <ProjectDrawer
          currentUser={currentUser}
          key={selected.id}
          mutate={mutate}
          onClose={() => setSelectedId(null)}
          onError={setToast}
          project={selected}
          team={team}
          teamById={teamById}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-100 shadow-xl" role="alert">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ViewButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold ${active ? "bg-brand text-white" : "text-muted hover:text-white"}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function isOverdue(project: Project, today: string | null) {
  return Boolean(today && project.dueDate && project.status !== "completed" && project.dueDate < today);
}

function DueDate({ project, today }: { project: Project; today: string | null }) {
  if (!project.dueDate) return null;
  const overdue = isOverdue(project, today);
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${overdue ? "font-semibold text-brand" : "text-muted"}`}>
      <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
      {formatDate(project.dueDate)}
      {overdue ? <span className="sr-only">(overdue)</span> : null}
    </span>
  );
}

function SubtaskProgress({ project }: { project: Project }) {
  if (!project.subtasks.length) return null;
  const done = project.subtasks.filter((s) => s.status === "done").length;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" title={`${done} of ${project.subtasks.length} subtasks done`}>
      <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
      {done}/{project.subtasks.length}
    </span>
  );
}

type BoardViewProps = {
  byStatus: Map<ProjectStatus, Project[]>;
  teamById: Map<string, Person>;
  today: string | null;
  completedOpen: number;
  onOpen: (id: string) => void;
  onMove: (id: string, status: ProjectStatus, beforeId: string | null) => void;
  onArchiveCompleted: () => void;
};

function BoardView({ byStatus, teamById, today, completedOpen, onOpen, onMove, onArchiveCompleted }: BoardViewProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ status: ProjectStatus; beforeId: string | null } | null>(null);

  function finishDrop(status: ProjectStatus, beforeId: string | null) {
    if (dragId) onMove(dragId, status, beforeId);
    setDragId(null);
    setDropTarget(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" aria-label="Project board">
      {PROJECT_STATUSES.map((status) => {
        const items = byStatus.get(status.key) ?? [];
        const isTarget = dropTarget?.status === status.key;
        return (
          <section
            aria-label={`${status.name} column`}
            className={`flex min-w-64 flex-1 basis-0 flex-col rounded-xl border bg-panel/60 transition-colors ${isTarget ? "border-brand/70 bg-panel" : "border-line"}`}
            key={status.key}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (!isTarget || dropTarget?.beforeId) setDropTarget({ status: status.key, beforeId: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              finishDrop(status.key, null);
            }}
          >
            <header className="flex items-center gap-2 px-3 pb-2 pt-3">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_ACCENT[status.key]}`} aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">{status.name}</h2>
              <span className="rounded-full bg-panel-2 px-2 py-0.5 text-xs font-semibold text-muted">{items.length}</span>
              {status.key === "completed" && completedOpen > 0 ? (
                <button className="ml-auto text-xs text-muted hover:text-white" onClick={onArchiveCompleted} title="Archive all completed projects" type="button">
                  Archive all
                </button>
              ) : null}
            </header>
            <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
              {items.map((project) => {
                const people = project.assigneeIds.map((id) => teamById.get(id)).filter(Boolean) as Person[];
                const showLine = dropTarget?.status === status.key && dropTarget.beforeId === project.id && dragId !== project.id;
                return (
                  <div key={project.id}>
                    {showLine ? <div className="mb-2 h-0.5 rounded bg-brand" /> : null}
                    <button
                      className={`group w-full cursor-grab rounded-lg border bg-panel-2 p-3 text-left shadow-sm transition hover:border-neutral-500 active:cursor-grabbing ${dragId === project.id ? "opacity-40" : ""} ${isOverdue(project, today) ? "border-brand/60" : "border-line"}`}
                      draggable
                      onClick={() => onOpen(project.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > rect.top + rect.height / 2;
                        const beforeId = after ? (items[items.indexOf(project) + 1]?.id ?? null) : project.id;
                        if (dropTarget?.status !== status.key || dropTarget.beforeId !== beforeId) {
                          setDropTarget({ status: status.key, beforeId });
                        }
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", project.id);
                        setDragId(project.id);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        finishDrop(status.key, dropTarget?.status === status.key ? dropTarget.beforeId : project.id);
                      }}
                      type="button"
                    >
                      <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                        <span className="font-mono">{projectCode(project.number)}</span>
                        {project.projectType ? <span className="truncate">· {labelFor(PROJECT_TYPES, project.projectType)}</span> : null}
                        <span className="ml-auto">
                          <PriorityFlag priority={project.priority} />
                        </span>
                      </div>
                      <div className="mt-1.5 line-clamp-3 text-sm font-semibold leading-snug text-white">{project.title}</div>
                      {project.client ? <div className="mt-1 truncate text-xs text-neutral-400">{project.client}</div> : null}
                      <div className="mt-3 flex items-center gap-3">
                        <AvatarStack people={people} />
                        <span className="ml-auto flex items-center gap-2.5">
                          <SubtaskProgress project={project} />
                          {project.comments.length ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted">
                              <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
                              {project.comments.length}
                            </span>
                          ) : null}
                          <DueDate project={project} today={today} />
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
              {isTarget && dropTarget?.beforeId === null && dragId ? <div className="h-0.5 rounded bg-brand" /> : null}
              {!items.length && !isTarget ? (
                <p className="px-2 py-6 text-center text-xs text-neutral-600">Nothing here yet</p>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TableView({
  byStatus,
  teamById,
  today,
  onOpen,
}: {
  byStatus: Map<ProjectStatus, Project[]>;
  teamById: Map<string, Person>;
  today: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {PROJECT_STATUSES.map((status) => {
        const items = byStatus.get(status.key) ?? [];
        return (
          <section className="card overflow-hidden" key={status.key}>
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_ACCENT[status.key]}`} aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">{status.name}</h2>
              <span className="text-xs text-muted">{items.length}</span>
            </header>
            {items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Project</th>
                      <th className="px-4 py-2 font-semibold">Type</th>
                      <th className="px-4 py-2 font-semibold">Team</th>
                      <th className="px-4 py-2 font-semibold">Priority</th>
                      <th className="px-4 py-2 font-semibold">Due</th>
                      <th className="px-4 py-2 font-semibold">Subtasks</th>
                      <th className="px-4 py-2 text-right font-semibold">Budget</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((project) => (
                      <tr className="cursor-pointer border-t border-line hover:bg-panel-2" key={project.id} onClick={() => onOpen(project.id)}>
                        <td className="px-4 py-2.5">
                          <button className="text-left" onClick={() => onOpen(project.id)} type="button">
                            <span className="mr-2 font-mono text-xs text-muted">{projectCode(project.number)}</span>
                            <span className="font-semibold text-white">{project.title}</span>
                            {project.client ? <span className="block text-xs text-neutral-500">{project.client}</span> : null}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-300">{labelFor(PROJECT_TYPES, project.projectType) || "—"}</td>
                        <td className="px-4 py-2.5">
                          <AvatarStack people={project.assigneeIds.map((id) => teamById.get(id)).filter(Boolean) as Person[]} />
                        </td>
                        <td className="px-4 py-2.5"><PriorityFlag priority={project.priority} withLabel /></td>
                        <td className="px-4 py-2.5">{project.dueDate ? <DueDate project={project} today={today} /> : <span className="text-neutral-600">—</span>}</td>
                        <td className="px-4 py-2.5">{project.subtasks.length ? <SubtaskProgress project={project} /> : <span className="text-neutral-600">—</span>}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">
                          {project.budgetCents ? formatMoney(project.budgetCents) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-neutral-600">No projects</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ArchivedList({
  projects,
  teamById,
  onOpen,
  onRestore,
}: {
  projects: Project[];
  teamById: Map<string, Person>;
  onOpen: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const sorted = [...projects].sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Archived projects</h2>
      </header>
      {sorted.length ? (
        <ul>
          {sorted.map((project) => (
            <li className="flex items-center gap-4 border-t border-line px-4 py-3 first:border-t-0" key={project.id}>
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(project.id)} type="button">
                <span className="mr-2 font-mono text-xs text-muted">{projectCode(project.number)}</span>
                <span className="font-semibold text-white">{project.title}</span>
                <span className="ml-2 text-xs text-muted">{labelFor(PROJECT_STATUSES, project.status)}</span>
              </button>
              <AvatarStack people={project.assigneeIds.map((id) => teamById.get(id)).filter(Boolean) as Person[]} />
              <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => onRestore(project.id)} type="button">
                <ArchiveRestore className="h-4 w-4" /> Restore
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-neutral-600">No archived projects.</p>
      )}
    </section>
  );
}
