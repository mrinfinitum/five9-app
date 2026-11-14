"use client";

import { BarChart3, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type SwitcherSite = { slug: string; name: string; hasGa4: boolean; hasSearch: boolean };

/** The client list: a searchable sidebar on wide screens, a dropdown on phones. */
export function SiteSwitcher({ sites, selected, range }: { sites: SwitcherSite[]; selected: string; range: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const href = (slug: string) => `/web?client=${encodeURIComponent(slug)}&range=${range}`;
  const shown = sites.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <label className="block lg:hidden">
        <span className="label">Client</span>
        <select className="field" onChange={(e) => router.push(href(e.target.value))} value={selected}>
          {sites.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
      </label>

      <nav aria-label="Clients" className="card hidden p-2 lg:block">
        {sites.length > 6 ? (
          <label className="relative mb-2 block">
            <span className="sr-only">Find a client</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input className="field py-1.5 pl-8 text-sm" onChange={(e) => setQuery(e.target.value)} placeholder="Find a client" value={query} />
          </label>
        ) : null}
        <ul className="space-y-0.5">
          {shown.map((s) => {
            const active = s.slug === selected;
            return (
              <li key={s.slug}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm ${
                    active ? "bg-brand/15 font-semibold text-white" : "text-neutral-300 hover:bg-panel-2 hover:text-white"
                  }`}
                  href={href(s.slug)}
                >
                  <BarChart3 aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-brand" : "text-muted"}`} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="flex gap-1 text-[0.6rem] font-bold uppercase text-muted">
                    {s.hasGa4 ? <span title="Google Analytics linked">GA</span> : null}
                    {s.hasSearch ? <span title="Search Console linked">SC</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
          {!shown.length ? <li className="px-2.5 py-2 text-sm text-muted">No matches.</li> : null}
        </ul>
      </nav>
    </>
  );
}
