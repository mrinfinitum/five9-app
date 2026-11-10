import { Fragment } from "react";

// http(s) links and bare www. links. Nothing else (javascript:, data:, …) can become a link.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Drops sentence punctuation stuck to the end of a link, and a ")" that wasn't opened inside it. */
function trimUrl(raw: string) {
  let url = raw.replace(/[.,;:!?'"*_]+$/, "");
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1).replace(/[.,;:!?'"*_]+$/, "");
  }
  return url;
}

/** Plain text with any web addresses turned into links that open in a new tab. */
export function LinkifiedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index;
    const url = trimUrl(match[0]);
    if (!url) continue;
    if (start > last) parts.push(text.slice(last, start));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    parts.push(
      <a
        className="break-all font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200"
        href={href}
        key={start}
        rel="noopener noreferrer nofollow"
        target="_blank"
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
