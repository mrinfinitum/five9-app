import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WebSettings } from "@/components/web-analytics/settings";
import { requireAdmin } from "@/lib/auth";
import { listWebSites } from "@/lib/google/access";
import { serviceAccountEmail } from "@/lib/google/client";
import { listGa4Properties, listSearchSites, type Ga4Property, type SearchSite } from "@/lib/google/reports";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Web analytics settings" };

export default function WebSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white" href="/web">
        <ArrowLeft className="h-4 w-4" /> Web analytics
      </Link>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Web analytics settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Connect each client board to its Google Analytics 4 property and Search Console site, and choose who can see the dashboard.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-panel" />}>
        <SettingsLoader />
      </Suspense>
    </main>
  );
}

async function SettingsLoader() {
  await requireAdmin();
  const admin = createAdminClient();
  const email = serviceAccountEmail();

  const [sites, profiles, viewers, ga4, search] = await Promise.all([
    listWebSites(),
    admin.from("profiles").select("id, email, full_name, role, is_active").eq("is_active", true).order("full_name"),
    admin.from("web_analytics_viewers").select("user_id"),
    email ? listGa4Properties().then((list) => ({ list }), (e: Error) => ({ error: e.message })) : null,
    email ? listSearchSites().then((list) => ({ list }), (e: Error) => ({ error: e.message })) : null,
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  if (viewers.error) throw new Error(viewers.error.message);
  const allowed = new Set((viewers.data ?? []).map((v) => v.user_id));

  return (
    <WebSettings
      ga4={ga4 as { list: Ga4Property[] } | { error: string } | null}
      people={(profiles.data ?? []).map((p) => ({
        id: p.id,
        name: (p.full_name as string | null)?.trim() || String(p.email).split("@")[0],
        email: p.email,
        isAdmin: p.role === "admin",
        allowed: allowed.has(p.id),
      }))}
      search={search as { list: SearchSite[] } | { error: string } | null}
      serviceEmail={email}
      sites={sites}
    />
  );
}
