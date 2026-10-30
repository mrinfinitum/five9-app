import { NextResponse, type NextRequest } from "next/server";
import { ATTACHMENT_BUCKET } from "@/lib/requests/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Opens an attachment via a short-lived signed URL, if the user can see its request. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("request_attachments")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await createAdminClient()
    .storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, 60, download ? { download: attachment.file_name } : undefined);
  if (error || !data) return NextResponse.json({ error: "Could not open the file" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
