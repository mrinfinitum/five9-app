"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/set-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4 text-sm text-neutral-200">
        <p>If <strong className="text-white">{email}</strong> has an account, a reset link is on its way.</p>
        <Link className="btn-ghost w-full" href="/login">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="field" id="email" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
      </div>
      {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
      <button className="btn-primary w-full" disabled={busy} type="submit">{busy ? "Sending…" : "Send reset link"}</button>
      <Link className="block text-center text-xs text-muted hover:text-white" href="/login">Back to sign in</Link>
    </form>
  );
}
