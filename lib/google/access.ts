import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ClientAccess = { web: boolean; meta: boolean };
/** What someone may see: every client, or only some (each with web and/or Meta ads). */
export type WebAccess = { all: true } | { all: false; boards: Map<string, ClientAccess> };

/** Web analytics access for this person, or null when they have none. Admins are granted it like anyone else. */
export const webAccessFor = cache(async (userId: string): Promise<WebAccess | null> => {
  const admin = createAdminClient();
  const [viewer, grants] = await Promise.all([
    admin.from("web_analytics_viewers").select("user_id").eq("user_id", userId).maybeSingle(),
    admin.from("web_analytics_access").select("board_id, web, meta").eq("user_id", userId),
  ]);
  if (!viewer.error && viewer.data) return { all: true };
  // Before the per-client table exists, only the all-clients list applies.
  const rows = grants.error ? [] : (grants.data ?? []);
  if (!rows.length) return null;
  return { all: false, boards: new Map(rows.map((r) => [r.board_id as string, { web: Boolean(r.web), meta: Boolean(r.meta) }])) };
});

/** Whether this person can open web analytics at all (any client). */
export const hasWebAnalyticsAccess = cache(async (userId: string) => Boolean(await webAccessFor(userId)));

/** What this person may see for one client. */
export function accessTo(access: WebAccess | null, boardId: string): ClientAccess {
  if (!access) return { web: false, meta: false };
  if (access.all) return { web: true, meta: true };
  return access.boards.get(boardId) ?? { web: false, meta: false };
}

export type VisibleSite = WebSite & { canWeb: boolean; canMeta: boolean };

/** Linked client sites this person may see, with what they may see on each. */
export async function visibleWebSites(userId: string): Promise<VisibleSite[]> {
  const access = await webAccessFor(userId);
  if (!access) return [];
  return (await listWebSites())
    .map((s) => {
      const a = accessTo(access, s.boardId);
      return { ...s, canWeb: a.web && Boolean(s.ga4PropertyId || s.searchConsoleSite), canMeta: a.meta && Boolean(s.metaAdAccountId) };
    })
    .filter((s) => s.canWeb || s.canMeta);
}

/** Signed-in user who may see web analytics; everyone else goes back to their boards. */
export async function requireWebAnalytics(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await hasWebAnalyticsAccess(user.id))) redirect("/boards");
  return user;
}

export type WebSite = {
  boardId: string;
  name: string;
  slug: string;
  ga4PropertyId: string | null;
  searchConsoleSite: string | null;
  metaAdAccountId: string | null;
};

/** Every board, with its linked GA4 property, Search Console site and Meta ad account (if any). */
export async function listWebSites(): Promise<WebSite[]> {
  const admin = createAdminClient();
  const [boards, sites] = await Promise.all([
    admin.from("boards").select("id, name, slug").order("name"),
    admin.from("web_analytics_sites").select("board_id, ga4_property_id, search_console_site, meta_ad_account_id"),
  ]);
  if (boards.error) throw new Error(boards.error.message);
  if (sites.error) throw new Error(sites.error.message);
  const byBoard = new Map((sites.data ?? []).map((s) => [s.board_id, s]));
  return (boards.data ?? []).map((b) => ({
    boardId: b.id,
    name: b.name,
    slug: b.slug,
    ga4PropertyId: byBoard.get(b.id)?.ga4_property_id ?? null,
    searchConsoleSite: byBoard.get(b.id)?.search_console_site ?? null,
    metaAdAccountId: byBoard.get(b.id)?.meta_ad_account_id ?? null,
  }));
}
