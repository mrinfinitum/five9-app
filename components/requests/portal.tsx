"use client";

import { CheckCircle2, ClipboardList, MessageSquare, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { addCommentAction, type ActionResult } from "@/app/(app)/b/actions";
import { STATUS_PROGRESS, isClosedStatus, priorityName, statusName } from "@/lib/requests/constants";
import type { Board, Person, RequestItem, RequestType } from "@/lib/requests/types";
import { Attachments, CommentForm, Conversation } from "./drawer";
import { RequestForm } from "./request-form";
import { STATUS_CHIP, formatDate } from "./ui";

const tempId = () => `temp-${Math.random().toString(36).slice(2)}`;

export function RequesterPortal({
  board,
  requests,
  people,
  requestTypes,
  currentUserId,
}: {
  board: Board;
  requests: RequestItem[];
  people: Person[];
  requestTypes: RequestType[];
  currentUserId: string;
}) {
  const [optimistic, applyOptimistic] = useOptimistic(requests, (state: RequestItem[], update: (r: RequestItem[]) => RequestItem[]) => update(state));
  const [, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ code: string; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("request");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL
    if (code) setOpenCode(code.toUpperCase());
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const mutate = useCallback(
    (update: (list: RequestItem[]) => RequestItem[], action: () => Promise<ActionResult>) => {
      startTransition(async () => {
        applyOptimistic(update);
        const result = await action();
        if (!result.ok) setError(result.error);
      });
    },
    [applyOptimistic],
  );

  const open = optimistic.filter((r) => !isClosedStatus(r.status));
  const closed = optimistic.filter((r) => isClosedStatus(r.status));
  const typeName = (key: string | null) => requestTypes.find((t) => t.key === key)?.name ?? null;

  return (
    <div className="space-y-5">
      {flash ? (
        flash.failed.length ? (
          <p className="flex items-center gap-2 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-100" role="alert">
            <TriangleAlert className="h-4 w-4" /> Request {flash.code} is in, but some files didn&apos;t upload ({flash.failed.join(", ")}). You can
            re-attach them from the request below.
          </p>
        ) : (
          <p className="flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100" role="status">
            <CheckCircle2 className="h-4 w-4" /> Request {flash.code} is in. The team will pick it up and post updates below.
          </p>
        )
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section aria-labelledby="new-request-title" className="card h-fit p-5">
          <h2 className="mb-4 text-lg font-bold text-white" id="new-request-title">New request</h2>
          <RequestForm
            boardId={board.id}
            currentUserId={currentUserId}
            onCreated={(created) => {
              setFlash({ code: created.code, failed: created.failedUploads });
              setOpenCode(created.code);
            }}
            requestTypes={requestTypes}
          />
        </section>

        <section aria-labelledby="your-requests-title">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-bold text-white" id="your-requests-title">Your requests</h2>
            <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted">
              <ClipboardList className="h-4 w-4" /> {open.length} open
            </span>
          </div>
          {optimistic.length ? (
            <div className="space-y-3">
              {open.map((request) => (
                <PortalCard currentUserId={currentUserId} defaultOpen={openCode === request.code} key={request.id} mutate={mutate} onError={setError} peopleById={peopleById} request={request} typeName={typeName} />
              ))}
              {closed.length ? (
                <details className="card p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-neutral-300">Closed requests ({closed.length})</summary>
                  <div className="mt-3 space-y-3">
                    {closed.map((request) => (
                      <PortalCard currentUserId={currentUserId} defaultOpen={openCode === request.code} key={request.id} mutate={mutate} onError={setError} peopleById={peopleById} request={request} typeName={typeName} />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="card p-6 text-sm text-muted">
              You haven&apos;t submitted any requests here yet. Your first one will show up here with live status updates.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function PortalCard({
request,
typeName,
peopleById,
currentUserId,
defaultOpen,
onError,
mutate,
}: {
request: RequestItem;
typeName: (key: string | null) => string | null;
peopleById: Map<string, Person>;
currentUserId: string;
defaultOpen: boolean;
onError: (message: string) => void;
mutate: (update: (list: RequestItem[]) => RequestItem[], action: () => Promise<ActionResult>) => void;
}) {
  const progress = STATUS_PROGRESS[request.status];
  const conversationCount = request.comments.filter((c) => c.kind === "comment").length;
  return (
    <article className="card p-4" id={request.code}>
      <header className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-muted">{request.code}</span>
        <span className={`ml-auto rounded-md px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_CHIP[request.status]}`}>{statusName(request.status)}</span>
      </header>
      <h3 className="mt-1 font-bold text-white" title={request.title}>{request.title}</h3>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {typeName(request.requestType) ? <span>{typeName(request.requestType)}</span> : null}
        <span>{priorityName(request.priority)} priority</span>
        <span>Submitted {formatDate(request.createdAt.slice(0, 10))}</span>
        {request.dueDate ? <span>Needed by {formatDate(request.dueDate)}</span> : null}
      </p>
      <div
        aria-label={`Progress: ${statusName(request.status)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel-2"
        role="progressbar"
      >
        <div className={`h-full ${request.status === "cancelled" ? "bg-neutral-600" : request.status === "completed" ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${progress}%` }} />
      </div>
      <details className="group mt-3" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-neutral-300 hover:text-white">
          <MessageSquare className="h-4 w-4" />
          Updates &amp; conversation{conversationCount ? ` (${conversationCount})` : ""}
        </summary>
        <div className="mt-3 space-y-4">
          {request.description ? <p className="whitespace-pre-wrap rounded-lg bg-panel-2 px-3 py-2 text-sm text-neutral-200">{request.description}</p> : null}
          <Attachments canDelete={false} onError={onError} people={peopleById} request={request} />
          <div>
            <h4 className="label">Conversation</h4>
            <Conversation emptyText="No updates yet. The team will post progress here." people={peopleById} request={request} />
            <CommentForm
              onPost={(body) =>
                mutate(
                  (list) =>
                    list.map((r) =>
                      r.id === request.id
                        ? {
                            ...r,
                            comments: [
                              ...r.comments,
                              { id: tempId(), body, authorId: currentUserId, isInternal: false, kind: "comment", createdAt: new Date().toISOString() },
                            ],
                          }
                        : r,
                    ),
                  () => addCommentAction(request.id, body, false),
                )
              }
              placeholder="Add a comment or extra details…"
            />
          </div>
        </div>
      </details>
    </article>
  );
}
