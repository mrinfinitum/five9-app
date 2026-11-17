"use client";

import { CircleAlert, ClipboardCopy, ExternalLink, EyeOff, Info, Loader2, Play, RotateCcw, ShieldAlert, TriangleAlert, Wand2, Check } from "lucide-react";
import { useState, useTransition } from "react";
import { fixPromptAction, requestFixAction, runScanAction, setFindingStatusAction } from "@/app/(app)/admin/security/actions";

export type FindingView = {
  id: string;
  target: string;
  check_key: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
  fix_hint: string;
  fixable: boolean;
  status: "open" | "fixing" | "fixed" | "ignored";
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
  fix_issue_url: string | null;
};

const SEVERITY = {
  critical: { label: "Critical", icon: ShieldAlert, className: "border-red-500/60 bg-red-500/10 text-red-300" },
  high: { label: "High", icon: CircleAlert, className: "border-orange-500/60 bg-orange-500/10 text-orange-300" },
  medium: { label: "Medium", icon: TriangleAlert, className: "border-amber-500/60 bg-amber-500/10 text-amber-200" },
  low: { label: "Low", icon: Info, className: "border-sky-500/50 bg-sky-500/10 text-sky-200" },
  info: { label: "Info", icon: Info, className: "border-line bg-panel-2 text-muted" },
} as const;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function RunScanButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const result = await runScanAction();
            setMessage(result.ok ? (result.message ?? "Done.") : result.error);
          })
        }
        type="button"
      >
        {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Play aria-hidden="true" className="h-4 w-4" />}
        {pending ? "Scanning… (up to a minute)" : "Run scan now"}
      </button>
      {message ? (
        <p className="max-w-xs text-xs text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function FindingList({ findings, automation }: { findings: FindingView[]; automation: boolean }) {
  return (
    <ul className="space-y-3">
      {findings.map((f) => (
        <FindingCard automation={automation} finding={f} key={f.id} />
      ))}
    </ul>
  );
}

function FindingCard({ finding: f, automation }: { finding: FindingView; automation: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sev = SEVERITY[f.severity];
  const Icon = sev.icon;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setPrompt(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: show the text to copy by hand.
      setPrompt(text);
    }
  }

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setMessage(null);
      await fn();
    });

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${sev.className}`}>
          <Icon aria-hidden="true" className="h-3.5 w-3.5" /> {sev.label}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">{f.title}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {f.target} · first seen {day(f.first_seen)} · last seen {day(f.last_seen)}
            {f.status === "fixed" && f.resolved_at ? ` · fixed ${day(f.resolved_at)}` : ""}
            {f.status === "ignored" ? " · ignored" : ""}
          </p>
          <p className="mt-2 text-sm text-neutral-300">{f.detail}</p>
          <p className="mt-1 text-sm text-neutral-400">
            <strong className="font-semibold text-neutral-200">How to fix:</strong> {f.fix_hint}
          </p>
          {f.status === "fixing" && f.fix_issue_url ? (
            <a className="mt-2 inline-flex items-center gap-1 text-sm text-brand hover:underline" href={f.fix_issue_url} rel="noopener noreferrer" target="_blank">
              Claude is fixing this: view the GitHub issue <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {f.status === "open" && f.fixable ? (
          <button
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await requestFixAction(f.id);
                if (!result.ok) return setMessage(result.error);
                if (result.prompt) {
                  await copy(result.prompt);
                  return setMessage("Copied a fix prompt. Paste it into Claude Code in this repo.");
                }
                setMessage(result.message ?? "Fix started.");
              })
            }
            type="button"
          >
            <Wand2 aria-hidden="true" className="h-3.5 w-3.5" /> {automation ? "Fix with Claude" : "Fix (copy prompt)"}
          </button>
        ) : null}
        {f.status !== "fixed" ? (
          <button
            className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await fixPromptAction(f.id);
                if (!result.ok) return setMessage(result.error);
                if (result.prompt) await copy(result.prompt);
              })
            }
            type="button"
          >
            {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <ClipboardCopy aria-hidden="true" className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy fix instructions"}
          </button>
        ) : null}
        {f.status === "open" || f.status === "fixing" ? (
          <>
            <button
              className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
              disabled={pending}
              onClick={() => run(async () => void (await setFindingStatusAction(f.id, "ignored")))}
              title="Hide it; it won't alert again. Use for accepted risks."
              type="button"
            >
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> Ignore
            </button>
          </>
        ) : (
          <button
            className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => run(async () => void (await setFindingStatusAction(f.id, "open")))}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Reopen
          </button>
        )}
        {pending ? <Loader2 aria-label="Working" className="h-4 w-4 animate-spin self-center text-muted" /> : null}
      </div>

      {message ? (
        <p className="mt-2 text-xs text-muted" role="status">
          {message}
        </p>
      ) : null}
      {prompt ? (
        <textarea aria-label="Fix instructions" className="field mt-2 h-40 font-mono text-xs" readOnly value={prompt} />
      ) : null}
    </li>
  );
}
