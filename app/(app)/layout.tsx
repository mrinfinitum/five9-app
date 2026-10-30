import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1700px] items-center gap-6 px-4 sm:px-6">
          <Link href="/boards" aria-label="Five9 Media home">
            <Logo />
          </Link>
          <Suspense fallback={<div className="ml-auto h-8 w-40 animate-pulse rounded bg-panel" />}>
            <NavAndUser />
          </Suspense>
        </div>
        <div className="h-0.5 bg-gradient-to-r from-brand via-brand/60 to-transparent" />
      </header>
      <div className="flex-1 pb-20 sm:pb-0">{children}</div>
    </div>
  );
}

async function NavAndUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      <nav className="flex items-center gap-1 text-sm font-medium">
        <Link className="rounded-md px-3 py-1.5 text-neutral-300 hover:bg-panel hover:text-white" href="/boards">
          Boards
        </Link>
        {user.isAdmin ? (
          <Link className="rounded-md px-3 py-1.5 text-neutral-300 hover:bg-panel hover:text-white" href="/admin">
            Admin
          </Link>
        ) : null}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-semibold text-white">{user.name}</div>
          <div className="text-xs text-muted">{user.isAdmin ? "Admin" : "Member"}</div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost px-3 py-1.5 text-xs" type="submit">Sign out</button>
        </form>
      </div>
    </>
  );
}
