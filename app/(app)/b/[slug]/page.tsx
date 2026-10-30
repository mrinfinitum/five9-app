import { ChartNoAxesCombined, KanbanSquare } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BoardLogo } from "@/components/board-logo";
import { BoardName } from "@/components/board-name";
import { RequestBoard } from "@/components/requests/board";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/auth";
import {
  MissingSchemaError,
  getBoardContext,
  listArchivedSummaries,
  listBoardPeople,
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
  const { board } = context;

  const [active, archived, people, requestTypes] = await Promise.all([
    listRequests(board.id, { activeOnly: true }),
    listArchivedSummaries(board.id),
    listPeople(),
    listRequestTypes(),
  ]);
  const requests = [...active, ...archived];
  const team = await listBoardPeople(board.id, people);

  return (
    <>
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <BoardLogo board={board} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
            <KanbanSquare className="h-3.5 w-3.5" /> <BoardName boardId={board.id} canEdit={user.isAdmin} name={board.name} />
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Request pipeline</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every request on this board. Drag cards between columns to update status — everyone on the board sees the change
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
        requesterOptions={team}
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
