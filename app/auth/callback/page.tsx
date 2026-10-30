import { AuthShell } from "@/components/auth-shell";
import { CallbackHandler } from "./callback-handler";

export const metadata = { title: "Signing in" };

export default function AuthCallbackPage() {
  return (
    <AuthShell title="Signing you in…">
      <CallbackHandler />
    </AuthShell>
  );
}
