"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { safeNext } from "@/lib/safe-next";
import { requestAuthEmail, requestPresetAdminInvite } from "./actions";
import { createClient } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  no_access: "Your account doesn't have access. Ask a Five9 admin for an invite.",
  link_expired: "That link is invalid or has expired. Request a new one.",
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);
  const [sent, setSent] = useState<false | "link" | "invite">(false);

  // Accounts without access (deactivated / not invited) get signed out so they can retry cleanly.
  useEffect(() => {
    if (params.get("error") === "no_access") void createClient().auth.signOut();
  }, [params]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        // Preset admins without an account yet get their invite emailed here.
        if ((await requestPresetAdminInvite(email)) === "invited") {
          setSent("invite");
          return;
        }
        if (await requestAuthEmail("magiclink", email, next)) {
          setSent("link");
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            shouldCreateUser: false, // invite only
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setSent("link");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed.";
      setError(
        /signups not allowed|not found|otp_disabled/i.test(message)
          ? "We couldn't find an invited account for that email."
          : /invalid login credentials/i.test(message)
            ? "Wrong email or password. First time here? Use the email link option below."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-neutral-200">
          Check <strong className="text-white">{email}</strong> for{" "}
          {sent === "invite" ? "your invite. Open it to set your password." : "a sign-in link."}
        </p>
        <button className="btn-ghost w-full" onClick={() => setSent(false)} type="button">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          autoComplete="email"
          className="field"
          id="email"
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      {mode === "password" ? (
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link className="mb-1 text-xs text-muted hover:text-white" href="/forgot-password">
              Forgot?
            </Link>
          </div>
          <input
            autoComplete="current-password"
            className="field"
            id="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
      ) : null}
      {error ? <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200" role="alert">{error}</p> : null}
      <button className="btn-primary w-full" disabled={busy} type="submit">
        {busy ? "Working…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </button>
      <button
        className="w-full text-center text-xs text-muted hover:text-white"
        onClick={() => {
          setMode(mode === "password" ? "link" : "password");
          setError(null);
        }}
        type="button"
      >
        {mode === "password" ? "Sign in with an email link instead" : "Sign in with a password instead"}
      </button>
    </form>
  );
}
