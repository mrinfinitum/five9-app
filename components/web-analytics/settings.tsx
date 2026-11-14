"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { setWebSiteAction, setWebViewerAction, type WebResult } from "@/app/(app)/web/actions";
import type { WebSite } from "@/lib/google/access";
import type { Ga4Property, SearchSite } from "@/lib/google/reports";
import { Avatar } from "@/components/requests/ui";

type Listing<T> = { list: T[] } | { error: string } | null;
type PersonRow = { id: string; name: string; email: string; isAdmin: boolean; allowed: boolean };

export function WebSettings({
  serviceEmail,
  sites,
  ga4,
  search,
  people,
}: {
  serviceEmail: string | null;
  sites: WebSite[];
  ga4: Listing<Ga4Property>;
  search: Listing<SearchSite>;
  people: PersonRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<WebResult>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
    });

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <Connection email={serviceEmail} />

      <section className="card p-5">
        <h2 className="text-lg font-bold text-white">Client sites</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Pick each client&apos;s GA4 property and Search Console site. Only what the service account can see is listed; if a client is
          missing, add the service account to their property first (lists refresh every few minutes).
        </p>
        <Listings ga4={ga4} search={search} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-semibold">Board</th>
                <th className="px-3 py-2 font-semibold">GA4 property</th>
                <th className="py-2 pl-3 font-semibold">Search Console site</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr className="border-t border-line" key={site.boardId}>
                  <td className="py-2.5 pr-3 font-semibold text-white">{site.name}</td>
                  <td className="px-3 py-2.5">
                    <Picker
                      disabled={pending}
                      onChange={(value) => run(() => setWebSiteAction(site.boardId, { ga4PropertyId: value }))}
                      options={ga4 && "list" in ga4 ? ga4.list.map((p) => ({ value: p.id, label: `${p.name} (${p.id})`, group: p.account })) : null}
                      placeholder="Property ID, e.g. 123456789"
                      value={site.ga4PropertyId}
                    />
                  </td>
                  <td className="py-2.5 pl-3">
                    <Picker
                      disabled={pending}
                      onChange={(value) => run(() => setWebSiteAction(site.boardId, { searchConsoleSite: value }))}
                      options={search && "list" in search ? search.list.map((s) => ({ value: s.siteUrl, label: s.siteUrl })) : null}
                      placeholder="sc-domain:example.com"
                      value={site.searchConsoleSite}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold text-white">Who can see web analytics</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Off for everyone until you turn it on here, admins included. Admins can always open these settings.</p>
        <ul className="divide-y divide-line">
          {people.map((person) => (
            <li className="flex items-center gap-3 py-2.5" key={person.id}>
              <Avatar person={person} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">
                  {person.name} {person.isAdmin ? <span className="ml-1 text-xs font-normal text-muted">Admin</span> : null}
                </div>
                <div className="truncate text-xs text-muted">{person.email}</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  checked={person.allowed}
                  className="h-4 w-4 accent-[#e10600]"
                  disabled={pending}
                  onChange={(e) => run(() => setWebViewerAction(person.id, e.target.checked))}
                  type="checkbox"
                />
                <span className={person.allowed ? "text-white" : "text-muted"}>{person.allowed ? "Has access" : "No access"}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Connection({ email }: { email: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!email) {
    return (
      <section className="card border-amber-700/50 p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <TriangleAlert className="h-5 w-5 text-amber-400" /> Google isn&apos;t connected yet
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
          <li>In Google Cloud Console, create (or pick) a project.</li>
          <li>Enable the <strong>Google Analytics Data API</strong>, <strong>Google Analytics Admin API</strong>, and <strong>Google Search Console API</strong>.</li>
          <li>Under IAM &amp; Admin → Service accounts, create a service account (no roles needed), then Keys → Add key → JSON.</li>
          <li>
            In Vercel, add the environment variable <code className="rounded bg-panel-2 px-1">GOOGLE_SERVICE_ACCOUNT_JSON</code> with the file&apos;s
            contents (raw JSON or base64), then redeploy.
          </li>
        </ol>
      </section>
    );
  }
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold text-white">Google connection</h2>
      <p className="mt-1 text-sm text-muted">Add this email to each client, read-only:</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 break-all rounded-md bg-panel-2 px-3 py-2 text-sm text-white">{email}</code>
        <button
          className="btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(email).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          type="button"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-neutral-300">
        <li>
          <strong>GA4:</strong> Admin → Property access management → + → add the email with the <em>Viewer</em> role.
        </li>
        <li>
          <strong>Search Console:</strong> Settings → Users and permissions → Add user → the email, <em>Restricted</em> permission.
        </li>
      </ul>
    </section>
  );
}

function Listings({ ga4, search }: { ga4: Listing<Ga4Property>; search: Listing<SearchSite> }) {
  const problems = [ga4 && "error" in ga4 ? `GA4: ${ga4.error}` : null, search && "error" in search ? `Search Console: ${search.error}` : null].filter(Boolean);
  if (!problems.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-2 text-sm text-amber-100">
      {problems.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p className="mt-1 text-xs text-muted">You can still type IDs in by hand below.</p>
    </div>
  );
}

/** A dropdown of what Google lists, or a text box when the list isn't available. */
function Picker({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value: string | null;
  options: { value: string; label: string; group?: string }[] | null;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  if (!options) {
    return (
      <input
        className="field py-1.5 text-sm"
        defaultValue={value ?? ""}
        disabled={disabled}
        onBlur={(e) => {
          const next = e.target.value.trim() || null;
          if (next !== value) onChange(next);
        }}
        placeholder={placeholder}
      />
    );
  }
  const known = options.some((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <select className="field py-1.5 text-sm" disabled={disabled} onChange={(e) => onChange(e.target.value || null)} value={value ?? ""}>
      <option value="">— Not linked —</option>
      {value && !known ? <option value={value}>{value} (no access)</option> : null}
      {groups.map((group) =>
        group ? (
          <optgroup key={group} label={group}>
            {options
              .filter((o) => o.group === group)
              .map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
          </optgroup>
        ) : (
          options
            .filter((o) => !o.group)
            .map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))
        ),
      )}
    </select>
  );
}
