import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOARD_LOGO_BUCKET } from "./constants";

const EMAIL_LOGO_HEIGHT = 160; // shown at 40px in emails; 4x for sharp screens

/**
 * Renders a PNG copy of a board's logo for emails: the light-mode logo (or the
 * dark-mode one if that's all there is), painted in the light-mode colour if
 * one is set. SVGs are rasterised. Returns the new storage path, or null when
 * the board has no logo. The previous PNG is deleted.
 */
export async function refreshEmailLogo(boardId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: board } = await admin
    .from("boards")
    .select("logo_path, logo_light_path, logo_dark_tint, logo_light_tint, email_logo_path")
    .eq("id", boardId)
    .maybeSingle();
  if (!board) return null;

  const source = board.logo_light_path ?? board.logo_path;
  // Colour for the light (white) email background; the dark logo's colour if it's the only one.
  const tint = board.logo_light_path ? board.logo_light_tint : (board.logo_light_tint ?? board.logo_dark_tint);
  let nextPath: string | null = null;

  if (source) {
    const { data: file, error } = await admin.storage.from(BOARD_LOGO_BUCKET).download(source);
    if (error || !file) throw new Error("Couldn't read the board logo.");
    const input = Buffer.from(await file.arrayBuffer());
    const isSvg = source.endsWith(".svg");

    let png = await sharp(input, isSvg ? { density: 384 } : undefined)
      .resize({ height: EMAIL_LOGO_HEIGHT, fit: "inside", withoutEnlargement: !isSvg })
      .ensureAlpha()
      .png()
      .toBuffer();

    if (tint) {
      // Keep the logo's shape (alpha), fill it with the chosen colour.
      const { width, height } = await sharp(png).metadata();
      png = await sharp({ create: { width: width!, height: height!, channels: 4, background: tint } })
        .composite([{ input: png, blend: "dest-in" }])
        .png()
        .toBuffer();
    }

    nextPath = `${boardId}/email-${randomUUID()}.png`;
    const { error: uploadError } = await admin.storage
      .from(BOARD_LOGO_BUCKET)
      .upload(nextPath, png, { contentType: "image/png", upsert: false });
    if (uploadError) throw new Error(uploadError.message);
  }

  await admin.from("boards").update({ email_logo_path: nextPath }).eq("id", boardId);
  if (board.email_logo_path && board.email_logo_path !== nextPath) {
    await admin.storage.from(BOARD_LOGO_BUCKET).remove([board.email_logo_path]);
  }
  return nextPath;
}
