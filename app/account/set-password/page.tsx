import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Set your password" };

export default function SetPasswordPage() {
  return (
    <AuthShell title="Set your password" subtitle="Choose a password for your Five9 Media account.">
      <SetPasswordForm />
    </AuthShell>
  );
}
