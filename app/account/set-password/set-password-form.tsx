"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      password,
      ...(name.trim() ? { data: { full_name: name.trim() } } : {}),
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    if (name.trim() && data.user) {
      await fetch("/api/profile", { method: "POST", body: JSON.stringify({ fullName: name.trim() }) });
    }
    window.location.replace("/boards");
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="label" htmlFor="name">Your name <span className="normal-case tracking-normal">(optional)</span></label>
        <input autoComplete="name" className="field" id="name" onChange={(e) => setName(e.target.value)} value={name} />
      </div>
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input autoComplete="new-password" className="field" id="password" minLength={8} onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm password</label>
        <input autoComplete="new-password" className="field" id="confirm" onChange={(e) => setConfirm(e.target.value)} required type="password" value={confirm} />
      </div>
      {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : null}
      <button className="btn-primary w-full" disabled={busy} type="submit">{busy ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}
