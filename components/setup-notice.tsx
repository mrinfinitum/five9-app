export function SetupNotice() {
  return (
    <section className="card border-brand/50 p-6">
      <h2 className="text-lg font-bold text-white">One-time database setup needed</h2>
      <p className="mt-2 text-sm text-neutral-300">
        The tracker tables haven&apos;t been created in Supabase yet. Open the Supabase SQL editor, run{" "}
        <code className="rounded bg-ink px-1.5 py-0.5 text-brand">supabase/migrations/0001_init.sql</code>, then refresh
        this page.
      </p>
    </section>
  );
}
