import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  RiMailSendLine, RiEyeLine, RiForbidLine, RiNewspaperLine, RiFlowChart,
  RiCheckboxCircleLine, RiCloseCircleLine, RiMailLine, RiRefreshLine,
  RiShieldCheckLine, RiAlertLine, RiCursorLine, RiReplyLine, RiBarChart2Line,
} from "react-icons/ri";
import {
  ActivityAreaChart, GroupedBarChart, RateBars, DonutChart, FunnelBars, HourBarChart, RateKpi, DailyBreakdownTable,
} from "@/components/analytics/Charts";

interface Totals {
  campaign_emails_sent: number; campaign_opens: number; campaign_clicks: number; campaign_replies: number;
  newsletter_emails_sent: number; newsletter_opens: number; newsletter_clicks: number; unsubscribed_count: number;
}
interface Rates {
  campaign_open_rate: number; campaign_click_rate: number; campaign_reply_rate: number;
  newsletter_open_rate: number; newsletter_click_rate: number; overall_open_rate: number;
}
interface Funnel { sent: number; opened: number; clicked: number; replied: number; unsubscribed: number; }
interface CampaignRow {
  workflow_id: string; workflow_name: string; run_count: number; emails_sent: number;
  opened: number; clicked: number; replied: number; last_activity_at: string | null;
}
interface CampaignBar {
  name: string; workflow_id: string; sent: number; opened: number; clicked: number;
  replied: number; open_rate: number; reply_rate: number;
}
interface EditionRow {
  id: string; title: string; subject: string; status: string; sent_at: string | null;
  newsletter_name: string; total_recipients: number; sent_count: number; failed_count: number;
  opened_count: number; clicked_count: number;
}
interface DailyRow {
  day: string; campaign_sent: number; campaign_opens: number; campaign_clicks: number;
  campaign_replies: number; newsletter_sent: number; newsletter_opens: number; newsletter_clicks: number;
}
interface ActivityRow {
  id: string; message?: string; created_at: string; full_name?: string | null; email?: string | null;
  company?: string | null; workflow_name?: string | null; newsletter_name?: string | null;
  edition_title?: string | null; target_id?: string; status?: string; source: "campaign" | "newsletter";
}
interface UnsubRow {
  id: string; email: string; reason: string; target_id: string | null;
  full_name: string | null; company: string | null; created_at: string;
}
interface DayData { day: string; sent: number; limit: number; }
interface AccountRow {
  id: string; name: string; from_email: string; daily_email_limit: number;
  ramp_up_enabled: number; ramp_start_date: string | null; effective_limit_today: number;
  sent_today: number; days: DayData[];
}
interface LogEntry { created_at: string; message: string; email_account_id: string; }
interface GuardEntry { created_at: string; message: string; email_account_id: string | null; }
interface HealthData {
  accounts: AccountRow[]; days: string[]; recentLogs: LogEntry[]; guardTrips: GuardEntry[];
}

const TZ = "Europe/Berlin";
const DAY_OPTIONS = [7, 14, 30, 90];
const SERIES = [
  { key: "campaign_sent", color: "#f4b740", label: "Campaign sent" },
  { key: "campaign_opens", color: "#38bdf8", label: "Opens" },
  { key: "campaign_clicks", color: "#32d583", label: "Clicks" },
  { key: "campaign_replies", color: "#a78bfa", label: "Replies" },
  { key: "newsletter_sent", color: "#e879f9", label: "Newsletter sent" },
];

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function formatDay(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: TZ });
}
function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });
}
function formatDateTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: TZ }) + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
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

type MainTab = "overview" | "health";

export default function EmailPage() {
  const router = useRouter();
  const highlight = (router.query.unsub as string) || null;
  const initialTab: MainTab = router.query.tab === "health" || router.query.tab === "email-health" ? "health" : "overview";
  const [mainTab, setMainTab] = useState<MainTab>(initialTab);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const q = { ...router.query };
    if (mainTab === "health") q.tab = "health"; else delete q.tab;
    router.replace({ pathname: "/email", query: q }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab]);

  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignBars, setCampaignBars] = useState<CampaignBar[]>([]);
  const [editions, setEditions] = useState<EditionRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [hourSeries, setHourSeries] = useState<{ hour: number; label: string; count: number }[]>([]);
  const [campaignActivity, setCampaignActivity] = useState<ActivityRow[]>([]);
  const [newsletterActivity, setNewsletterActivity] = useState<ActivityRow[]>([]);
  const [unsubscribed, setUnsubscribed] = useState<UnsubRow[]>([]);
  const [tab, setTab] = useState<"activity" | "unsubscribed">(highlight ? "unsubscribed" : "activity");
  const [replyKinds, setReplyKinds] = useState<{ kind: string; count: number }[]>([]);
  const [emailPipeline, setEmailPipeline] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/email/history?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setTotals(d.totals); setRates(d.rates); setFunnel(d.funnel);
        setCampaigns(d.campaigns ?? []); setCampaignBars(d.campaignBars ?? []);
        setEditions(d.newsletterEditions ?? []); setDaily(d.daily ?? []);
        setHourSeries(d.hourSeries ?? []);
        setCampaignActivity(d.campaignActivity ?? []); setNewsletterActivity(d.newsletterActivity ?? []);
        setUnsubscribed(d.unsubscribed ?? []);
        setReplyKinds(d.replyKinds ?? []); setEmailPipeline(d.pipeline ?? null);
      })
      .catch(() => toast.error("Failed to load email history"))
      .finally(() => setLoading(false));
  }, [days]);

  const activityFeed = [...campaignActivity, ...newsletterActivity]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40);

  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadHealth = useCallback(() => {
    setHealthLoading(true);
    fetch("/api/email-health")
      .then((r) => r.json())
      .then((d) => { setHealth(d); setLastRefresh(new Date()); })
      .finally(() => setHealthLoading(false));
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);
  useEffect(() => {
    const t = setInterval(loadHealth, 60_000);
    return () => clearInterval(t);
  }, [loadHealth]);

  const today = new Date().toISOString().slice(0, 10);
  const totalToday = health?.accounts.reduce((s, a) => s + a.sent_today, 0) ?? 0;
  const totalLimit = health?.accounts.reduce((s, a) => s + a.effective_limit_today, 0) ?? 0;
  const overLimit = health?.accounts.filter((a) => a.sent_today > a.effective_limit_today) ?? [];

  const compositionData = totals
    ? [
        { name: "Campaign sent", value: totals.campaign_emails_sent, color: "#f4b740" },
        { name: "Newsletter sent", value: totals.newsletter_emails_sent, color: "#e879f9" },
        { name: "Opens", value: totals.campaign_opens + totals.newsletter_opens, color: "#38bdf8" },
        { name: "Clicks", value: totals.campaign_clicks + totals.newsletter_clicks, color: "#32d583" },
        { name: "Replies", value: totals.campaign_replies, color: "#a78bfa" },
        { name: "Unsubscribed", value: totals.unsubscribed_count, color: "#f87171" },
      ].filter((d) => d.value > 0)
    : [];

  const rateBars = rates
    ? [
        { name: "Campaign open", rate: rates.campaign_open_rate, color: "#38bdf8" },
        { name: "Campaign click", rate: rates.campaign_click_rate, color: "#32d583" },
        { name: "Campaign reply", rate: rates.campaign_reply_rate, color: "#a78bfa" },
        { name: "NL open", rate: rates.newsletter_open_rate, color: "#e879f9" },
        { name: "NL click", rate: rates.newsletter_click_rate, color: "#f472b6" },
      ]
    : [];

  return (
    <>
      <Head><title>Email — Linki</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-base-content flex items-center gap-2">
              <RiMailSendLine className="text-base-content/40" /> Email Analytics
            </h1>
            <p className="text-sm text-base-content/40 mt-0.5">Campaign &amp; newsletter performance, rates, funnel, and account health.</p>
          </div>
          <div className="flex items-center gap-2">
            {mainTab === "overview" && (
              <div className="flex items-center gap-0.5 bg-base-300/50 rounded-lg p-0.5">
                {DAY_OPTIONS.map((d) => (
                  <button key={d} onClick={() => setDays(d)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${days === d ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/35 hover:text-base-content/60"}`}>
                    {d}d
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 bg-base-300/50 rounded-lg p-0.5">
              <button type="button" onClick={() => setMainTab("overview")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mainTab === "overview" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}>Overview</button>
              <button type="button" onClick={() => setMainTab("health")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mainTab === "health" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}>Health</button>
            </div>
          </div>
        </div>

        {mainTab === "overview" && (
          <>
            {loading || !totals ? (
              <div className="flex items-center justify-center py-24"><span className="loading loading-spinner loading-sm text-base-content/40" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Kpi label="Campaign sent" value={totals.campaign_emails_sent} icon={<RiFlowChart size={16} />} color="#f4b740" />
                  <Kpi label="Newsletter sent" value={totals.newsletter_emails_sent} icon={<RiNewspaperLine size={16} />} color="#e879f9" />
                  <Kpi label="Opens" value={totals.campaign_opens + totals.newsletter_opens} icon={<RiEyeLine size={16} />} color="#38bdf8" sub={rates ? `${rates.overall_open_rate}% rate` : undefined} />
                  <Kpi label="Clicks" value={totals.campaign_clicks + totals.newsletter_clicks} icon={<RiCursorLine size={16} />} color="#32d583" />
                  <Kpi label="Replies" value={totals.campaign_replies} icon={<RiReplyLine size={16} />} color="#a78bfa" sub={rates ? `${rates.campaign_reply_rate}% rate` : undefined} />
                  <Kpi label="Unsubscribed" value={totals.unsubscribed_count} icon={<RiForbidLine size={16} />} color="#f87171" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                    <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-4 flex items-center gap-1.5"><RiBarChart2Line size={12} /> Engagement rates</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <RateKpi label="Open" value={rates?.campaign_open_rate ?? 0} color="#38bdf8" />
                      <RateKpi label="Click" value={rates?.campaign_click_rate ?? 0} color="#32d583" />
                      <RateKpi label="Reply" value={rates?.campaign_reply_rate ?? 0} color="#a78bfa" />
                    </div>
                    <RateBars data={rateBars} height={160} />
                  </div>
                  <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                    <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-4">Email funnel</p>
                    {funnel && (
                      <FunnelBars stages={[
                        { label: "Sent", value: funnel.sent, color: "#f4b740" },
                        { label: "Opened", value: funnel.opened, color: "#38bdf8" },
                        { label: "Clicked", value: funnel.clicked, color: "#32d583" },
                        { label: "Replied", value: funnel.replied, color: "#a78bfa" },
                        { label: "Unsubscribed", value: funnel.unsubscribed, color: "#f87171" },
                      ]} />
                    )}
                  </div>
                  <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                    <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2">Volume mix</p>
                    <DonutChart data={compositionData} height={240} />
                  </div>
                </div>

                <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                  <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Email activity over time ({days}d)</p>
                  <ActivityAreaChart data={daily} series={SERIES} height={260} />
                  <div className="mt-5 pt-4 border-t border-base-300/30">
                    <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2">Daily breakdown</p>
                    <DailyBreakdownTable
                      data={daily}
                      columns={[
                        { key: "campaign_sent", label: "Campaign sent", color: "#f4b740" },
                        { key: "campaign_opens", label: "Opens", color: "#38bdf8" },
                        { key: "campaign_clicks", label: "Clicks", color: "#32d583" },
                        { key: "campaign_replies", label: "Replies", color: "#a78bfa" },
                        { key: "newsletter_sent", label: "Newsletter sent", color: "#e879f9" },
                        { key: "newsletter_opens", label: "NL opens", color: "#5aa2ff" },
                        { key: "newsletter_clicks", label: "NL clicks", color: "#fb923c" },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                    <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Campaign comparison</p>
                    <GroupedBarChart data={campaignBars} bars={[
                      { key: "sent", color: "#f4b740", label: "Sent" },
                      { key: "opened", color: "#38bdf8", label: "Opened" },
                      { key: "clicked", color: "#32d583", label: "Clicked" },
                      { key: "replied", color: "#a78bfa", label: "Replied" },
                    ]} height={280} />
                  </div>
                  <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                    <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Send time distribution (hour of day)</p>
                    <HourBarChart data={hourSeries} height={280} />
                  </div>
                </div>

                <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
                  <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Campaign email performance</p>
                  {campaigns.length === 0 ? (
                    <p className="text-sm text-base-content/40">No campaign emails sent yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                            <th className="pb-2 font-medium">Campaign</th>
                            <th className="pb-2 font-medium">Sent</th>
                            <th className="pb-2 font-medium">Opened</th>
                            <th className="pb-2 font-medium">Open %</th>
                            <th className="pb-2 font-medium">Clicked</th>
                            <th className="pb-2 font-medium">Replied</th>
                            <th className="pb-2 font-medium">Reply %</th>
                            <th className="pb-2 font-medium">Last activity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campaigns.map((c) => {
                            const openPct = c.emails_sent ? Math.round((c.opened / c.emails_sent) * 100) : 0;
                            const replyPct = c.emails_sent ? Math.round((c.replied / c.emails_sent) * 100) : 0;
                            return (
                              <tr key={c.workflow_id} className="border-t border-base-300/40">
                                <td className="py-2"><Link href={`/workflows/${c.workflow_id}`} className="hover:text-primary transition-colors font-medium">{c.workflow_name}</Link></td>
                                <td className="py-2 tabular-nums">{c.emails_sent}</td>
                                <td className="py-2 text-success tabular-nums">{c.opened}</td>
                                <td className="py-2 tabular-nums text-base-content/60">{openPct}%</td>
                                <td className="py-2 text-info tabular-nums">{c.clicked}</td>
                                <td className="py-2 text-primary tabular-nums">{c.replied}</td>
                                <td className="py-2 tabular-nums text-base-content/60">{replyPct}%</td>
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
                  <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Newsletter editions sent</p>
                  {editions.length === 0 ? (
                    <p className="text-sm text-base-content/40">No newsletter editions sent yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                            <th className="pb-2 font-medium">Edition</th>
                            <th className="pb-2 font-medium">Newsletter</th>
                            <th className="pb-2 font-medium">Sent</th>
                            <th className="pb-2 font-medium">Opened</th>
                            <th className="pb-2 font-medium">Open %</th>
                            <th className="pb-2 font-medium">Clicked</th>
                            <th className="pb-2 font-medium">Failed</th>
                            <th className="pb-2 font-medium">Sent at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editions.map((e) => {
                            const openPct = e.sent_count ? Math.round((e.opened_count / e.sent_count) * 100) : 0;
                            return (
                              <tr key={e.id} className="border-t border-base-300/40">
                                <td className="py-2 font-medium">{e.title}</td>
                                <td className="py-2 text-base-content/60">{e.newsletter_name}</td>
                                <td className="py-2 tabular-nums">{e.sent_count}/{e.total_recipients}</td>
                                <td className="py-2 text-success tabular-nums">{e.opened_count}</td>
                                <td className="py-2 tabular-nums text-base-content/60">{openPct}%</td>
                                <td className="py-2 text-info tabular-nums">{e.clicked_count}</td>
                                <td className="py-2 text-error tabular-nums">{e.failed_count || "—"}</td>
                                <td className="py-2 text-base-content/40">{fmt(e.sent_at)}</td>
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
                    <button onClick={() => setTab("unsubscribed")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${tab === "unsubscribed" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}>
                      Unsubscribed <span className="text-error">({unsubscribed.length})</span>
                    </button>
                  </div>
                  {tab === "activity" ? (
                    activityFeed.length === 0 ? <p className="text-sm text-base-content/40">No email activity yet.</p> : (
                      <ul className="space-y-2">
                        {activityFeed.map((a) => (
                          <li key={`${a.source}-${a.id}`} className="flex items-center gap-3 text-sm py-1.5 border-b border-base-300/30 last:border-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.source === "campaign" ? "bg-warning" : "bg-secondary"}`} />
                            <span className="flex-1 min-w-0 truncate">
                              {a.source === "campaign" ? (
                                <>Email sent to <span className="font-medium">{a.full_name ?? "contact"}</span>
                                  {a.company ? <span className="text-base-content/40"> at {a.company}</span> : null}
                                  {a.workflow_name ? <span className="text-base-content/40"> — {a.workflow_name}</span> : null}
                                </>
                              ) : (
                                <>&quot;{a.edition_title}&quot; sent to <span className="font-medium">{a.full_name ?? a.email}</span>
                                  <span className="text-base-content/40"> — {a.newsletter_name}</span>
                                  {a.status === "failed" && <span className="text-error ml-1">(failed)</span>}
                                </>
                              )}
                            </span>
                            <span className="text-base-content/30 text-xs shrink-0">{fmt(a.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : unsubscribed.length === 0 ? (
                    <p className="text-sm text-base-content/40">Nobody has unsubscribed yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                          <th className="pb-2 font-medium">Person</th>
                          <th className="pb-2 font-medium">Email</th>
                          <th className="pb-2 font-medium">Reason</th>
                          <th className="pb-2 font-medium">Unsubscribed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unsubscribed.map((u) => (
                          <tr key={u.id} className={`border-t border-base-300/40 ${highlight && u.target_id === highlight ? "bg-error/5" : ""}`}>
                            <td className="py-2">
                              {u.target_id ? (
                                <Link href={`/contacts/${u.target_id}`} className="hover:text-primary transition-colors font-medium">{u.full_name ?? "—"}</Link>
                              ) : (
                                <span className="text-base-content/50">{u.full_name ?? "—"}</span>
                              )}
                              {u.company && <span className="text-base-content/40"> · {u.company}</span>}
                            </td>
                            <td className="py-2 text-base-content/60">{u.email}</td>
                            <td className="py-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-error/10 text-error">
                                <RiCloseCircleLine size={11} /> {u.reason.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="py-2 text-base-content/40">{fmt(u.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className="text-[11px] text-base-content/30 mt-4 flex items-center gap-1.5">
                    <RiCheckboxCircleLine size={12} /> Unsubscribed contacts are automatically blocked from being re-added to campaigns or newsletters.
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {mainTab === "health" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-base-content">Email Health</h2>
                <p className="text-sm text-base-content/50 mt-0.5">Daily send volume per account vs ramp limits</p>
              </div>
              <div className="flex items-center gap-3">
                {lastRefresh && <span className="text-xs text-base-content/30">Updated {formatTime(lastRefresh.toISOString())}</span>}
                <button onClick={loadHealth} disabled={healthLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-base-300 text-base-content/70 hover:text-base-content border border-base-300/50 hover:bg-base-300/80 transition-colors">
                  <RiRefreshLine size={13} className={healthLoading ? "animate-spin" : ""} /> Refresh
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="px-4 py-3 rounded-xl bg-base-200 border border-base-300/50">
                <div className="text-xs text-base-content/40 mb-1">Sent today</div>
                <div className="text-2xl font-semibold text-base-content">{totalToday}</div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-base-200 border border-base-300/50">
                <div className="text-xs text-base-content/40 mb-1">Total limit today</div>
                <div className="text-2xl font-semibold text-base-content">{totalLimit}</div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-base-200 border border-base-300/50">
                <div className="text-xs text-base-content/40 mb-1">Accounts active</div>
                <div className="text-2xl font-semibold text-base-content">{health?.accounts.filter((a) => a.sent_today > 0).length ?? 0}</div>
              </div>
              {overLimit.length > 0 ? (
                <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/20">
                  <div className="flex items-center gap-1.5 text-xs text-error/70 mb-1"><RiAlertLine size={11} /> Over limit today</div>
                  <div className="text-2xl font-semibold text-error">{overLimit.length}</div>
                </div>
              ) : (
                <div className="px-4 py-3 rounded-xl bg-success/10 border border-success/20">
                  <div className="flex items-center gap-1.5 text-xs text-success/70 mb-1"><RiShieldCheckLine size={11} /> All within limits</div>
                  <div className="text-2xl font-semibold text-success">✓</div>
                </div>
              )}
            </div>

            <div className="bg-base-200 rounded-xl border border-base-300/50 overflow-hidden">
              <div className="px-5 py-3 border-b border-base-300/40 flex items-center gap-2">
                <RiMailLine size={14} className="text-base-content/40" />
                <span className="text-sm font-medium text-base-content">Accounts — last 7 days</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-300/30">
                      <th className="text-left px-5 py-2.5 text-xs font-medium text-base-content/40 whitespace-nowrap">Account</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-base-content/40 whitespace-nowrap">
                        Today<br /><span className="text-base-content/25 font-normal">{formatDay(today)}</span>
                      </th>
                      {health?.days.slice(0, -1).reverse().map((d) => (
                        <th key={d} className="text-right px-4 py-2.5 text-xs font-medium text-base-content/25 whitespace-nowrap">{formatDay(d)}</th>
                      ))}
                      <th className="text-right px-5 py-2.5 text-xs font-medium text-base-content/40 whitespace-nowrap">Limit today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health?.accounts.map((a) => {
                      const over = a.sent_today > a.effective_limit_today;
                      return (
                        <tr key={a.id} className="border-b border-base-300/20 hover:bg-base-300/20 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium text-base-content/90 text-xs">{a.name}</div>
                            <div className="text-base-content/40 text-xs mt-0.5">{a.from_email}</div>
                            {a.ramp_start_date && <div className="text-base-content/30 text-[10px] mt-0.5">Ramp from {a.ramp_start_date}</div>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-semibold ${over ? "text-error" : a.sent_today > 0 ? "text-base-content" : "text-base-content/30"}`}>{a.sent_today}</span>
                            {over && <span className="ml-1 text-error/60 text-xs">↑</span>}
                            <div className="mt-1 h-1 w-16 rounded-full bg-base-300 ml-auto">
                              <div className={`h-1 rounded-full ${over ? "bg-error" : "bg-info"}`}
                                style={{ width: `${Math.min(100, (a.sent_today / Math.max(a.effective_limit_today, 1)) * 100)}%` }} />
                            </div>
                          </td>
                          {a.days.slice(0, -1).reverse().map((d) => (
                            <td key={d.day} className="px-4 py-3 text-right">
                              <span className={`text-xs ${d.sent > d.limit ? "text-error" : d.sent > 0 ? "text-base-content/60" : "text-base-content/20"}`}>
                                {d.sent > 0 ? d.sent : "—"}
                              </span>
                            </td>
                          ))}
                          <td className="px-5 py-3 text-right text-xs text-base-content/50">
                            {a.effective_limit_today}
                            {a.ramp_up_enabled && a.ramp_start_date && a.effective_limit_today < a.daily_email_limit && (
                              <span className="ml-1 text-base-content/25">(ramp)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-base-300/40 bg-base-300/20">
                      <td className="px-5 py-2.5 text-xs font-medium text-base-content/50">Total</td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold text-base-content">{totalToday}</td>
                      {health?.days.slice(0, -1).reverse().map((d) => {
                        const sum = health.accounts.reduce((s, a) => s + (a.days.find((x) => x.day === d)?.sent ?? 0), 0);
                        return <td key={d} className="px-4 py-2.5 text-right text-xs text-base-content/50">{sum > 0 ? sum : "—"}</td>;
                      })}
                      <td className="px-5 py-2.5 text-right text-xs font-medium text-base-content/50">{totalLimit}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-base-200 rounded-xl border border-base-300/50 overflow-hidden">
                <div className="px-5 py-3 border-b border-base-300/40">
                  <span className="text-sm font-medium text-base-content">Recent sends</span>
                  <span className="ml-2 text-xs text-base-content/30">last 50</span>
                </div>
                <div className="divide-y divide-base-300/20 max-h-96 overflow-y-auto">
                  {health?.recentLogs.map((l, i) => {
                    const acc = health.accounts.find((a) => a.id === l.email_account_id);
                    return (
                      <div key={i} className="px-5 py-2.5 flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs text-base-content/80">{l.message.replace("Email sent to ", "")}</div>
                          <div className="text-[10px] text-base-content/30 mt-0.5">{acc?.name ?? l.email_account_id.slice(0, 8)}</div>
                        </div>
                        <div className="text-[10px] text-base-content/30 whitespace-nowrap shrink-0">{formatDateTime(l.created_at)}</div>
                      </div>
                    );
                  })}
                  {health?.recentLogs.length === 0 && (
                    <div className="px-5 py-6 text-xs text-base-content/30 text-center">No sends recorded</div>
                  )}
                </div>
              </div>
              <div className="bg-base-200 rounded-xl border border-base-300/50 overflow-hidden">
                <div className="px-5 py-3 border-b border-base-300/40">
                  <span className="text-sm font-medium text-base-content">Limit guard trips</span>
                  <span className="ml-2 text-xs text-base-content/30">today</span>
                </div>
                <div className="divide-y divide-base-300/20 max-h-96 overflow-y-auto">
                  {health?.guardTrips.map((g, i) => {
                    const acc = g.email_account_id ? health.accounts.find((a) => a.id === g.email_account_id) : null;
                    return (
                      <div key={i} className="px-5 py-2.5 flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs text-warning/80">{g.message.replace("Daily limit reached — ", "→ ")}</div>
                          {acc && <div className="text-[10px] text-base-content/30 mt-0.5">{acc.name}</div>}
                        </div>
                        <div className="text-[10px] text-base-content/30 whitespace-nowrap shrink-0">{formatDateTime(g.created_at)}</div>
                      </div>
                    );
                  })}
                  {health?.guardTrips.length === 0 && (
                    <div className="px-5 py-6 text-xs text-success/50 text-center">No guard trips today</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-base-200 border border-base-300/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Email engagement pipeline</h3>
            {emailPipeline ? (
              <ul className="space-y-2.5">
                {[
                  { k: "with_email", label: "Contacts with email", c: "#94a3b8" },
                  { k: "opened", label: "Opened", c: "#38bdf8" },
                  { k: "clicked", label: "Clicked", c: "#32d583" },
                  { k: "replied", label: "Replied", c: "#a78bfa" },
                  { k: "suppressed", label: "Suppressed / unsubscribed", c: "#f87171" },
                ].map((row) => {
                  const v = Number(emailPipeline[row.k] ?? 0);
                  const max = Math.max(1, Number(emailPipeline.with_email ?? 1));
                  const pct = Math.max(2, Math.min(100, (v / max) * 100));
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
            <h3 className="text-sm font-semibold mb-3">Reply classifier breakdown</h3>
            {replyKinds.length === 0 ? (
              <p className="text-sm text-base-content/40">Email replies classified in the Inbox will appear here.</p>
            ) : (
              <ul className="space-y-2">
                {replyKinds.map((row) => (
                  <li key={row.kind} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-base-content/60">{String(row.kind).replace(/_/g, " ")}</span>
                    <span className="tabular-nums font-medium">{row.count}</span>
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
