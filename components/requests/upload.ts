"use client";

import { createUploadTargetAction, notifyAttachmentsAction, registerAttachmentAction } from "@/app/(app)/b/actions";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES } from "@/lib/requests/constants";
import { createClient } from "@/lib/supabase/client";

export type UploadOutcome = { fileName: string; ok: boolean; error?: string };

/** Uploads files straight to storage with one-time URLs, then records them on the request. */
export async function uploadFiles(
  requestId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadOutcome[]> {
  const supabase = createClient();
  const outcomes: UploadOutcome[] = [];
  let done = 0;
  onProgress?.(0, files.length);

  for (const file of files) {
    try {
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("File is larger than 50 MB");
      const target = await createUploadTargetAction(requestId, file.name, file.size);
      if (!target.ok) throw new Error(target.error);
      const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).uploadToSignedUrl(target.path, target.token, file, {
        contentType: file.type || undefined,
      });
      if (error) throw new Error(error.message);
      const registered = await registerAttachmentAction({
        requestId,
        path: target.path,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || null,
      });
      if (!registered.ok) throw new Error(registered.error);
      outcomes.push({ fileName: file.name, ok: true });
    } catch (error) {
      outcomes.push({ fileName: file.name, ok: false, error: error instanceof Error ? error.message : "Upload failed" });
    }
    done += 1;
    onProgress?.(done, files.length);
  }

  const uploaded = outcomes.filter((o) => o.ok).map((o) => o.fileName);
  await notifyAttachmentsAction(requestId, uploaded);
  return outcomes;
}
