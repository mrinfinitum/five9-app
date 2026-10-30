import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="card p-6">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">404</p>
          <h1 className="mt-1 text-xl font-bold text-white">We couldn&apos;t find that page</h1>
          <p className="mt-2 text-sm text-muted">The link may be out of date, or this board may have been renamed or removed.</p>
          <Link className="btn-primary mt-5" href="/boards">Go to your boards</Link>
        </div>
      </div>
    </main>
  );
}
