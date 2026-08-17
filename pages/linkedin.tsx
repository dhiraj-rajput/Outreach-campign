import Head from "next/head";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  RiLinkedinBoxLine, RiUserAddLine, RiUserFollowLine, RiMessage2Line,
  RiForbidLine, RiCheckboxCircleLine, RiCloseCircleLine, RiReplyLine, RiEyeLine, RiBarChart2Line,
  RiSearchLine, RiLoader4Line, RiExternalLinkLine, RiAddLine, RiEditBoxLine,
  RiDeleteBinLine, RiEarthLine, RiGroupLine, RiRefreshLine,
} from "react-icons/ri";
import PostComposer from "@/components/linkedin/PostComposer";
import {
  ActivityAreaChart, GroupedBarChart, RateBars, DonutChart, FunnelBars, HourBarChart, RateKpi, DailyBreakdownTable,
} from "@/components/analytics/Charts";

interface Totals {
  connections_sent: number; connections_accepted: number; messages_sent: number;
  inmails_sent: number; replies_received: number; opted_out: number; visits: number;
}
interface Rates { acceptance_rate: number; reply_rate: number; connect_to_message_rate: number; }
interface Funnel {
  visits: number; connections_sent: number; connections_accepted: number;
  messages_sent: number; replies: number;
}
interface CampaignRow {
  workflow_id: string; workflow_name: string; run_count: number;
  connections_sent: number; connections_accepted: number; messages_sent: number;
  inmails_sent: number; replies: number; last_activity_at: string | null;
}
interface CampaignBar {
  name: string; workflow_id: string; sent: number; accepted: number;
  messages: number; replies: number; accept_rate: number;
}
interface DailyRow {
  day: string; visits: number; connections: number; messages: number; inmails: number; accepts: number;
}
interface ActivityRow {
  id: string; message: string; created_at: string; target_id: string | null;
  full_name: string | null; company: string | null; workflow_name: string | null;
}
interface OptedOutRow {
  id: string; full_name: string | null; company: string | null;
  email: string | null; li_intent: string; li_intent_at: string | null;
}

interface PeopleHit {
  linkedinUrl: string;
  vanityName: string | null;
  fullName: string | null;
  headline: string | null;
  location: string | null;
  degree: number | null;
  profileImageUrl: string | null;
}
interface AccountOpt { id: string; name: string; email: string; is_authenticated: number }
interface ListOpt { id: string; name: string }

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Kpi({ label, value, icon, color, sub }: { label: string; value: number; icon: ReactNode; color: string; sub?: string }) {
  return (
    <div className="bg-base-200 border border-base-300/50 rounded-xl p-4 flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular-nums">{value.toLocaleString()}</p>
        <p className="text-[11px] text-base-content/40 mt-1 truncate">{label}</p>
        {sub && <p className="text-[10px] mt-0.5" style={{ color }}>{sub}</p>}
      </div>
    </div>
  );
}

const DAY_OPTIONS = [7, 14, 30, 90];
const SERIES = [
  { key: "visits", color: "#5aa2ff", label: "Visits" },
  { key: "connections", color: "#32d583", label: "Connects" },
  { key: "accepts", color: "#a78bfa", label: "Accepts" },
  { key: "messages", color: "#f4b740", label: "Messages" },
  { key: "inmails", color: "#e879f9", label: "InMails" },
];

export default function LinkedInHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignBars, setCampaignBars] = useState<CampaignBar[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [hourSeries, setHourSeries] = useState<{ hour: number; label: string; count: number }[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [optedOut, setOptedOut] = useState<OptedOutRow[]>([]);
  const [tab, setTab] = useState<"activity" | "optedout">("activity");
  const [intentBreakdown, setIntentBreakdown] = useState<{ intent: string; count: number }[]>([]);
  const [pipeline, setPipeline] = useState<Record<string, number> | null>(null);
  const [topCompanies, setTopCompanies] = useState<{ company: string; accepted: number }[]>([]);

  // ── People search (keyword → LinkedIn people results → list) ──────────────
  const [searchQ, setSearchQ] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<PeopleHit[]>([]);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searchMeta, setSearchMeta] = useState<{ source?: string; warnings?: string[]; searchUrl?: string; durationMs?: number } | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [lists, setLists] = useState<ListOpt[]>([]);
  const [listId, setListId] = useState<string>("");
  const [importing, setImporting] = useState(false);

  // ── Scheduled / drafted posts ─────────────────────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false);
  const [posts, setPosts] = useState<Array<{
    id: string; account_id: string; account_name?: string; content: string | null;
    visibility: string; post_type: string; status: string; scheduled_at: string | null;
    posted_at: string | null; error_message: string | null; created_at: string;
    media?: unknown[]; poll?: { question: string } | null;
  }>>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postFilter, setPostFilter] = useState("");

  const loadPosts = () => {
    setPostsLoading(true);
    const qs = postFilter ? `?status=${encodeURIComponent(postFilter)}` : "";
    fetch(`/api/linkedin/posts${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPosts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  };


  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadPosts(); }, [postFilter]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/linkedin/history?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setTotals(d.totals); setRates(d.rates); setFunnel(d.funnel);
        setCampaigns(d.campaigns ?? []); setCampaignBars(d.campaignBars ?? []);
        setDaily(d.daily ?? []); setHourSeries(d.hourSeries ?? []);
        setActivity(d.activity ?? []); setOptedOut(d.optedOut ?? []);
        setIntentBreakdown(d.intentBreakdown ?? []); setPipeline(d.pipeline ?? null); setTopCompanies(d.topCompanies ?? []);
      })
      .catch(() => toast.error("Failed to load LinkedIn history"))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: AccountOpt[]) => {
        const authed = (rows || []).filter((a) => a.is_authenticated);
        setAccounts(authed.length ? authed : rows || []);
        if (!accountId && (authed[0] || rows?.[0])) setAccountId((authed[0] || rows[0]).id);
      })
      .catch(() => {});
    fetch("/api/lists")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: ListOpt[] | { lists: ListOpt[] }) => {
        const list = Array.isArray(rows) ? rows : (rows as { lists: ListOpt[] }).lists || [];
        setLists(list);
        if (!listId && list[0]) setListId(list[0].id);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPeopleSearch(page = 1) {
    const q = searchQ.trim();
    if (q.length < 2) { toast.error("Enter at least 2 characters"); return; }
    if (!accountId) { toast.error("Select an authenticated LinkedIn account"); return; }
    setSearching(true);
    setSearchPage(page);
    setSelectedUrls(new Set());
    try {
      const res = await fetch("/api/linkedin/people-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: q, account_id: accountId, page, limit: 25 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setSearchHits(data.hits || []);
      setSearchTotal(data.totalEstimated ?? null);
      setSearchMeta({
        source: data.source,
        warnings: data.warnings,
        searchUrl: data.searchUrl,
        durationMs: data.durationMs,
      });
      if ((data.hits || []).length === 0) toast.message("No people found for that query");
      else toast.success(`Found ${data.hits.length} people`);
      (data.warnings || []).forEach((w: string) => toast.message(w));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
      setSearchHits([]);
      setSearchMeta(null);
    } finally {
      setSearching(false);
    }
  }

  function toggleUrl(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }

  function toggleAll() {
    if (selectedUrls.size === searchHits.length) setSelectedUrls(new Set());
    else setSelectedUrls(new Set(searchHits.map((h) => h.linkedinUrl)));
  }

  async function importSelected() {
    if (!listId) { toast.error("Select a list"); return; }
    if (selectedUrls.size === 0) { toast.error("Select at least one person"); return; }
    setImporting(true);
    try {
      const people = searchHits.filter((h) => selectedUrls.has(h.linkedinUrl));
      const res = await fetch("/api/linkedin/import-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list_id: listId,
          people: people.map((h) => ({
            linkedinUrl: h.linkedinUrl,
            fullName: h.fullName,
            headline: h.headline,
            location: h.location,
            degree: h.degree,
            profileImageUrl: h.profileImageUrl,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      toast.success(
        [
          data.created ? `${data.created} new` : null,
          data.updated ? `${data.updated} existing` : null,
          data.linked ? `${data.linked} added to list` : null,
          data.already_on_list ? `${data.already_on_list} already on list` : null,
          data.deduped_in_batch ? `${data.deduped_in_batch} dupes in selection skipped` : null,
        ].filter(Boolean).join(" · ") || "Done"
      );
      setSelectedUrls(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }


  const compositionData = totals
    ? [
        { name: "Connects sent", value: totals.connections_sent, color: "#5aa2ff" },
        { name: "Accepted", value: totals.connections_accepted, color: "#32d583" },
        { name: "Messages", value: totals.messages_sent, color: "#f4b740" },
        { name: "InMails", value: totals.inmails_sent, color: "#e879f9" },
        { name: "Replies", value: totals.replies_received, color: "#a78bfa" },
        { name: "Opted out", value: totals.opted_out, color: "#f87171" },
      ].filter((d) => d.value > 0)
    : [];

  const rateBars = rates
    ? [
        { name: "Accept rate", rate: rates.acceptance_rate, color: "#32d583" },
        { name: "Reply rate", rate: rates.reply_rate, color: "#5aa2ff" },
        { name: "Msg after accept", rate: rates.connect_to_message_rate, color: "#f4b740" },
      ]
    : [];

  return (
    <>
      <Head><title>LinkedIn — Linki</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-base-content flex items-center gap-2">
              <RiLinkedinBoxLine className="text-base-content/40" /> LinkedIn Analytics
            </h1>
            <p className="text-sm text-base-content/40 mt-0.5">Funnel, acceptance rates, activity trends, and campaign performance.</p>
          </div>
          <div className="flex items-center gap-0.5 bg-base-300/50 rounded-lg p-0.5">
            {DAY_OPTIONS.map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${days === d ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/35 hover:text-base-content/60"}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* ── Create & schedule posts ──────────────────────────────────────── */}
        <div className="bg-base-200 border border-base-300/50 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-300/40">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-base-content flex items-center gap-2">
                <RiEditBoxLine className="text-base-content/40" /> Posts
              </h2>
              <p className="text-xs text-base-content/40 mt-0.5 truncate">
                Compose and schedule on your connected account
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={loadPosts} title="Refresh">
                <RiRefreshLine />
              </button>
              <button type="button" className="btn btn-primary btn-sm gap-1 rounded-full px-3" onClick={() => setComposerOpen(true)}>
                <RiAddLine /> Create post
              </button>
            </div>
          </div>
          <div className="px-4 pt-2.5 flex flex-wrap gap-1">
            {["", "scheduled", "posted", "draft", "failed"].map((s) => (
              <button
                key={s || "all"}
                type="button"
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  postFilter === s
                    ? "bg-primary text-primary-content"
                    : "bg-base-300/40 text-base-content/50 hover:text-base-content/80"
                }`}
                onClick={() => setPostFilter(s)}
              >
                {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
              </button>
            ))}
          </div>
          <div className="p-3">
            {postsLoading ? (
              <div className="flex justify-center py-8">
                <RiLoader4Line className="animate-spin text-xl text-base-content/35" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-base-content/45 mb-3">No posts yet</p>
                <button type="button" className="btn btn-ghost btn-sm gap-1 text-primary" onClick={() => setComposerOpen(true)}>
                  <RiAddLine /> Create your first post
                </button>
              </div>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {posts.slice(0, 30).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-base-300/35 bg-base-100/40 hover:bg-base-100/70 px-3 py-2.5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${
                            p.status === "posted"
                              ? "bg-success/15 text-success"
                              : p.status === "scheduled" || p.status === "posting"
                                ? "bg-info/15 text-info"
                                : p.status === "failed"
                                  ? "bg-error/15 text-error"
                                  : "bg-base-300/50 text-base-content/50"
                          }`}
                        >
                          {p.status}
                        </span>
                        <span className="text-[10px] text-base-content/40 flex items-center gap-0.5">
                          {p.visibility === "anyone" ? <RiEarthLine /> : <RiGroupLine />}
                          {p.visibility === "anyone" ? "Anyone" : "Connections"}
                        </span>
                        {p.account_name && (
                          <span className="text-[10px] text-base-content/35 truncate">{p.account_name}</span>
                        )}
                      </div>
                      <p className="text-[13px] leading-snug line-clamp-2 text-base-content/80">
                        {p.content || (p.poll ? `Poll: ${p.poll.question}` : "—")}
                      </p>
                      <p className="text-[10px] text-base-content/35 mt-1">
                        {p.scheduled_at ? `Scheduled ${fmt(p.scheduled_at)}` : ""}
                        {p.posted_at ? `${p.scheduled_at ? " · " : ""}Posted ${fmt(p.posted_at)}` : ""}
                        {p.error_message ? ` · ${p.error_message}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0 pt-0.5">
                      {p.status === "scheduled" && (
                        <button
                          type="button"
                          className="text-[11px] text-base-content/45 hover:text-base-content px-1.5 py-0.5 rounded hover:bg-base-300/50"
                          onClick={async () => {
                            if (!confirm("Cancel this scheduled post?")) return;
                            const r = await fetch(`/api/linkedin/posts/${p.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "cancelled" }),
                            });
                            if (r.ok) {
                              toast.success("Cancelled");
                              loadPosts();
                            } else toast.error("Failed to cancel");
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {["draft", "cancelled", "failed"].includes(p.status) && (
                        <button
                          type="button"
                          className="text-base-content/35 hover:text-error p-1 rounded hover:bg-error/10"
                          onClick={async () => {
                            if (!confirm("Delete this post?")) return;
                            const r = await fetch(`/api/linkedin/posts/${p.id}`, { method: "DELETE" });
                            if (r.ok || r.status === 204) {
                              toast.success("Deleted");
                              loadPosts();
                            } else toast.error("Failed to delete");
                          }}
                        >
                          <RiDeleteBinLine />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── LinkedIn people search ───────────────────────────────────────── */}
        <div className="bg-base-200 border border-base-300/50 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-base-content flex items-center gap-2">
                <RiSearchLine className="text-base-content/40" /> Find people
              </h2>
              <p className="text-xs text-base-content/40 mt-0.5">
                Search LinkedIn people results with your connected account (same session as campaigns). Keep volume low.
              </p>
            </div>
            {accounts.length > 0 ? (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="select select-sm bg-base-300 border-base-300/50 max-w-[220px]"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.is_authenticated ? "" : " (not auth)"}
                  </option>
                ))}
              </select>
            ) : (
              <Link href="/accounts" className="text-xs font-medium text-warning hover:underline flex items-center gap-1 bg-warning/10 px-2.5 py-1 rounded-md border border-warning/20">
                <span>⚠️ Connect LinkedIn account to search</span> →
              </Link>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); runPeopleSearch(1); }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <RiSearchLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder='Try "ceo in dubai" or "head of sales fintech"'
                className="input input-sm w-full pl-9 bg-base-100 text-base-content placeholder:text-base-content/50 border-base-300 focus:outline-none focus:border-primary"
                disabled={searching}
              />
            </div>
            <button type="submit" disabled={searching || !accountId} className="btn btn-sm btn-primary gap-1.5 min-w-[7rem]">
              {searching ? <><RiLoader4Line className="animate-spin" size={14} /> Searching…</> : <><RiSearchLine size={14} /> Search</>}
            </button>
          </form>

          {(searchHits.length > 0 || searchMeta) && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="text-xs text-base-content/45">
                  {searchTotal != null ? (
                    <>About {searchTotal.toLocaleString()} results</>
                  ) : (
                    <>{searchHits.length} result{searchHits.length === 1 ? "" : "s"} on this page</>
                  )}
                  <span className="text-base-content/30"> · page {searchPage}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn btn-xs btn-ghost" onClick={toggleAll}>
                    {selectedUrls.size === searchHits.length && searchHits.length > 0 ? "Clear selection" : "Select page"}
                  </button>
                  <select
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                    className="select select-xs bg-base-300 border-base-300/50 max-w-[160px]"
                  >
                    <option value="">Choose list…</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={importing || selectedUrls.size === 0 || !listId}
                    onClick={importSelected}
                    className="btn btn-xs btn-primary gap-1"
                  >
                    {importing ? <RiLoader4Line className="animate-spin" size={12} /> : <RiAddLine size={12} />}
                    Add {selectedUrls.size || ""} to list
                  </button>
                </div>
              </div>

          <div className="border border-base-300/40 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-base-200/80">
                    <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2">Person</th>
                      <th className="px-3 py-2 hidden sm:table-cell">Headline</th>
                      <th className="px-3 py-2 hidden sm:table-cell">Location</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchHits.map((h) => (
                      <tr key={h.linkedinUrl} className="border-t border-base-300/40 hover:bg-base-300/20">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs"
                            checked={selectedUrls.has(h.linkedinUrl)}
                            onChange={() => toggleUrl(h.linkedinUrl)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-base-content">{h.fullName || "—"}</div>
                          {h.degree != null && (
                            <span className="text-[10px] text-base-content/40">{h.degree}°</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-base-content/60 max-w-[14rem] truncate hidden sm:table-cell">{h.headline || "—"}</td>
                        <td className="px-3 py-2 text-base-content/50 whitespace-nowrap hidden sm:table-cell">{h.location || "—"}</td>
                        <td className="px-3 py-2">
                          <a href={h.linkedinUrl} target="_blank" rel="noreferrer" className="text-base-content/40 hover:text-primary">
                            <RiExternalLinkLine size={14} />
                          </a>
                        </td>
                      </tr>
                    ))}
                    {searchHits.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-base-content/40 text-sm">
                          No people on this page
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* LinkedIn-style page controls */}
              <div className="flex items-center justify-center gap-1 pt-1 pb-0.5">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost px-3"
                  disabled={searchPage <= 1 || searching}
                  onClick={() => runPeopleSearch(searchPage - 1)}
                >
                  Previous
                </button>
                {(() => {
                  const PAGE_SIZE = 10;
                  const estimatedPages = searchTotal != null
                    ? Math.max(1, Math.min(100, Math.ceil(searchTotal / PAGE_SIZE)))
                    : null;
                  // Window of page numbers around current (LinkedIn-like)
                  const hasNext = searchHits.length >= 8 || (estimatedPages != null && searchPage < estimatedPages);
                  const maxKnown = estimatedPages ?? (hasNext ? searchPage + 2 : searchPage);
                  const windowStart = Math.max(1, searchPage - 2);
                  const windowEnd = Math.min(maxKnown, Math.max(searchPage + 2, windowStart + 4));
                  const pages: number[] = [];
                  for (let i = windowStart; i <= windowEnd; i++) pages.push(i);
                  return (
                    <>
                      {windowStart > 1 && (
                        <>
                          <button
                            type="button"
                            className={`btn btn-sm ${searchPage === 1 ? "btn-primary" : "btn-ghost"} min-w-9`}
                            disabled={searching}
                            onClick={() => runPeopleSearch(1)}
                          >
                            1
                          </button>
                          {windowStart > 2 && <span className="px-1 text-base-content/30">…</span>}
                        </>
                      )}
                      {pages.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`btn btn-sm min-w-9 ${searchPage === n ? "btn-primary" : "btn-ghost"}`}
                          disabled={searching}
                          onClick={() => { if (n !== searchPage) runPeopleSearch(n); }}
                        >
                          {n}
                        </button>
                      ))}
                      {estimatedPages != null && windowEnd < estimatedPages && (
                        <>
                          {windowEnd < estimatedPages - 1 && <span className="px-1 text-base-content/30">…</span>}
                          <button
                            type="button"
                            className={`btn btn-sm ${searchPage === estimatedPages ? "btn-primary" : "btn-ghost"} min-w-9`}
                            disabled={searching}
                            onClick={() => runPeopleSearch(estimatedPages)}
                          >
                            {estimatedPages}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost px-3"
                        disabled={searching || !hasNext}
                        onClick={() => runPeopleSearch(searchPage + 1)}
                      >
                        Next
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>



        {loading || !totals ? (
          <div className="flex items-center justify-center py-24"><span className="loading loading-spinner loading-sm text-base-content/40" /></div>
        ) : (
          <>
            <div className="kpi-strip">
              <Kpi label="Profile visits" value={totals.visits} icon={<RiEyeLine size={16} />} color="#5aa2ff" />
              <Kpi label="Connections sent" value={totals.connections_sent} icon={<RiUserAddLine size={16} />} color="#5aa2ff" />
              <Kpi label="Accepted" value={totals.connections_accepted} icon={<RiUserFollowLine size={16} />} color="#32d583" sub={rates ? `${rates.acceptance_rate}% rate` : undefined} />
              <Kpi label="Messages / InMails" value={totals.messages_sent + totals.inmails_sent} icon={<RiMessage2Line size={16} />} color="#f4b740" />
              <Kpi label="Replies" value={totals.replies_received} icon={<RiReplyLine size={16} />} color="#a78bfa" sub={rates ? `${rates.reply_rate}% rate` : undefined} />
              <Kpi label="Opted out" value={totals.opted_out} icon={<RiForbidLine size={16} />} color="#f87171" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-3 sm:p-5 min-w-0 overflow-hidden">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3 sm:mb-4 flex items-center gap-1.5"><RiBarChart2Line size={12} /> Key rates</p>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <RateKpi label="Acceptance" value={rates?.acceptance_rate ?? 0} color="#32d583" />
                  <RateKpi label="Reply" value={rates?.reply_rate ?? 0} color="#5aa2ff" />
                  <RateKpi label="Msg after accept" value={rates?.connect_to_message_rate ?? 0} color="#f4b740" />
                </div>
                <div className="chart-box">
                  <RateBars data={rateBars} height={130} />
                </div>
              </div>
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-3 sm:p-5 min-w-0 overflow-hidden">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3 sm:mb-4">Outreach funnel</p>
                {funnel && (
                  <FunnelBars stages={[
                    { label: "Visits", value: funnel.visits, color: "#5aa2ff" },
                    { label: "Connects sent", value: funnel.connections_sent, color: "#60a5fa" },
                    { label: "Accepted", value: funnel.connections_accepted, color: "#32d583" },
                    { label: "Messages / InMails", value: funnel.messages_sent, color: "#f4b740" },
                    { label: "Replies", value: funnel.replies, color: "#a78bfa" },
                  ]} />
                )}
              </div>
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-3 sm:p-5 min-w-0 overflow-hidden">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2">Activity mix</p>
                <div className="chart-box">
                  <DonutChart data={compositionData} height={200} />
                </div>
              </div>
            </div>

            <div className="bg-base-200 border border-base-300/50 rounded-xl p-3 sm:p-5 min-w-0 overflow-hidden">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2 sm:mb-3">Activity over time ({days}d)</p>
              <div className="chart-box">
                <ActivityAreaChart data={daily} series={SERIES} height={200} />
              </div>
              <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-base-300/30 min-w-0">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2">Daily breakdown</p>
                <DailyBreakdownTable
                  data={daily}
                  columns={[
                    { key: "visits", label: "Visits", color: "#5aa2ff" },
                    { key: "connections", label: "Connects", color: "#60a5fa" },
                    { key: "accepts", label: "Accepted", color: "#32d583" },
                    { key: "messages", label: "Messages", color: "#f4b740" },
                    { key: "inmails", label: "InMails", color: "#e879f9" },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-3 sm:p-5 min-w-0 overflow-hidden">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2 sm:mb-3">Campaign comparison</p>
                <div className="chart-box">
                  <GroupedBarChart data={campaignBars} bars={[
                    { key: "sent", color: "#5aa2ff", label: "Connects" },
                    { key: "accepted", color: "#32d583", label: "Accepted" },
                    { key: "messages", color: "#f4b740", label: "Messages" },
                    { key: "replies", color: "#a78bfa", label: "Replies" },
                  ]} height={220} />
                </div>
              </div>
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-3 sm:p-5 min-w-0 overflow-hidden">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2 sm:mb-3">Send time distribution (hour of day)</p>
                <div className="chart-box">
                  <HourBarChart data={hourSeries} height={200} />
                </div>
              </div>
            </div>

            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Campaign performance detail</p>
              {campaigns.length === 0 ? (
                <p className="text-sm text-base-content/40">No LinkedIn campaign activity yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                        <th className="pb-2 font-medium">Campaign</th>
                        <th className="pb-2 font-medium">Connects</th>
                        <th className="pb-2 font-medium">Accepted</th>
                        <th className="pb-2 font-medium">Accept %</th>
                        <th className="pb-2 font-medium">Messages/InMails</th>
                        <th className="pb-2 font-medium">Replies</th>
                        <th className="pb-2 font-medium">Last activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => {
                        const acceptRate = c.connections_sent ? Math.round((c.connections_accepted / c.connections_sent) * 100) : 0;
                        return (
                          <tr key={c.workflow_id} className="border-t border-base-300/40">
                            <td className="py-2"><Link href={`/workflows/${c.workflow_id}`} className="hover:text-primary transition-colors font-medium">{c.workflow_name}</Link></td>
                            <td className="py-2 tabular-nums">{c.connections_sent}</td>
                            <td className="py-2 text-success tabular-nums">{c.connections_accepted}</td>
                            <td className="py-2"><span className={`tabular-nums ${acceptRate >= 30 ? "text-success" : acceptRate >= 15 ? "text-warning" : "text-base-content/50"}`}>{acceptRate}%</span></td>
                            <td className="py-2 tabular-nums">{c.messages_sent + c.inmails_sent}</td>
                            <td className="py-2 text-primary tabular-nums">{c.replies}</td>
                            <td className="py-2 text-base-content/40">{fmt(c.last_activity_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <div className="tab-nav mb-4">
                <button onClick={() => setTab("activity")} className={`tab-btn${tab === "activity" ? " active" : ""}`}>Recent activity</button>
                <button onClick={() => setTab("optedout")} className={`tab-btn flex items-center gap-1.5${tab === "optedout" ? " active" : ""}`}>
                  Opted out <span className="text-error">({optedOut.length})</span>
                </button>
              </div>
              {tab === "activity" ? (
                activity.length === 0 ? <p className="text-sm text-base-content/40">No LinkedIn activity yet.</p> : (
                  <ul className="space-y-2">
                    {activity.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 text-sm py-2 border-b border-base-300/30 last:border-0 min-h-[48px]">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-info mt-1.5" />
                        <span className="flex-1 min-w-0 break-words">
                          {a.message}
                          {a.full_name ? <span className="text-base-content/40"> — {a.full_name}</span> : null}
                          {a.company ? <span className="text-base-content/30"> at {a.company}</span> : null}
                          {a.workflow_name ? <span className="text-base-content/30"> ({a.workflow_name})</span> : null}
                        </span>
                        <span className="text-base-content/30 text-xs shrink-0 mt-0.5">{fmt(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                        <th className="pb-2 font-medium">Person</th>
                        <th className="pb-2 font-medium">Signal</th>
                        <th className="pb-2 font-medium hidden sm:table-cell">Marked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optedOut.map((o) => (
                        <tr key={o.id} className="border-t border-base-300/40">
                          <td className="py-2">
                            <Link href={`/contacts/${o.id}`} className="hover:text-primary transition-colors font-medium">{o.full_name ?? "—"}</Link>
                            {o.company && <span className="text-base-content/40"> · {o.company}</span>}
                          </td>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-error/10 text-error">
                              <RiCloseCircleLine size={11} /> not interested
                            </span>
                          </td>
                          <td className="py-2 text-base-content/40 hidden sm:table-cell">{fmt(o.li_intent_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-base-content/30 mt-4 flex items-center gap-1.5">
                <RiCheckboxCircleLine size={12} /> Contacts marked opted-out here should be excluded when building new LinkedIn campaign lists.
              </p>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-base-200 border border-base-300/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Outreach pipeline</h3>
            {pipeline ? (
              <ul className="space-y-2.5">
                {[
                  { k: "not_contacted", label: "Not contacted", c: "#94a3b8" },
                  { k: "pending", label: "Pending accept", c: "#f4b740" },
                  { k: "connected_unmessaged", label: "Connected · no message", c: "#5aa2ff" },
                  { k: "messaged_no_reply", label: "Messaged · awaiting reply", c: "#a78bfa" },
                  { k: "replied", label: "Replied", c: "#32d583" },
                  { k: "inmailed", label: "InMailed", c: "#e879f9" },
                ].map((row) => {
                  const v = Number(pipeline[row.k] ?? 0);
                  const max = Math.max(1, ...Object.values(pipeline).map(Number));
                  const pct = Math.max(2, (v / max) * 100);
                  return (
                    <li key={row.k}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-base-content/55">{row.label}</span>
                        <span className="tabular-nums font-medium">{v.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-base-300/40 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: row.c }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-base-content/40">No pipeline data yet</p>}
          </div>
          <div className="bg-base-200 border border-base-300/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Reply intents</h3>
            {intentBreakdown.length === 0 ? (
              <p className="text-sm text-base-content/40">Classify LinkedIn replies from the Inbox to populate this.</p>
            ) : (
              <ul className="space-y-2">
                {intentBreakdown.map((row) => (
                  <li key={row.intent} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-base-content/60">{row.intent.replace(/_/g, " ")}</span>
                    <span className="tabular-nums font-medium">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-base-200 border border-base-300/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Top companies (accepted)</h3>
            {topCompanies.length === 0 ? (
              <p className="text-sm text-base-content/40">Acceptances will show here by company.</p>
            ) : (
              <ul className="space-y-2">
                {topCompanies.map((row) => (
                  <li key={row.company} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate text-base-content/60">{row.company}</span>
                    <span className="tabular-nums font-medium shrink-0">{row.accepted}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>

      <PostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        accounts={accounts}
        defaultAccountId={accountId || undefined}
        onCreated={loadPosts}
      />
    </>
  );
}
