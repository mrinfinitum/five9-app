import { Suspense } from "react";
import { ProjectBoard } from "@/components/projects/project-board";
import { SetupNotice } from "@/components/setup-notice";
import { requireUser } from "@/lib/auth";
import { listProjects, listTeam, MissingSchemaError } from "@/lib/projects/data";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Project tracker</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Project pipeline</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Plan productions, campaigns, and client work in one place. Track owners, subtasks, budget, and
          conversation from a single board.
        </p>
      </header>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardLoader />
      </Suspense>
    </main>
  );
}

async function BoardLoader() {
  const user = await requireUser();
  let data: [Awaited<ReturnType<typeof listProjects>>, Awaited<ReturnType<typeof listTeam>>];
  try {
    data = await Promise.all([listProjects(), listTeam()]);
  } catch (error) {
    if (error instanceof MissingSchemaError) return <SetupNotice />;
    throw error;
  }
  const [projects, team] = data;
  return <ProjectBoard currentUser={{ id: user.id, isAdmin: user.isAdmin }} projects={projects} team={team} />;
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div className="h-80 animate-pulse rounded-xl bg-panel" key={i} />
      ))}
    </div>
  );
}
