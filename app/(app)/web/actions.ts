"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type WebResult = { ok: true } | { ok: false; error: string };

async function asAdmin(fn: (actorId: string) => Promise<void>): Promise<WebResult> {
  try {
    const actor = await getCurrentUser();
    if (!actor?.isAdmin) throw new Error("Admins only.");
    await fn(actor.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

/** Adds or removes someone from the web analytics allow-list. */
export async function setWebViewerAction(userId: string, allowed: boolean): Promise<WebResult> {
  return asAdmin(async (actorId) => {
    const admin = createAdminClient();
    const { error } = allowed
      ? await admin.from("web_analytics_viewers").upsert({ user_id: userId, granted_by: actorId }, { onConflict: "user_id" })
      : await admin.from("web_analytics_viewers").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
  });
}

/** Links a client board to its GA4 property and Search Console site (blank clears either). */
export async function setWebSiteAction(
  boardId: string,
  input: { ga4PropertyId?: string | null; searchConsoleSite?: string | null },
): Promise<WebResult> {
  return asAdmin(async () => {
    const admin = createAdminClient();
    const { data: current } = await admin.from("web_analytics_sites").select("ga4_property_id, search_console_site").eq("board_id", boardId).maybeSingle();

    let ga4 = current?.ga4_property_id ?? null;
    if (input.ga4PropertyId !== undefined) {
      ga4 = (input.ga4PropertyId ?? "").trim().replace(/^properties\//, "") || null;
      if (ga4 && !/^\d{1,20}$/.test(ga4)) throw new Error("A GA4 property ID is a number, like 123456789.");
    }
    let site = current?.search_console_site ?? null;
    if (input.searchConsoleSite !== undefined) {
      site = (input.searchConsoleSite ?? "").trim() || null;
      if (site && (site.length > 300 || !/^(sc-domain:[a-z0-9.-]+|https?:\/\/\S+)$/i.test(site))) {
        throw new Error("Use the site exactly as Search Console shows it: sc-domain:example.com or https://www.example.com/.");
      }
    }

    const { error } =
      ga4 || site
        ? await admin
            .from("web_analytics_sites")
            .upsert({ board_id: boardId, ga4_property_id: ga4, search_console_site: site, updated_at: new Date().toISOString() }, { onConflict: "board_id" })
        : await admin.from("web_analytics_sites").delete().eq("board_id", boardId);
    if (error) throw new Error(error.message);
  });
}
