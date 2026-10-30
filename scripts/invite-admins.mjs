// Sends Supabase invites to every email in ADMIN_EMAILS that doesn't have an account yet.
// Usage: npm run invite-admins   (reads .env.local)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
if (!emails.length) {
  console.error("ADMIN_EMAILS is empty.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) throw error;
const existing = new Map(data.users.map((u) => [(u.email ?? "").toLowerCase(), u]));

for (const email of emails) {
  let user = existing.get(email);
  if (user) {
    console.log(`✓ ${email} already has an account`);
  } else {
    const result = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${site}/auth/callback?next=/account/set-password`,
    });
    if (result.error) {
      console.error(`✗ ${email}: ${result.error.message}`);
      continue;
    }
    user = result.data.user;
    console.log(`✉ Invite sent to ${email}`);
  }
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email, role: "admin", is_active: true }, { onConflict: "id" });
  if (profileError) console.error(`  Could not mark ${email} as admin: ${profileError.message}`);
}
