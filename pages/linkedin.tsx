import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RiLinkedinBoxLine, RiUserAddLine, RiUserFollowLine, RiMessage2Line,
  RiForbidLine, RiCheckboxCircleLine, RiCloseCircleLine, RiReplyLine, RiEyeLine, RiBarChart2Line,
} from "react-icons/ri";
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

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Kpi({ label, value, icon, color, sub }: { label: string; value: number; icon: React.ReactNode; color: string; sub?: string }) {
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
            <h1 className="text-xl font-semibold text-base-content flex items-center gap-2">
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

        {loading || !totals ? (
          <div className="flex items-center justify-center py-24"><span className="loading loading-spinner loading-sm text-base-content/40" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Kpi label="Profile visits" value={totals.visits} icon={<RiEyeLine size={16} />} color="#5aa2ff" />
              <Kpi label="Connections sent" value={totals.connections_sent} icon={<RiUserAddLine size={16} />} color="#5aa2ff" />
              <Kpi label="Accepted" value={totals.connections_accepted} icon={<RiUserFollowLine size={16} />} color="#32d583" sub={rates ? `${rates.acceptance_rate}% rate` : undefined} />
              <Kpi label="Messages / InMails" value={totals.messages_sent + totals.inmails_sent} icon={<RiMessage2Line size={16} />} color="#f4b740" />
              <Kpi label="Replies" value={totals.replies_received} icon={<RiReplyLine size={16} />} color="#a78bfa" sub={rates ? `${rates.reply_rate}% rate` : undefined} />
              <Kpi label="Opted out" value={totals.opted_out} icon={<RiForbidLine size={16} />} color="#f87171" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-4 flex items-center gap-1.5"><RiBarChart2Line size={12} /> Key rates</p>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <RateKpi label="Acceptance" value={rates?.acceptance_rate ?? 0} color="#32d583" />
                  <RateKpi label="Reply" value={rates?.reply_rate ?? 0} color="#5aa2ff" />
                  <RateKpi label="Msg after accept" value={rates?.connect_to_message_rate ?? 0} color="#f4b740" />
                </div>
                <RateBars data={rateBars} height={140} />
              </div>
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-4">Outreach funnel</p>
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
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2">Activity mix</p>
                <DonutChart data={compositionData} height={240} />
              </div>
            </div>

            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Activity over time ({days}d)</p>
              <ActivityAreaChart data={daily} series={SERIES} height={260} />
              <div className="mt-5 pt-4 border-t border-base-300/30">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Campaign comparison</p>
                <GroupedBarChart data={campaignBars} bars={[
                  { key: "sent", color: "#5aa2ff", label: "Connects" },
                  { key: "accepted", color: "#32d583", label: "Accepted" },
                  { key: "messages", color: "#f4b740", label: "Messages" },
                  { key: "replies", color: "#a78bfa", label: "Replies" },
                ]} height={280} />
              </div>
              <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Send time distribution (hour of day)</p>
                <HourBarChart data={hourSeries} height={280} />
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
              <div className="flex items-center gap-1 mb-4 bg-base-300/50 rounded-lg p-0.5 w-fit">
                <button onClick={() => setTab("activity")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "activity" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}>Recent activity</button>
                <button onClick={() => setTab("optedout")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${tab === "optedout" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}>
                  Opted out <span className="text-error">({optedOut.length})</span>
                </button>
              </div>
              {tab === "activity" ? (
                activity.length === 0 ? <p className="text-sm text-base-content/40">No LinkedIn activity yet.</p> : (
                  <ul className="space-y-2">
                    {activity.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-base-300/30 last:border-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-info" />
                        <span className="flex-1 min-w-0 truncate">
                          {a.message}
                          {a.full_name ? <span className="text-base-content/40"> — {a.full_name}</span> : null}
                          {a.company ? <span className="text-base-content/30"> at {a.company}</span> : null}
                          {a.workflow_name ? <span className="text-base-content/30"> ({a.workflow_name})</span> : null}
                        </span>
                        <span className="text-base-content/30 text-xs shrink-0">{fmt(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : optedOut.length === 0 ? (
                <p className="text-sm text-base-content/40">Nobody has opted out yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                      <th className="pb-2 font-medium">Person</th>
                      <th className="pb-2 font-medium">Signal</th>
                      <th className="pb-2 font-medium">Marked</th>
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
                        <td className="py-2 text-base-content/40">{fmt(o.li_intent_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </>
  );
}
