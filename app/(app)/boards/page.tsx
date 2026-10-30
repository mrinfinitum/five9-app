import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BoardLogo } from "@/components/board-logo";
import { hasBoardLogo } from "@/lib/requests/logos";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/auth";
import { MissingSchemaError, listMyBoards } from "@/lib/requests/data";

export const metadata = { title: "Boards" };

export default function BoardsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Request pipeline</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Your boards</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Pick a board to submit a request or work the queue.</p>
      </header>
      <Suspense fallback={<div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div className="h-36 animate-pulse rounded-xl bg-panel" key={i} />)}</div>}>
        <BoardList />
      </Suspense>
    </main>
  );
}

async function BoardList() {
  const user = await requireUser();
  let boards: Awaited<ReturnType<typeof listMyBoards>>;
  try {
    boards = await listMyBoards();
  } catch (error) {
    if (error instanceof MissingSchemaError) return <SetupNotice />;
    throw error;
  }

  // One board? Go straight to it.
  if (boards.length === 1 && !user.isAdmin) redirect(`/b/${boards[0].slug}`);

  if (!boards.length) {
    return (
      <section className="card p-6">
        <h2 className="text-lg font-bold text-white">No boards yet</h2>
        <p className="mt-1 text-sm text-muted">
          {user.isAdmin ? (
            <>Create your first board from the <Link className="text-brand hover:underline" href="/admin">Admin</Link> screen.</>
          ) : (
            "You haven't been added to a board yet. Ask a Five9 Media admin for access."
          )}
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {boards.map((board) => (
        <Link className="card group flex flex-col p-5 transition hover:border-brand/70" href={`/b/${board.slug}`} key={board.id}>
          <BoardLogo board={board} size="md" />
          <h2 className={`text-xl font-bold text-white ${hasBoardLogo(board) ? "mt-4" : ""}`}>{board.name}</h2>
          {board.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{board.description}</p> : null}
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
            Open <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}
