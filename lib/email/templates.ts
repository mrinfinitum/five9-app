const BRAND_RED = "#e10600";

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;background:${BRAND_RED};color:#fff;font-weight:700;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a></p>`;
}

export function quote(text: string) {
  return `<blockquote style="margin:8px 0;padding:8px 14px;border-left:3px solid ${BRAND_RED};color:#222">${escapeHtml(text).replace(/\r?\n/g, "<br />")}</blockquote>`;
}

/** Wraps message content in a simple black-and-red Five9 Media layout. */
export function layout(content: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0a0a0a;padding:18px 24px;border-bottom:3px solid ${BRAND_RED}">
<span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.5px">FIVE<span style="color:${BRAND_RED}">9</span></span>
<span style="font-size:10px;font-weight:700;color:#999;letter-spacing:4px;margin-left:6px">MEDIA</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.5">${content}</td></tr>
<tr><td style="padding:14px 24px;background:#fafafa;color:#888;font-size:12px">Sent automatically by the Five9 Media request tracker.</td></tr>
</table></td></tr></table></body></html>`;
}
