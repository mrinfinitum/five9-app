import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, requireUser, type CurrentUser } from "@/lib/auth";

/**
 * Who can see the security page and get its alerts. Deliberately a short
 * fixed list rather than every admin (override with SECURITY_VIEWERS).
 */
export function securityViewerEmails() {
  const configured = (process.env.SECURITY_VIEWERS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : ["geoff@pgamemes.com", "travis@pgamemes.com"];
}

export function canSeeSecurity(user: Pick<CurrentUser, "email" | "isAdmin"> | null | undefined) {
  return Boolean(user?.isAdmin && securityViewerEmails().includes(user.email.toLowerCase()));
}

/** Page guard: everyone else goes back to their boards. */
export async function requireSecurityViewer() {
  const user = await requireUser();
  if (!canSeeSecurity(user)) redirect("/boards");
  return user;
}

/** Action guard. */
export async function securityViewerOrThrow() {
  const user = await getCurrentUser();
  if (!canSeeSecurity(user)) throw new Error("Not allowed.");
  return user!;
}
