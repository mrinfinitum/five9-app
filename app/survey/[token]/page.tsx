import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { SATISFACTION_FACES, recordSurveyResponse } from "@/lib/requests/survey";

export const metadata: Metadata = { title: "Feedback", robots: { index: false, follow: false } };

export default function SurveyPage({ params, searchParams }: PageProps<"/survey/[token]">) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="card p-6">
          <Suspense fallback={<p className="text-sm text-muted">Recording your answer…</p>}>
            <SurveyResult params={params} searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function SurveyResult({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const rating = Number.parseInt(String(query.rating ?? ""), 10);
  const result = await recordSurveyResponse(token, rating);

  if (result.status === "recorded" || result.status === "already_recorded") {
    const face = SATISFACTION_FACES.find((f) => f.rating === result.rating);
    return (
      <>
        <div aria-hidden="true" className="text-6xl">{face?.emoji}</div>
        <h1 className="mt-3 text-xl font-bold text-white">
          {result.status === "recorded" ? "Thanks for your feedback!" : "We already have your answer."}
        </h1>
        <p className="mt-2 text-sm text-muted">
          You rated this request <strong className="text-white">{face?.label.toLowerCase()}</strong>. Your response is anonymous.
        </p>
      </>
    );
  }

  const message =
    result.status === "expired"
      ? "This survey link has expired."
      : result.status === "superseded"
        ? "A newer survey was sent for this request — please use the link in the latest email."
        : "This survey link isn't valid.";
  return (
    <>
      <h1 className="text-xl font-bold text-white">We couldn&apos;t record that</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </>
  );
}
