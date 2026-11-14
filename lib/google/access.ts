import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Whether this person is on the web analytics allow-list (admins grant it one by one). */
export const hasWebAnalyticsAccess = cache(async (userId: string) => {
  const { data, error } = await createAdminClient().from("web_analytics_viewers").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) return false;
  return Boolean(data);
});

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
};

/** Every board, with its linked GA4 property and Search Console site (if any). */
export async function listWebSites(): Promise<WebSite[]> {
  const admin = createAdminClient();
  const [boards, sites] = await Promise.all([
    admin.from("boards").select("id, name, slug").order("name"),
    admin.from("web_analytics_sites").select("board_id, ga4_property_id, search_console_site"),
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
  }));
}
