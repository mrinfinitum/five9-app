"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { normalizeAdAccountId } from "@/lib/meta/ads";
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

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/**
 * Sets how much of web analytics someone sees: nothing, every client, or only the
 * clients chosen one by one (setWebClientAccessAction). Choosing "none" also clears
 * their per-client grants; "selected" keeps them.
 */
export async function setWebAccessAction(userId: string, mode: "none" | "all" | "selected"): Promise<WebResult> {
  return asAdmin(async (actorId) => {
    if (!isId(userId) || !["none", "all", "selected"].includes(mode)) throw new Error("Unknown person or access level.");
    const admin = createAdminClient();
    const { error } =
      mode === "all"
        ? await admin.from("web_analytics_viewers").upsert({ user_id: userId, granted_by: actorId }, { onConflict: "user_id" })
        : await admin.from("web_analytics_viewers").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
    if (mode === "none") {
      const { error: clearError } = await admin.from("web_analytics_access").delete().eq("user_id", userId);
      if (clearError) throw new Error(clearError.message);
    }
  });
}

/** Gives someone one client's web analytics and/or Meta ads (both off removes the client). */
export async function setWebClientAccessAction(userId: string, boardId: string, access: { web: boolean; meta: boolean }): Promise<WebResult> {
  return asAdmin(async (actorId) => {
    if (!isId(userId) || !isId(boardId)) throw new Error("Unknown person or client.");
    const web = access.web === true;
    const meta = access.meta === true;
    const admin = createAdminClient();
    const { error } =
      web || meta
        ? await admin
            .from("web_analytics_access")
            .upsert({ user_id: userId, board_id: boardId, web, meta, granted_by: actorId }, { onConflict: "user_id,board_id" })
        : await admin.from("web_analytics_access").delete().eq("user_id", userId).eq("board_id", boardId);
    if (error) throw new Error(error.message);
  });
}

/** Links a client board to its GA4 property, Search Console site and Meta ad account (blank clears any of them). */
export async function setWebSiteAction(
  boardId: string,
  input: { ga4PropertyId?: string | null; searchConsoleSite?: string | null; metaAdAccountId?: string | null },
): Promise<WebResult> {
  return asAdmin(async () => {
    const admin = createAdminClient();
    const { data: current } = await admin.from("web_analytics_sites").select("ga4_property_id, search_console_site, meta_ad_account_id").eq("board_id", boardId).maybeSingle();

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

    let meta = current?.meta_ad_account_id ?? null;
    if (input.metaAdAccountId !== undefined) {
      const id = normalizeAdAccountId(input.metaAdAccountId);
      if (id === undefined) throw new Error("A Meta ad account ID is a number, like act_123456789012345 or 123456789012345.");
      meta = id;
    }

    const { error } =
      ga4 || site || meta
        ? await admin
            .from("web_analytics_sites")
            .upsert(
              { board_id: boardId, ga4_property_id: ga4, search_console_site: site, meta_ad_account_id: meta, updated_at: new Date().toISOString() },
              { onConflict: "board_id" },
            )
        : await admin.from("web_analytics_sites").delete().eq("board_id", boardId);
    if (error) throw new Error(error.message);
  });
}
