import { ChartNoAxesCombined, KanbanSquare, Megaphone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BoardLogo, hasBoardLogo } from "@/components/board-logo";
import { BoardName } from "@/components/board-name";
import { RequestBoard } from "@/components/requests/board";
import { RequesterPortal } from "@/components/requests/portal";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/auth";
import {
  MissingSchemaError,
  getBoardContext,
  listBoardRequesters,
  listBoardTeam,
  listPeople,
  listRequestTypes,
  listRequests,
} from "@/lib/requests/data";

export default function BoardPage({ params }: PageProps<"/b/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-8 sm:px-6">
      <Suspense fallback={<BoardSkeleton />}>
        <BoardLoader params={params} />
      </Suspense>
    </main>
  );
}

async function BoardLoader({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, user] = await Promise.all([params, requireUser()]);
  let context: Awaited<ReturnType<typeof getBoardContext>>;
  try {
    context = await getBoardContext(slug);
  } catch (error) {
    if (error instanceof MissingSchemaError) return <SetupNotice />;
    throw error;
  }
  if (!context) notFound();
  const { board, access } = context;

  if (access === "requester") {
    const [requests, people, requestTypes] = await Promise.all([
      listRequests(board.id, { requesterId: user.id }),
      listPeople(),
      listRequestTypes(),
    ]);
    return (
      <>
        <header className="mb-6">
          {hasBoardLogo(board) ? (
            <div className="mb-4">
              <BoardLogo board={board} size="lg" />
            </div>
          ) : null}
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
            <Megaphone className="h-3.5 w-3.5" /> <BoardName boardId={board.id} canEdit={user.isAdmin} name={board.name} />
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Tell us what you need</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Submit a request for video, photo, design, social, web, or campaign work — then follow its progress from intake to
            delivery right here.
          </p>
        </header>
        <RequesterPortal board={board} currentUserId={user.id} people={people} requestTypes={requestTypes} requests={requests} />
      </>
    );
  }

  const [requests, people, requestTypes] = await Promise.all([listRequests(board.id), listPeople(), listRequestTypes()]);
  const [team, requesterOptions] = await Promise.all([listBoardTeam(board.id, people), listBoardRequesters(board.id, people)]);

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end gap-4">
        <BoardLogo board={board} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
            <KanbanSquare className="h-3.5 w-3.5" /> <BoardName boardId={board.id} canEdit={user.isAdmin} name={board.name} />
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Request pipeline</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every request on this board. Drag cards between columns to update status — requesters see the change in their thread
            instantly.
          </p>
        </div>
        <Link className="btn-ghost" href={`/b/${board.slug}/analytics`}>
          <ChartNoAxesCombined className="h-4 w-4" /> Analytics
        </Link>
      </header>
      <RequestBoard
        board={board}
        currentUser={{ id: user.id, isAdmin: user.isAdmin }}
        people={people}
        requestTypes={requestTypes}
        requesterOptions={requesterOptions}
        requests={requests}
        team={team}
      />
    </>
  );
}

function BoardSkeleton() {
  return (
    <div>
      <div className="mb-6 h-20 w-96 animate-pulse rounded-lg bg-panel" />
      <div className="flex gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div className="h-96 flex-1 animate-pulse rounded-xl bg-panel" key={i} />
        ))}
      </div>
    </div>
  );
}
