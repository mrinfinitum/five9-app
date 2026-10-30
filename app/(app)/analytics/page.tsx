import { ChartNoAxesCombined } from "lucide-react";
import { Suspense } from "react";
import { AdminAnalytics } from "@/components/admin-analytics";
import { requireAdmin } from "@/lib/auth";
import { getOverallAnalytics } from "@/lib/requests/analytics";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
          <ChartNoAxesCombined className="h-3.5 w-3.5" /> Admin analytics
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">All boards</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Output, turnaround, and workload across every board. Filter by board, request type, person, or period.
        </p>
      </header>
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-xl bg-panel" />}>
        <AnalyticsLoader />
      </Suspense>
    </main>
  );
}

async function AnalyticsLoader() {
  // Admins only — everyone else is sent back to their boards.
  await requireAdmin();
  const data = await getOverallAnalytics();
  return <AdminAnalytics data={data} />;
}
