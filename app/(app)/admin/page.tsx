import { Suspense } from "react";
import { AdminUsers, type AdminUserRow } from "@/components/admin/admin-users";
import { SetupNotice } from "@/components/setup-notice";
import { requireAdmin } from "@/lib/auth";
import { isPresetAdmin, presetAdminEmails } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Team & access</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Invite people by email, choose who can administer the app, and turn off access when someone leaves.
          Only invited people can sign in.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-panel" />}>
        <AdminLoader />
      </Suspense>
    </main>
  );
}

async function AdminLoader() {
  const actor = await requireAdmin();
  const admin = createAdminClient();

  const [{ data: usersData, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, email, full_name, role, is_active"),
  ]);
  if (profilesError && (profilesError.code === "42P01" || profilesError.code === "PGRST205")) return <SetupNotice />;
  if (usersError) throw new Error(usersError.message);
  if (profilesError) throw new Error(profilesError.message);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rows: AdminUserRow[] = usersData.users.map((user) => {
    const email = (user.email ?? "").toLowerCase();
    const profile = profileById.get(user.id);
    const preset = isPresetAdmin(email);
    return {
      id: user.id,
      email,
      name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
      role: preset || profile?.role === "admin" ? "admin" : "member",
      isActive: profile?.is_active ?? true,
      isPreset: preset,
      isSelf: user.id === actor.id,
      invitedPending: !user.last_sign_in_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      createdAt: user.created_at,
    };
  });
  rows.sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin") || a.email.localeCompare(b.email));

  const existing = new Set(rows.map((r) => r.email));
  const missingPresets = presetAdminEmails().filter((email) => !existing.has(email));

  return <AdminUsers missingPresets={missingPresets} rows={rows} />;
}
