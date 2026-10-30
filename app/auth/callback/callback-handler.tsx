"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";

/**
 * Finishes every email link Supabase sends (invite, magic link, password
 * reset). Handles all three formats: ?token_hash=, ?code= (PKCE) and
 * #access_token= (implicit, used by admin invites with default templates).
 */
export function CallbackHandler() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const type = (url.searchParams.get("type") ?? hash.get("type")) as EmailOtpType | null;
      let next = safeNext(url.searchParams.get("next"));
      if (type === "invite" || type === "recovery") next = "/account/set-password";

      const hashError = hash.get("error_description") ?? url.searchParams.get("error_description");
      if (hashError) throw new Error(hashError);

      const tokenHash = url.searchParams.get("token_hash");
      const code = url.searchParams.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw error;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error("This link is missing its sign-in details.");
      }

      window.location.replace(next);
    })().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "That link didn't work.");
    });
  }, []);

  if (!error) return <p className="text-sm text-muted">One moment while we verify your link.</p>;

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200" role="alert">
        {error} Links expire after a short time and can only be used once.
      </p>
      <Link className="btn-primary w-full" href="/login">Back to sign in</Link>
    </div>
  );
}
