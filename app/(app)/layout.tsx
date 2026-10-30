import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1700px] items-center gap-1.5 px-3 min-[390px]:gap-2 min-[390px]:px-4 sm:gap-6 sm:px-6">
          <Link aria-label="Five9 Media home" className="shrink-0" href="/boards">
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
      <nav className="flex min-w-0 items-center text-sm font-medium sm:gap-1">
        <Link className="whitespace-nowrap rounded-md px-1.5 py-1.5 text-[0.8rem] text-neutral-300 hover:bg-panel hover:text-white min-[390px]:px-2 min-[390px]:text-sm sm:px-3" href="/boards">
          Boards
        </Link>
        {user.isAdmin ? (
          <>
            <Link className="whitespace-nowrap rounded-md px-1.5 py-1.5 text-[0.8rem] text-neutral-300 hover:bg-panel hover:text-white min-[390px]:px-2 min-[390px]:text-sm sm:px-3" href="/analytics">
              Analytics
            </Link>
            <Link className="whitespace-nowrap rounded-md px-1.5 py-1.5 text-[0.8rem] text-neutral-300 hover:bg-panel hover:text-white min-[390px]:px-2 min-[390px]:text-sm sm:px-3" href="/admin">
              Admin
            </Link>
          </>
        ) : null}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-semibold text-white">{user.name}</div>
          <div className="text-xs text-muted">{user.isAdmin ? "Admin" : "Member"}</div>
        </div>
        <form action="/auth/signout" method="post">
          <button aria-label="Sign out" className="btn-ghost whitespace-nowrap px-2.5 py-1.5 text-xs sm:px-3" title="Sign out" type="submit">
            <LogOut aria-hidden="true" className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}
