"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  GripVertical,
  KanbanSquare,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Table2,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  archiveClosedAction,
  createRequestTypeAction,
  deleteRequestAction,
  setArchivedAction,
  toggleAssigneeAction,
  updateRequestAction,
  type ActionResult,
} from "@/app/(app)/b/actions";
import { REQUEST_PRIORITIES, REQUEST_STATUSES, type RequestStatus, priorityName, statusName } from "@/lib/requests/constants";
import type { Board, CurrentUserInfo, Person, RequestItem, RequestType } from "@/lib/requests/types";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Popover, PopoverOption, anchorFrom, type Anchor } from "@/components/ui/popover";
import { PersonCard } from "./person-card";
import { RequestDrawer } from "./drawer";
import { RequestForm } from "./request-form";
import {
  Avatar,
  AvatarStack,
  DUE_TEXT,
  PRIORITY_CHIP,
  PriorityLabel,
  STATUS_CHIP,
  STATUS_DOT,
  dueState,
  formatDate,
  useToday,
} from "./ui";

export type Mutate = (update: (requests: RequestItem[]) => RequestItem[], action: () => Promise<ActionResult>) => void;

type View = "board" | "table" | "archive";
type SortKey = "manual" | "number" | "title" | "requester" | "type" | "status" | "priority" | "due" | "created";
type FieldMenu = { kind: "status" | "priority" | "type" | "assignee"; requestId: string; anchor: Anchor };
type ContextMenu = { requestId: string; anchor: Anchor; moveOpen: boolean };
type DropTarget = { status: RequestStatus; beforeId: string | null };

const SORT_HEADERS: { key: SortKey; label: string }[] = [
  { key: "number", label: "Ticket" },
  { key: "title", label: "Title" },
  { key: "requester", label: "Requester" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "created", label: "Submitted" },
];

const conversationCount = (request: RequestItem) => request.comments.filter((c) => c.kind === "comment").length;

type Props = {
  board: Board;
  requests: RequestItem[];
  team: Person[];
  people: Person[];
  requesterOptions: Person[];
  requestTypes: RequestType[];
  currentUser: CurrentUserInfo;
};

export function RequestBoard({ board, requests, team, people, requesterOptions, requestTypes, currentUser }: Props) {
  const [optimistic, applyOptimistic] = useOptimistic(requests, (state: RequestItem[], update: (r: RequestItem[]) => RequestItem[]) => update(state));
  const [, startTransition] = useTransition();
  const viewKey = `f9-view:${board.id}`;
  const [view, setView] = useState<View>("board");
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("manual");
  const [sortAsc, setSortAsc] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["completed"]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationFocus, setConversationFocus] = useState(false);
  const [fieldMenu, setFieldMenu] = useState<FieldMenu | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RequestItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [extraTypes, setExtraTypes] = useState<RequestType[]>([]);
  const today = useToday();

  const types = useMemo(() => {
    const keys = new Set(requestTypes.map((t) => t.key));
    return [...requestTypes, ...extraTypes.filter((t) => !keys.has(t.key))];
  }, [requestTypes, extraTypes]);
  const typeName = useCallback((key: string | null) => types.find((t) => t.key === key)?.name ?? null, [types]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const personName = useCallback((id: string | null) => (id ? peopleById.get(id)?.name ?? "Former member" : "Unknown"), [peopleById]);

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

  // Restore the saved view and open a shared link (?request=F9-1001).
  useEffect(() => {
    const stored = window.localStorage.getItem(viewKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage / URL
    if (stored === "table" || stored === "archive") setView(stored);
    const code = new URLSearchParams(window.location.search).get("request");
    const match = code ? requests.find((r) => r.code.toLowerCase() === code.toLowerCase() || r.id === code) : null;
    if (match) setSelectedId(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const selected = optimistic.find((r) => r.id === selectedId);
    if (selected) url.searchParams.set("request", selected.code);
    else url.searchParams.delete("request");
    window.history.replaceState(null, "", url);
  }, [selectedId, optimistic]);

  useEffect(() => {
    if (!toast && !notice) return;
    const timer = setTimeout(() => {
      setToast(null);
      setNotice(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast, notice]);

  function switchView(next: View) {
    setFieldMenu(null);
    setContextMenu(null);
    setView(next);
    window.localStorage.setItem(viewKey, next);
  }

  const active = useMemo(() => optimistic.filter((r) => !r.archivedAt), [optimistic]);
  const archived = useMemo(() => optimistic.filter((r) => r.archivedAt), [optimistic]);
  const source = view === "archive" ? archived : active;
  const filtersActive = Boolean(query.trim()) || assigneeFilter !== "all" || priorityFilter !== "all" || typeFilter !== "all";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter((request) => {
      if (q && ![request.code, request.title, personName(request.requesterId)].join(" ").toLowerCase().includes(q)) return false;
      if (assigneeFilter === "unassigned" && request.assigneeIds.length) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && !request.assigneeIds.includes(assigneeFilter)) return false;
      if (priorityFilter !== "all" && request.priority !== priorityFilter) return false;
      if (typeFilter !== "all" && request.requestType !== typeFilter) return false;
      return true;
    });
  }, [source, query, assigneeFilter, priorityFilter, typeFilter, personName]);

  const comparator = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    const statusRank = new Map(REQUEST_STATUSES.map((s, i) => [s.key, i]));
    const priorityRank = new Map(REQUEST_PRIORITIES.map((p, i) => [p.key, i]));
    return (a: RequestItem, b: RequestItem) => {
      switch (sortKey) {
        case "manual":
          if (a.status === "completed" && b.status === "completed") return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
          return a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt);
        case "number":
          return dir * (a.number - b.number);
        case "title":
          return dir * a.title.localeCompare(b.title);
        case "requester":
          return dir * personName(a.requesterId).localeCompare(personName(b.requesterId));
        case "type":
          return dir * (typeName(a.requestType) ?? "").localeCompare(typeName(b.requestType) ?? "");
        case "status":
          return dir * ((statusRank.get(a.status) ?? 0) - (statusRank.get(b.status) ?? 0));
        case "priority":
          return dir * ((priorityRank.get(a.priority) ?? 0) - (priorityRank.get(b.priority) ?? 0));
        case "due":
          return dir * (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
        default:
          return dir * a.createdAt.localeCompare(b.createdAt);
      }
    };
  }, [sortKey, sortAsc, personName, typeName]);

  // Cancelled only earns a column once something is in it.
  const statuses = useMemo(
    () => REQUEST_STATUSES.filter((s) => s.key !== "cancelled" || source.some((r) => r.status === "cancelled")),
    [source],
  );

  const columns = useMemo(() => {
    const manual = [...visible].sort((a, b) =>
      a.status === "completed" && b.status === "completed"
        ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
        : a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt),
    );
    return statuses.map((status) => ({ status, requests: manual.filter((r) => r.status === status.key) }));
  }, [visible, statuses]);

  const sorted = useMemo(() => [...visible].sort(comparator), [visible, comparator]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "title" || key === "requester" || key === "type" || key === "due");
    }
  }

  function toggleCollapsed(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ----- Mutations -------------------------------------------------------

  function moveRequest(requestId: string, status: RequestStatus, beforeId: string | null = null) {
    if (beforeId === requestId) return;
    const current = optimistic.find((r) => r.id === requestId);
    if (!current) return;
    const column = active
      .filter((r) => r.status === status && r.id !== requestId)
      .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));
    const found = beforeId ? column.findIndex((r) => r.id === beforeId) : -1;
    // Status changes from menus go to the top of the column; drops go where they were dropped.
    const index = found === -1 ? (beforeId === null && current.status !== status ? 0 : column.length) : found;
    const prev = column[index - 1]?.sortOrder;
    const next = column[index]?.sortOrder;
    const sortOrder =
      prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1024 : next === undefined ? prev + 1024 : (prev + next) / 2;
    if (current.status === status && current.sortOrder === sortOrder) return;
    mutate(
      (list) =>
        list.map((r) =>
          r.id === requestId
            ? { ...r, status, sortOrder, completedAt: status === "completed" ? (r.completedAt ?? new Date().toISOString()) : null }
            : r,
        ),
      () => updateRequestAction(requestId, status === current.status ? { sortOrder } : { status, sortOrder }),
    );
  }

  function dropMove(requestId: string, status: RequestStatus, beforeId: string | null) {
    const current = optimistic.find((r) => r.id === requestId);
    if (!current) return;
    if (beforeId === null) {
      // Dropped below the last card: go to the end of the column.
      const column = active.filter((r) => r.status === status && r.id !== requestId).sort((a, b) => a.sortOrder - b.sortOrder);
      const last = column.at(-1);
      const sortOrder = last ? last.sortOrder + 1024 : 0;
      mutate(
        (list) =>
          list.map((r) =>
            r.id === requestId
              ? { ...r, status, sortOrder, completedAt: status === "completed" ? (r.completedAt ?? new Date().toISOString()) : null }
              : r,
          ),
        () => updateRequestAction(requestId, status === current.status ? { sortOrder } : { status, sortOrder }),
      );
    } else {
      moveRequest(requestId, status, beforeId);
    }
    setPlacedId(requestId);
    setTimeout(() => setPlacedId(null), 900);
  }

  const patchLocal = (requestId: string, patch: Partial<RequestItem>) => (list: RequestItem[]) =>
    list.map((r) => (r.id === requestId ? { ...r, ...patch } : r));

  function toggleAssignee(requestId: string, userId: string) {
    const request = optimistic.find((r) => r.id === requestId);
    if (!request) return;
    const assigned = request.assigneeIds.includes(userId);
    mutate(
      patchLocal(requestId, {
        assigneeIds: assigned ? request.assigneeIds.filter((id) => id !== userId) : [...request.assigneeIds, userId],
      }),
      () => toggleAssigneeAction(requestId, userId, !assigned),
    );
  }

  function setArchived(requestId: string, archivedFlag: boolean) {
    mutate(patchLocal(requestId, { archivedAt: archivedFlag ? new Date().toISOString() : null }), () =>
      setArchivedAction(requestId, archivedFlag),
    );
    if (archivedFlag && selectedId === requestId) setSelectedId(null);
  }

  function archiveClosed() {
    const closed = active.filter((r) => r.status === "completed" || r.status === "cancelled");
    if (!closed.length) {
      setNotice("Nothing to archive — no completed or cancelled requests on the board.");
      return;
    }
    const now = new Date().toISOString();
    const ids = new Set(closed.map((r) => r.id));
    startTransition(async () => {
      applyOptimistic((list) => list.map((r) => (ids.has(r.id) ? { ...r, archivedAt: now } : r)));
      const result = await archiveClosedAction(board.id);
      if (!result.ok) setToast(result.error);
      else setNotice(`Archived ${result.count} closed request${result.count === 1 ? "" : "s"}.`);
    });
  }

  // ----- Drag and drop ---------------------------------------------------

  function beforeAtPointer(container: HTMLElement, clientY: number) {
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-request-id]")).filter((el) => el.dataset.requestId !== dragId);
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return item.dataset.requestId!;
    }
    return null;
  }

  function onGroupDragOver(event: React.DragEvent<HTMLElement>, status: RequestStatus) {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const beforeId = beforeAtPointer(event.currentTarget, event.clientY);
    if (dropTarget?.status !== status || dropTarget.beforeId !== beforeId) setDropTarget({ status, beforeId });
  }

  function onGroupDrop(event: React.DragEvent<HTMLElement>, status: RequestStatus) {
    event.preventDefault();
    if (dragId) dropMove(dragId, status, dropTarget?.status === status ? dropTarget.beforeId : null);
    setDragId(null);
    setDropTarget(null);
  }

  function startDrag(event: React.DragEvent, requestId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", requestId);
    setDragId(requestId);
    setFieldMenu(null);
  }

  function endDrag() {
    setDragId(null);
    setDropTarget(null);
  }

  const dragged = dragId ? optimistic.find((r) => r.id === dragId) : null;

  function landing(table = false) {
    if (!dragged) return null;
    const inner = (
      <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-brand/70 bg-brand/10 px-3 py-2 text-xs">
        <span className="font-bold uppercase tracking-wider text-brand">Place here</span>
        <strong className="font-mono text-white">{dragged.code}</strong>
        <small className="truncate text-muted">{dragged.title}</small>
      </div>
    );
    return table ? (
      <tr aria-hidden="true">
        <td className="px-2 py-1" colSpan={11}>{inner}</td>
      </tr>
    ) : (
      <div aria-hidden="true">{inner}</div>
    );
  }

  // ----- Shared bits -----------------------------------------------------

  function openField(event: React.MouseEvent<HTMLElement>, requestId: string, kind: FieldMenu["kind"]) {
    event.stopPropagation();
    setContextMenu(null);
    setFieldMenu({ kind, requestId, anchor: anchorFrom(event.currentTarget) });
  }

  function openContext(event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>, requestId: string) {
    if ("key" in event) {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      setContextMenu({ requestId, anchor: anchorFrom(event.currentTarget), moveOpen: false });
      return;
    }
    event.preventDefault();
    setFieldMenu(null);
    setContextMenu({ requestId, anchor: { top: event.clientY, left: event.clientX }, moveOpen: false });
  }

  function requesterLink(id: string | null) {
    if (!id) return <span className="text-neutral-500">Unknown</span>;
    return (
      <button
        className="truncate text-left text-neutral-300 underline-offset-2 hover:text-white hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          setPersonId(id);
        }}
        title={`View ${personName(id)}'s information`}
        type="button"
      >
        {personName(id)}
      </button>
    );
  }

  function assigneeButton(request: RequestItem, max = 4) {
    const assignees = request.assigneeIds.map((id) => peopleById.get(id)).filter(Boolean) as Person[];
    return (
      <button
        aria-label={`Assign teammates to ${request.code}`}
        className="inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-xs text-muted hover:bg-panel hover:text-white"
        onClick={(e) => openField(e, request.id, "assignee")}
        type="button"
      >
        {assignees.length ? (
          <AvatarStack max={max} people={assignees} />
        ) : (
          <>
            <UserRound className="h-3.5 w-3.5" /> Assign
          </>
        )}
      </button>
    );
  }

  function fieldChip(request: RequestItem, kind: "status" | "priority" | "type") {
    const classes =
      kind === "status" ? STATUS_CHIP[request.status] : kind === "priority" ? PRIORITY_CHIP[request.priority] : "bg-panel text-neutral-300 ring-1 ring-line";
    return (
      <button
        aria-haspopup="dialog"
        className={`max-w-full truncate rounded-md px-2 py-0.5 text-[0.7rem] font-semibold hover:brightness-125 ${classes}`}
        onClick={(e) => openField(e, request.id, kind)}
        type="button"
      >
        {kind === "status" ? (
          statusName(request.status)
        ) : kind === "priority" ? (
          <PriorityLabel name={priorityName(request.priority)} priority={request.priority} />
        ) : (
          (typeName(request.requestType) ?? "Select type")
        )}
      </button>
    );
  }

  function conversationBadge(request: RequestItem) {
    const count = conversationCount(request);
    if (!count) return null;
    return (
      <button
        aria-label={`Open conversation for ${request.code} (${count} comment${count === 1 ? "" : "s"})`}
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          setConversationFocus(true);
          setSelectedId(request.id);
        }}
        type="button"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {count}
      </button>
    );
  }

  const selected = optimistic.find((r) => r.id === selectedId) ?? null;
  const fieldRequest = fieldMenu ? optimistic.find((r) => r.id === fieldMenu.requestId) : null;
  const contextRequest = contextMenu ? optimistic.find((r) => r.id === contextMenu.requestId) : null;
  const countLabel = filtersActive
    ? `${visible.length} of ${source.length}`
    : `${source.length} ${view === "archive" ? "archived" : source.length === 1 ? "request" : "requests"}`;

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-16 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-2 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div aria-label="Board view" className="flex rounded-md border border-line bg-panel p-0.5" role="group">
          {(
            [
              ["board", "Board", KanbanSquare],
              ["table", "Table", Table2],
              ["archive", "Archive", Archive],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              aria-pressed={view === key}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold ${view === key ? "bg-brand text-on-brand" : "text-muted hover:text-white"}`}
              key={key}
              onClick={() => switchView(key)}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {label}
              {key === "archive" && archived.length ? (
                <span className="rounded-full bg-black/30 px-1.5 text-[0.65rem]">{archived.length}</span>
              ) : null}
            </button>
          ))}
        </div>
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search requests</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="field pl-9" onChange={(e) => setQuery(e.target.value)} placeholder="Search requests…" type="search" value={query} />
        </label>
        <button
          aria-pressed={assigneeFilter === currentUser.id}
          className={`btn-ghost px-3 ${assigneeFilter === currentUser.id ? "!border-brand !text-white" : ""}`}
          onClick={() => setAssigneeFilter((v) => (v === currentUser.id ? "all" : currentUser.id))}
          type="button"
        >
          <UserRound className="h-4 w-4" /> My tickets
        </button>
        <select aria-label="Filter by assignee" className="field w-auto" onChange={(e) => setAssigneeFilter(e.target.value)} value={assigneeFilter}>
          <option value="all">Assignee: anyone</option>
          <option value="unassigned">Unassigned</option>
          {team.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select aria-label="Filter by priority" className="field w-auto" onChange={(e) => setPriorityFilter(e.target.value)} value={priorityFilter}>
          <option value="all">Priority: all</option>
          {REQUEST_PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </select>
        <select aria-label="Filter by type" className="field w-auto" onChange={(e) => setTypeFilter(e.target.value)} value={typeFilter}>
          <option value="all">Type: all</option>
          {types.map((t) => (
            <option key={t.key} value={t.key}>{t.name}</option>
          ))}
        </select>
        {filtersActive ? (
          <button
            className="btn-ghost px-2.5"
            onClick={() => {
              setQuery("");
              setAssigneeFilter("all");
              setPriorityFilter("all");
              setTypeFilter("all");
            }}
            type="button"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        ) : null}
        {view !== "archive" ? (
          <button className="btn-ghost px-3" onClick={archiveClosed} title="Move every completed or cancelled request into the archive" type="button">
            <Archive className="h-4 w-4" /> Archive closed
          </button>
        ) : null}
        <span className="text-xs text-muted">{countLabel}</span>
        <button className="btn-primary ml-auto" onClick={() => setCreating(true)} type="button">
          <Plus className="h-4 w-4" /> New request
        </button>
      </div>

      {notice ? (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-neutral-200" role="status">
          <Archive className="h-4 w-4 text-brand" /> {notice}
        </p>
      ) : null}

      {view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-6" aria-label="Request board">
          {columns.map(({ status, requests: items }) => {
            const isCollapsed = collapsed.has(status.key);
            const isTarget = dropTarget?.status === status.key;
            return (
              <section
                aria-label={`${status.name} column`}
                className={`flex min-w-64 flex-1 basis-0 flex-col rounded-xl border bg-panel/60 transition-colors ${isTarget ? "border-brand/70 bg-panel" : "border-line"}`}
                key={status.key}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                }}
                onDragOver={(e) => onGroupDragOver(e, status.key)}
                onDrop={(e) => onGroupDrop(e, status.key)}
              >
                <button aria-expanded={!isCollapsed} className="flex items-center gap-2 px-3 pb-2 pt-3 text-left" onClick={() => toggleCollapsed(status.key)} type="button">
                  <ChevronDown className={`h-4 w-4 text-muted transition ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status.key]}`} />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">{status.name}</h2>
                  <span className="rounded-full bg-panel-2 px-2 py-0.5 text-xs font-semibold text-muted">{items.length}</span>
                </button>
                {!isCollapsed ? (
                  <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
                    {items.map((request) => {
                      const due = dueState(request, today);
                      return (
                        <Fragment key={request.id}>
                          {isTarget && dropTarget?.beforeId === request.id ? landing() : null}
                          <article
                            className={`group rounded-lg border bg-panel-2 p-3 shadow-sm transition ${dragId === request.id ? "opacity-40" : ""} ${
                              placedId === request.id ? "ring-2 ring-brand" : ""
                            } ${due === "overdue" ? "border-brand/60" : due === "soon" ? "border-amber-500/50" : "border-line hover:border-neutral-500"}`}
                            data-request-id={request.id}
                            draggable
                            onContextMenu={(e) => openContext(e, request.id)}
                            onDragEnd={endDrag}
                            onDragStart={(e) => startDrag(e, request.id)}
                            onKeyDown={(e) => openContext(e, request.id)}
                          >
                            <button className="block w-full text-left" onClick={() => setSelectedId(request.id)} type="button">
                              <span className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                                <span className="font-mono">{request.code}</span>
                                <GripVertical aria-hidden="true" className="ml-auto h-4 w-4 cursor-grab opacity-0 group-hover:opacity-100" />
                              </span>
                              <strong className="mt-1 line-clamp-3 block text-sm font-semibold leading-snug text-white" title={request.title}>
                                {request.title}
                              </strong>
                            </button>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="inline-flex min-w-0 items-center gap-1 text-muted">
                                <UserRound className="h-3.5 w-3.5 shrink-0" />
                                {requesterLink(request.requesterId)}
                              </span>
                              {request.dueDate ? (
                                <span className={`inline-flex items-center gap-1 ${due ? DUE_TEXT[due] : "text-muted"}`}>
                                  <CalendarClock className="h-3.5 w-3.5" />
                                  {formatDate(request.dueDate)}
                                </span>
                              ) : null}
                              {conversationBadge(request)}
                              {request.attachments.length ? (
                                <span className="inline-flex items-center gap-1 text-muted">
                                  <Paperclip className="h-3.5 w-3.5" />
                                  {request.attachments.length}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {fieldChip(request, "type")}
                              {fieldChip(request, "priority")}
                              {fieldChip(request, "status")}
                            </div>
                            <div className="mt-2">
                              {assigneeButton(request)}
                            </div>
                          </article>
                        </Fragment>
                      );
                    })}
                    {isTarget && dropTarget?.beforeId === null ? landing() : null}
                    {!items.length && !isTarget ? <p className="px-2 py-6 text-center text-xs text-neutral-600">Nothing here right now.</p> : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : view === "table" ? (
        <div className="space-y-5 pb-6">
          {statuses.map((status) => {
            const items = sorted.filter((r) => r.status === status.key);
            const isCollapsed = collapsed.has(status.key);
            const isTarget = dropTarget?.status === status.key;
            return (
              <section
                className={`card overflow-hidden ${isTarget ? "border-brand/70" : ""}`}
                key={status.key}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                }}
                onDragOver={(e) => onGroupDragOver(e, status.key)}
                onDrop={(e) => onGroupDrop(e, status.key)}
              >
                <button aria-expanded={!isCollapsed} className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => toggleCollapsed(status.key)} type="button">
                  <ChevronDown className={`h-4 w-4 text-muted transition ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status.key]}`} />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">{status.name}</h2>
                  <span className="text-xs text-muted">{items.length}</span>
                </button>
                {!isCollapsed ? (
                  items.length ? (
                    <div className="overflow-x-auto border-t border-line">
                      <table className="w-full min-w-[1100px] text-left text-sm">
                        <thead className="text-xs uppercase tracking-wider text-muted">
                          <tr>
                            <th aria-label="Drag handle" className="w-8" />
                            {SORT_HEADERS.map((h) => (
                              <th className="px-3 py-2 font-semibold" key={h.key}>
                                <button className="inline-flex items-center gap-1 uppercase hover:text-white" onClick={() => toggleSort(h.key)} type="button">
                                  {h.label}
                                  {sortKey === h.key ? sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
                                </button>
                              </th>
                            ))}
                            <th className="px-3 py-2 font-semibold">Assignee</th>
                            <th className="px-3 py-2 font-semibold">File</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((request) => {
                            const due = dueState(request, today);
                            return (
                              <Fragment key={request.id}>
                                {isTarget && dropTarget?.beforeId === request.id ? landing(true) : null}
                                <tr
                                  className={`border-t border-line hover:bg-panel-2 ${dragId === request.id ? "opacity-40" : ""} ${placedId === request.id ? "bg-brand/10" : ""}`}
                                  data-request-id={request.id}
                                  onContextMenu={(e) => openContext(e, request.id)}
                                >
                                  <td
                                    className="cursor-grab px-2 text-muted"
                                    draggable
                                    onDragEnd={endDrag}
                                    onDragStart={(e) => startDrag(e, request.id)}
                                    title="Drag to another group"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <button className="font-mono text-xs text-muted hover:text-white" onClick={() => setSelectedId(request.id)} type="button">
                                      {request.code}
                                    </button>
                                  </td>
                                  <td className="max-w-80 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <button className="truncate text-left font-semibold text-white hover:underline" onClick={() => setSelectedId(request.id)} title={request.title} type="button">
                                        {request.title}
                                      </button>
                                      {conversationBadge(request)}
                                    </div>
                                  </td>
                                  <td className="max-w-40 px-3 py-2">{requesterLink(request.requesterId)}</td>
                                  <td className="px-3 py-2">{fieldChip(request, "type")}</td>
                                  <td className="px-3 py-2">{fieldChip(request, "status")}</td>
                                  <td className="px-3 py-2">{fieldChip(request, "priority")}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      aria-label={`Due date for ${request.code}`}
                                      className={`rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-line focus:border-brand focus:outline-none ${due ? DUE_TEXT[due] : "text-neutral-300"}`}
                                      defaultValue={request.dueDate ?? ""}
                                      key={`${request.id}-${request.dueDate ?? "none"}`}
                                      onBlur={(e) => {
                                        if (e.target.value === (request.dueDate ?? "")) return;
                                        const value = e.target.value || null;
                                        mutate(patchLocal(request.id, { dueDate: value }), () => updateRequestAction(request.id, { dueDate: value }));
                                      }}
                                      type="date"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-xs text-muted">{formatDate(request.createdAt.slice(0, 10))}</td>
                                  <td className="px-3 py-2">{assigneeButton(request, 3)}</td>
                                  <td className="px-3 py-2">
                                    {request.attachments.length ? (
                                      <button
                                        aria-label={`View ${request.attachments.length} attachment${request.attachments.length === 1 ? "" : "s"} on ${request.code}`}
                                        className="inline-flex items-center gap-1 text-xs text-muted hover:text-white"
                                        onClick={() => setSelectedId(request.id)}
                                        type="button"
                                      >
                                        <Paperclip className="h-3.5 w-3.5" />
                                        {request.attachments.length}
                                      </button>
                                    ) : (
                                      <span aria-hidden="true" className="text-neutral-600">—</span>
                                    )}
                                  </td>
                                </tr>
                              </Fragment>
                            );
                          })}
                          {isTarget && dropTarget?.beforeId === null ? landing(true) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={`border-t border-line px-4 py-4 text-sm ${isTarget ? "text-brand" : "text-neutral-600"}`}>
                      {isTarget && dragged ? landing() : "No requests here — drag a ticket in."}
                    </div>
                  )
                ) : null}
              </section>
            );
          })}
          {!sorted.length ? <p className="py-6 text-center text-sm text-neutral-500">No requests match those filters.</p> : null}
        </div>
      ) : (
        <section className="card mb-6 overflow-hidden">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Archive className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Archived</h2>
            <span className="text-xs text-muted">{sorted.length}</span>
          </header>
          {sorted.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted">
                  <tr>
                    {SORT_HEADERS.map((h) => (
                      <th className="px-3 py-2 font-semibold" key={h.key}>
                        <button className="inline-flex items-center gap-1 uppercase hover:text-white" onClick={() => toggleSort(h.key)} type="button">
                          {h.label}
                          {sortKey === h.key ? sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
                        </button>
                      </th>
                    ))}
                    <th aria-label="Restore" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((request) => (
                    <tr className="border-t border-line hover:bg-panel-2" key={request.id}>
                      <td className="px-3 py-2">
                        <button className="font-mono text-xs text-muted hover:text-white" onClick={() => setSelectedId(request.id)} type="button">{request.code}</button>
                      </td>
                      <td className="max-w-80 px-3 py-2">
                        <button className="truncate text-left font-semibold text-white hover:underline" onClick={() => setSelectedId(request.id)} title={request.title} type="button">{request.title}</button>
                      </td>
                      <td className="px-3 py-2">{requesterLink(request.requesterId)}</td>
                      <td className="px-3 py-2 text-neutral-300">{typeName(request.requestType) ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-md px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_CHIP[request.status]}`}>{statusName(request.status)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-md px-2 py-0.5 text-[0.7rem] font-semibold ${PRIORITY_CHIP[request.priority]}`}>
                          <PriorityLabel name={priorityName(request.priority)} priority={request.priority} />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">{formatDate(request.dueDate) || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted">{formatDate(request.createdAt.slice(0, 10))}</td>
                      <td className="px-3 py-2 text-right">
                        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setArchived(request.id, false)} title={`Restore ${request.code} to the board`} type="button">
                          <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-neutral-500">
              {filtersActive ? "No archived requests match those filters." : "Nothing archived yet. Use “Archive closed” to clear finished work off the board."}
            </p>
          )}
        </section>
      )}

      {/* Quick-edit menus */}
      {fieldMenu && fieldRequest ? (
        <Popover
          anchor={fieldMenu.anchor}
          label={fieldMenu.kind === "assignee" ? "Assign teammates" : `Select ${fieldMenu.kind}`}
          onClose={() => setFieldMenu(null)}
          subtitle={fieldMenu.kind === "assignee" ? "Select everyone working this ticket." : "Choose a value for this ticket."}
          title={fieldMenu.kind === "status" ? "Progress" : fieldMenu.kind === "type" ? "Type" : fieldMenu.kind === "priority" ? "Priority" : "Assignee"}
          width={fieldMenu.kind === "assignee" ? 300 : 260}
        >
          {fieldMenu.kind === "assignee" ? (
            team.map((member) => {
              const on = fieldRequest.assigneeIds.includes(member.id);
              return (
                <PopoverOption key={member.id} onClick={() => toggleAssignee(fieldRequest.id, member.id)} selected={on}>
                  <Avatar person={member} />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">{member.id === currentUser.id ? `${member.name} (you)` : member.name}</strong>
                    <small className="block truncate text-muted">{member.email}</small>
                  </span>
                  {on ? <Check className="h-4 w-4 text-brand" /> : null}
                </PopoverOption>
              );
            })
          ) : fieldMenu.kind === "type" ? (
            <TypeOptions
              onAdded={(type) => {
                setExtraTypes((current) => [...current, type]);
                mutate(patchLocal(fieldRequest.id, { requestType: type.key }), () => updateRequestAction(fieldRequest.id, { requestType: type.key }));
                setFieldMenu(null);
              }}
              onPick={(key) => {
                mutate(patchLocal(fieldRequest.id, { requestType: key }), () => updateRequestAction(fieldRequest.id, { requestType: key }));
                setFieldMenu(null);
              }}
              selected={fieldRequest.requestType}
              types={types}
            />
          ) : (
            (fieldMenu.kind === "status" ? REQUEST_STATUSES : REQUEST_PRIORITIES).map((option) => {
              const selectedKey = fieldMenu.kind === "status" ? fieldRequest.status : fieldRequest.priority;
              return (
                <PopoverOption
                  key={option.key}
                  onClick={() => {
                    if (fieldMenu.kind === "status") moveRequest(fieldRequest.id, option.key as RequestStatus);
                    else {
                      const priority = option.key as RequestItem["priority"];
                      mutate(patchLocal(fieldRequest.id, { priority }), () => updateRequestAction(fieldRequest.id, { priority }));
                    }
                    setFieldMenu(null);
                  }}
                  selected={selectedKey === option.key}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 rounded-full ${fieldMenu.kind === "status" ? STATUS_DOT[option.key as RequestStatus] : PRIORITY_CHIP[option.key as RequestItem["priority"]].split(" ")[0]}`}
                  />
                  <strong className="flex-1">{option.name}</strong>
                  {selectedKey === option.key ? <Check className="h-4 w-4 text-brand" /> : null}
                </PopoverOption>
              );
            })
          )}
        </Popover>
      ) : null}

      {/* Right-click menu */}
      {contextMenu && contextRequest ? (
        <Popover anchor={contextMenu.anchor} label={`Actions for ${contextRequest.code}`} onClose={() => setContextMenu(null)} width={250}>
          <header className="px-2.5 pb-2 pt-1">
            <span className="font-mono text-xs text-muted">{contextRequest.code}</span>
            <strong className="block truncate text-white">{contextRequest.title}</strong>
          </header>
          <PopoverOption
            onClick={() => {
              setSelectedId(contextRequest.id);
              setContextMenu(null);
            }}
          >
            <Link2 className="h-4 w-4" /> Open ticket
          </PopoverOption>
          <PopoverOption onClick={() => setContextMenu({ ...contextMenu, moveOpen: !contextMenu.moveOpen })}>
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[contextRequest.status]}`} />
            <span className="flex-1">Move to</span>
            <ChevronDown className={`h-4 w-4 transition ${contextMenu.moveOpen ? "rotate-180" : ""}`} />
          </PopoverOption>
          {contextMenu.moveOpen ? (
            <div className="ml-4 border-l border-line pl-1" role="group" aria-label="Move ticket to">
              {REQUEST_STATUSES.map((status) => (
                <PopoverOption
                  disabled={contextRequest.status === status.key}
                  key={status.key}
                  onClick={() => {
                    moveRequest(contextRequest.id, status.key);
                    setContextMenu(null);
                  }}
                  selected={contextRequest.status === status.key}
                >
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status.key]}`} />
                  <span className="flex-1">{status.name}</span>
                  {contextRequest.status === status.key ? <Check className="h-4 w-4" /> : null}
                </PopoverOption>
              ))}
            </div>
          ) : null}
          <div className="my-1 border-t border-line" />
          <PopoverOption
            onClick={() => {
              setArchived(contextRequest.id, true);
              setContextMenu(null);
            }}
          >
            <Archive className="h-4 w-4" /> Archive
          </PopoverOption>
          <PopoverOption
            danger
            onClick={() => {
              setPendingDelete(contextRequest);
              setContextMenu(null);
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete permanently
          </PopoverOption>
        </Popover>
      ) : null}

      {selected ? (
        <RequestDrawer
          currentUser={currentUser}
          focusConversation={conversationFocus}
          key={selected.id}
          mutate={mutate}
          onArchive={(flag) => setArchived(selected.id, flag)}
          onClose={() => {
            setSelectedId(null);
            setConversationFocus(false);
          }}
          onDelete={() => setPendingDelete(selected)}
          onError={setToast}
          onMove={(status) => moveRequest(selected.id, status)}
          onOpenField={(event, kind) => openField(event, selected.id, kind)}
          onOpenPerson={setPersonId}
          people={peopleById}
          request={selected}
          requesterOptions={requesterOptions}
          team={team}
          typeName={typeName}
        />
      ) : null}

      {personId ? (
        <PersonCard
          canEditPhone={currentUser.isAdmin || personId === currentUser.id}
          onClose={() => setPersonId(null)}
          onOpenRequest={(id) => {
            setPersonId(null);
            setSelectedId(id);
          }}
          onError={setToast}
          person={peopleById.get(personId) ?? null}
          requests={optimistic}
          isTeam={team.some((p) => p.id === personId)}
        />
      ) : null}

      {creating ? (
        <Dialog onClose={() => setCreating(false)} title="New request">
          <div className="p-5">
            <RequestForm
              boardId={board.id}
              currentUserId={currentUser.id}
              onCancel={() => setCreating(false)}
              onCreated={(created) => {
                setCreating(false);
                if (created.failedUploads.length) setToast(`Some files didn't upload (${created.failedUploads.join(", ")}). Re-attach them from the request.`);
                else setNotice(`Request ${created.code} created.`);
              }}
              requestTypes={types}
              requesterOptions={requesterOptions}
            />
          </div>
        </Dialog>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          body={
            <>
              <p>
                <strong className="font-mono text-white">{pendingDelete.code}</strong> {pendingDelete.title}
              </p>
              <p>
                This removes the request along with its comments and files, and can&apos;t be undone. If it&apos;s real work that is
                simply finished, archive it instead — archived requests stay searchable.
              </p>
            </>
          }
          cancelLabel="Keep it"
          confirmLabel="Delete permanently"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            if (selectedId === target.id) setSelectedId(null);
            mutate((list) => list.filter((r) => r.id !== target.id), () => deleteRequestAction(target.id));
          }}
          title="Delete this request?"
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-100 shadow-xl" role="alert">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function TypeOptions({
  types,
  selected,
  onPick,
  onAdded,
}: {
  types: RequestType[];
  selected: string | null;
  onPick: (key: string) => void;
  onAdded: (type: RequestType) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {types.map((type) => (
        <PopoverOption key={type.key} onClick={() => onPick(type.key)} selected={selected === type.key}>
          <strong className="flex-1">{type.name}</strong>
          {selected === type.key ? <Check className="h-4 w-4 text-brand" /> : null}
        </PopoverOption>
      ))}
      <div className="my-1 border-t border-line" />
      {adding ? (
        <form
          className="space-y-2 p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const result = await createRequestTypeAction(name);
            setBusy(false);
            if (!result.ok) setError(result.error);
            else onAdded({ key: result.key, name: result.name });
          }}
        >
          <label className="label" htmlFor="new-request-type">New category</label>
          <input autoFocus className="field py-1.5" disabled={busy} id="new-request-type" maxLength={60} minLength={2} onChange={(e) => setName(e.target.value)} placeholder="Category name" required value={name} />
          {error ? <p className="text-xs text-red-300" role="alert">{error}</p> : null}
          <div className="flex gap-2">
            <button className="btn-primary py-1.5 text-xs" disabled={busy} type="submit">{busy ? "Adding…" : "Add & select"}</button>
            <button className="btn-ghost py-1.5 text-xs" disabled={busy} onClick={() => setAdding(false)} type="button">Cancel</button>
          </div>
        </form>
      ) : (
        <PopoverOption onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> <strong>Add new category</strong>
        </PopoverOption>
      )}
    </>
  );
}
