"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { fixAutomationReady, fixPrompt, openFixIssue, type FindingRow } from "@/lib/security/fix";
import { runSecurityScan } from "@/lib/security/scan";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true; message?: string; prompt?: string; url?: string } | { ok: false; error: string };

async function admin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) throw new Error("Admins only.");
  return user;
}

const fail = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : "Something went wrong." });

export async function runScanAction(): Promise<Result> {
  try {
    const user = await admin();
    const result = await runSecurityScan("manual", user.id);
    revalidatePath("/admin/security");
    return { ok: true, message: `Ran ${result.checksRun} checks: ${result.findings} open finding${result.findings === 1 ? "" : "s"}, ${result.resolved} fixed since last scan.` };
  } catch (error) {
    return fail(error);
  }
}

async function finding(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown finding.");
  const { data, error } = await createAdminClient()
    .from("security_findings")
    .select("id, target, check_key, severity, title, detail, fix_hint, fixable, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Unknown finding.");
  return data as FindingRow & { status: string };
}

/** Starts a Claude fix (GitHub issue → routine → PR), or returns the prompt when automation isn't set up. */
export async function requestFixAction(id: string): Promise<Result> {
  try {
    const user = await admin();
    const f = await finding(id);
    if (!f.fixable || !fixAutomationReady()) return { ok: true, prompt: fixPrompt(f) };
    const url = await openFixIssue(f);
    await createAdminClient()
      .from("security_findings")
      .update({ status: "fixing", fix_issue_url: url, fix_requested_at: new Date().toISOString(), fix_requested_by: user.id })
      .eq("id", id);
    revalidatePath("/admin/security");
    return { ok: true, url, message: "Claude is on it. A pull request will appear on the GitHub issue." };
  } catch (error) {
    return fail(error);
  }
}

export async function fixPromptAction(id: string): Promise<Result> {
  try {
    await admin();
    return { ok: true, prompt: fixPrompt(await finding(id)) };
  } catch (error) {
    return fail(error);
  }
}

export async function setFindingStatusAction(id: string, status: "open" | "ignored" | "fixed"): Promise<Result> {
  try {
    await admin();
    if (!["open", "ignored", "fixed"].includes(status)) throw new Error("Unknown status.");
    await finding(id);
    await createAdminClient()
      .from("security_findings")
      .update({ status, resolved_at: status === "fixed" ? new Date().toISOString() : null })
      .eq("id", id);
    revalidatePath("/admin/security");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
