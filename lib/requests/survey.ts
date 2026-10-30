import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const SATISFACTION_FACES = [
  { rating: 1, emoji: "😞", label: "Very unhappy" },
  { rating: 2, emoji: "🙁", label: "Unhappy" },
  { rating: 3, emoji: "😐", label: "Okay" },
  { rating: 4, emoji: "🙂", label: "Happy" },
  { rating: 5, emoji: "😄", label: "Very happy" },
] as const;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a one-time survey for a completed request and retires any older one. */
export async function createSurvey(requestId: string, closerId: string | null) {
  const token = randomBytes(24).toString("base64url");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("request_surveys")
    .insert({ request_id: requestId, closer_id: closerId, token_hash: hash(token) })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[survey] Could not create survey", error?.message);
    return null;
  }
  await admin
    .from("request_surveys")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("request_id", requestId)
    .neq("id", data.id)
    .is("invalidated_at", null);
  return token;
}

export type SurveyResult =
  | { status: "recorded" | "already_recorded"; rating: number }
  | { status: "expired" | "invalid" | "superseded" };

export async function recordSurveyResponse(token: string, rating: number): Promise<SurveyResult> {
  if (!token || token.length > 200 || !Number.isInteger(rating) || rating < 1 || rating > 5) return { status: "invalid" };
  const admin = createAdminClient();
  const { data: survey } = await admin
    .from("request_surveys")
    .select("id, rating, expires_at, invalidated_at")
    .eq("token_hash", hash(token))
    .maybeSingle();
  if (!survey) return { status: "invalid" };
  if (survey.rating !== null) return { status: "already_recorded", rating: survey.rating };
  if (survey.invalidated_at) return { status: "superseded" };
  if (new Date(survey.expires_at).getTime() < Date.now()) return { status: "expired" };

  const { data: updated } = await admin
    .from("request_surveys")
    .update({ rating, responded_at: new Date().toISOString() })
    .eq("id", survey.id)
    .is("rating", null)
    .select("rating")
    .maybeSingle();
  if (updated?.rating) return { status: "recorded", rating: updated.rating };
  return { status: "invalid" };
}

export type SatisfactionPeriod = { average: number | null; responses: number };

/** Average ratings for this week (Mon–Sun), this month, and year to date. */
export async function getSatisfactionPulse(boardId: string, now = new Date()) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("request_surveys")
    .select("rating, responded_at, requests!inner(board_id)")
    .eq("requests.board_id", boardId)
    .not("rating", "is", null);
  const rows = (data ?? []).filter((row) => row.responded_at);

  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  function period(start: Date): SatisfactionPeriod {
    const ratings = rows.filter((row) => Date.parse(row.responded_at!) >= start.getTime()).map((row) => row.rating as number);
    return {
      average: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
      responses: ratings.length,
    };
  }

  return { week: period(startOfWeek), month: period(startOfMonth), ytd: period(startOfYear) };
}
