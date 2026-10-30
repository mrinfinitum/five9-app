import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell title="Sign in" subtitle="Welcome back to the Five9 Media project tracker.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
