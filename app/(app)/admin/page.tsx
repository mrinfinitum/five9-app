import { Suspense } from "react";
import { AdminConsole, type AdminBoardRow, type AdminUserRow } from "@/components/admin/admin-console";
import { SetupNotice } from "@/components/setup-notice";
import { requireAdmin } from "@/lib/auth";
import { isPresetAdmin, presetAdminEmails } from "@/lib/env";
import { boardLogoUrl } from "@/lib/requests/constants";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Users &amp; boards</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Invite people by email, create boards, and choose who can see each one. Admins see every board. Only invited people can
          sign in.
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

  const [usersResult, profilesResult, boardsResult, membersResult, requestsResult] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, email, full_name, role, is_active"),
    admin.from("boards").select("id, name, slug, description, logo_path, logo_light_path, logo_dark_tint, logo_light_tint, created_at").order("name"),
    admin.from("board_members").select("board_id, user_id, access"),
    admin.from("requests").select("board_id"),
  ]);
  const missing = [profilesResult.error, boardsResult.error].find((e) => e && (e.code === "42P01" || e.code === "PGRST205"));
  if (missing) return <SetupNotice />;
  for (const result of [profilesResult, boardsResult, membersResult, requestsResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  if (usersResult.error) throw new Error(usersResult.error.message);

  const profileById = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));
  const accessByUser = new Map<string, Record<string, "team" | "requester">>();
  for (const m of membersResult.data ?? []) {
    const entry = accessByUser.get(m.user_id) ?? {};
    entry[m.board_id] = m.access as "team" | "requester";
    accessByUser.set(m.user_id, entry);
  }

  const users: AdminUserRow[] = usersResult.data.users.map((user) => {
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
      access: accessByUser.get(user.id) ?? {},
    };
  });
  users.sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin") || a.email.localeCompare(b.email));

  const requestCounts = new Map<string, number>();
  for (const r of requestsResult.data ?? []) requestCounts.set(r.board_id, (requestCounts.get(r.board_id) ?? 0) + 1);
  const boards: AdminBoardRow[] = (boardsResult.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logoDarkUrl: boardLogoUrl(b.logo_path),
    logoLightUrl: boardLogoUrl(b.logo_light_path),
    logoDarkTint: b.logo_dark_tint,
    logoLightTint: b.logo_light_tint,
    requestCount: requestCounts.get(b.id) ?? 0,
  }));

  const existing = new Set(users.map((u) => u.email));
  const missingPresets = presetAdminEmails().filter((email) => !existing.has(email));

  return <AdminConsole boards={boards} missingPresets={missingPresets} users={users} />;
}
