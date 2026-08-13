import Head from "next/head";
import { useEffect, useState, useRef } from "react";
import {
  FiUserPlus, FiMessageSquare, FiEye, FiRepeat, FiUsers, FiRefreshCw,
  FiTarget, FiActivity, FiCheckSquare, FiAlertCircle, FiClock, FiInbox,
} from "react-icons/fi";
import { RiMailSendLine, RiReplyLine, RiRobot2Line, RiLinkedinBoxLine, RiFilterLine } from "react-icons/ri";
import { ActivityAreaChart, DailyBreakdownTable } from "@/components/analytics/Charts";

interface DashboardStats {
  totals: {
    total_targets: number;
    connections_requested: number;
    connected: number;
    messages_sent: number;
    inmails_sent: number;
    replies_received: number;
    active_runs: number;
    total_lists: number;
    total_workflows: number;
    emails_sent: number;
    email_replies: number;
  };
  today: {
    visits_today: number;
    connections_today: number;
    messages_today: number;
    inmails_today: number;
  };
  activity: { day: string; visits: number; connections: number; messages: number; inmails: number; emails: number }[];
  lists: { id: string; name: string }[];
  workflows: { id: string; name: string }[];
  crm?: { open_todos: number; overdue_todos: number; due_today: number; inbox_replies: number };
}

interface AgentStats {
  daily: { day: string; cost_usd: number; input_tokens: number; output_tokens: number }[];
}

interface AccountRow {
  id: string;
  is_authenticated: number;
  li_connections: number | null;
  li_pending: number | null;
  li_profile_views: number | null;
  li_stats_synced_at: string | null;
}

function Counter({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const from = useRef(0);

  useEffect(() => {
    from.current = display;
    start.current = 0;
    cancelAnimationFrame(raf.current);
    function step(ts: number) {
      if (!start.current) start.current = ts;
      const p = Math.min((ts - start.current) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from.current + (value - from.current) * ease));
      if (p < 1) raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]); // eslint-disable-line

  return <>{display.toLocaleString()}</>;
}

function SectionLabel({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="hq-section-title" style={{ color }}>
      <span className="flex items-center gap-1.5">
        {icon} {label}
      </span>
      <div className="hq-rule" />
    </div>
  );
}

function KpiCard({
  label, value, sub, color, icon, pulse,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="hq-kpi-card">
      <div className="flex items-start justify-between">
        <span className="hq-kpi-icon" style={{ background: `${color}17`, color }}>
          {icon}
        </span>
        {pulse && (
          <span className="w-1.5 h-1.5 rounded-full animate-pulse mt-1" style={{ background: color }} />
        )}
      </div>
      <div className="hq-kpi-value">
        <Counter value={value} />
      </div>
      <div className="hq-kpi-label">{label}</div>
      {sub && <div className="hq-kpi-sub" style={{ color }}>{sub}</div>}
    </div>
  );
}

function FunnelRow({
  icon, color, label, value, max,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
      <span
        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </span>
      <span className="text-xs text-base-content/50 w-20 sm:w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-base-300/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums text-base-content w-10 text-right">
        <Counter value={value} />
      </span>
    </div>
  );
}

function RateBar({
  label, value, sub, color,
}: {
  label: string;
  value: number;
  sub: string;
  color: string;
}) {
  return (
    <div className="hq-rate-block">
      <div className="hq-rate-row">
        <span className="hq-rate-row-label">{label}</span>
        <span className="hq-rate-row-value" style={{ color }}>{value}%</span>
      </div>
      <div className="hq-rate-track">
        <div
          className="hq-rate-fill"
          style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }}
        />
      </div>
      <p className="hq-rate-sub">{sub}</p>
    </div>
  );
}

interface ChannelStat {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}

function ChannelCard({
  title, icon, color, stats, rate, children,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  stats: ChannelStat[];
  rate?: { label: string; value: number; sub: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="hq-card p-4 sm:p-5">
      <div className="hq-channel-head">
        <div className="hq-channel-title">
          <span className="hq-channel-icon" style={{ background: `${color}17`, color }}>
            {icon}
          </span>
          <span className="hq-channel-name">{title}</span>
        </div>
      </div>
      <div className="hq-channel-stats">
        {stats.map((s) => (
          <div key={s.label} className="hq-mini-stat">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-base-content/40 mb-1.5">
              <span style={{ color: s.color }}>{s.icon}</span>
              {s.label}
            </span>
            <span className="hq-channel-stat-value">
              <Counter value={s.value} />
            </span>
          </div>
        ))}
      </div>
      {rate && <RateBar label={rate.label} value={rate.value} sub={rate.sub} color={color} />}
      {children}
    </div>
  );
}

function TaskStrip({ crm }: { crm: { open_todos: number; overdue_todos: number; due_today: number; inbox_replies: number } }) {
  const items = [
    { label: "Open todos", value: crm.open_todos, color: "var(--hq-primary)", icon: <FiCheckSquare size={12} />, href: "/todos" },
    { label: "Overdue", value: crm.overdue_todos, color: "#f87171", icon: <FiAlertCircle size={12} />, href: "/todos" },
    { label: "Due today", value: crm.due_today, color: "#f59e0b", icon: <FiClock size={12} />, href: "/todos" },
    { label: "Inbox replies", value: crm.inbox_replies, color: "var(--hq-primary)", icon: <FiInbox size={12} />, href: "/inbox" },
  ];
  return (
    <div className="hq-task-grid">
      {items.map((it) => (
        <a key={it.label} href={it.href} className="hq-mini-stat flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-base-content/40">
            <span style={{ color: it.color }}>{it.icon}</span>
            {it.label}
          </span>
          <span className="text-xl font-bold tabular-nums" style={{ color: it.color }}>
            <Counter value={it.value} />
          </span>
        </a>
      ))}
    </div>
  );
}

const SERIES = [
  { key: "visits", color: "#60a5fa", label: "Visits" },
  { key: "connections", color: "#22c55e", label: "Connects" },
  { key: "messages", color: "#f59e0b", label: "Messages" },
  { key: "inmails", color: "#e879f9", label: "InMails" },
  { key: "emails", color: "#fb923c", label: "Emails" },
];

const DAY_OPTIONS = [7, 14, 30, 90];

function ActivityChart({
  data, days, onDaysChange,
}: {
  data: DashboardStats["activity"];
  days: number;
  onDaysChange: (d: number) => void;
}) {
  return (
    <div className="hq-card p-4 sm:p-5 flex flex-col" style={{ minHeight: 260 }} data-tour="dashboard-chart">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="text-sm font-semibold text-base-content">Activity over time</span>
        <div className="hq-pill-group">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={`hq-pill-btn ${days === d ? "active" : ""}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <ActivityAreaChart data={data} series={SERIES} height={200} />
      <div className="mt-4 pt-4 border-t border-base-300/30">
        <p className="text-[11px] font-medium text-base-content/35 uppercase tracking-wider mb-2">Daily breakdown</p>
        <div className="table-wrap border-0">
          <DailyBreakdownTable
            data={data}
            columns={[
              { key: "visits", label: "Visits", color: "#60a5fa" },
              { key: "connections", label: "Connects", color: "#22c55e" },
              { key: "messages", label: "Messages", color: "#f59e0b" },
              { key: "inmails", label: "InMails", color: "#c084fc" },
              { key: "emails", label: "Emails", color: "#fb923c" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

interface LiStats { connections: number; pending: number; profile_views: number }

function LinkedInCard({
  accountId, cachedStats, cachedSyncedAt,
}: {
  accountId?: string;
  cachedStats?: LiStats | null;
  cachedSyncedAt?: string | null;
}) {
  const [syncing, setSyncing] = useState(false);
  const [liStats, setLiStats] = useState<LiStats | null>(cachedStats ?? null);
  const [syncedAt, setSyncedAt] = useState<string | null>(cachedSyncedAt ?? null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync() {
    if (!accountId) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/li-stats`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setLiStats(data);
      setSyncedAt(new Date().toISOString());
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const items = [
    { label: "Connections", value: liStats?.connections ?? null, color: "#22c55e" },
    { label: "Pending", value: liStats?.pending ?? null, color: "#f59e0b" },
    { label: "Profile views", value: liStats?.profile_views ?? null, color: "#60a5fa" },
  ];

  return (
    <div className="hq-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RiLinkedinBoxLine size={14} className="text-primary" />
          <span className="text-xs font-semibold text-base-content/55 uppercase tracking-wider">LinkedIn account</span>
        </div>
        <div className="flex items-center gap-2">
          {syncedAt && (
            <span className="text-[10px] text-base-content/25 hidden sm:inline">
              {new Date(syncedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {accountId && (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="hq-btn hq-btn-light !py-1 !px-2.5 text-xs disabled:opacity-40"
            >
              <FiRefreshCw size={10} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync"}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((s) => (
          <div key={s.label} className="hq-mini-stat flex flex-col gap-1 !p-2.5 sm:!p-3">
            {s.value !== null ? (
              <span className="text-lg sm:text-xl font-semibold tabular-nums" style={{ color: s.color }}>
                <Counter value={s.value} />
              </span>
            ) : (
              <span className="text-lg sm:text-xl font-semibold text-base-content/15">—</span>
            )}
            <span className="text-[10px] text-base-content/35">{s.label}</span>
          </div>
        ))}
      </div>
      {syncError && <p className="text-xs text-error mt-2">{syncError}</p>}
      {!accountId && <p className="text-xs text-base-content/30 mt-2">No LinkedIn account connected yet.</p>}
    </div>
  );
}

function AiUsagePanel({ data, days }: { data: AgentStats["daily"]; days: number }) {
  const totalCost = data.reduce((s, d) => s + (d.cost_usd ?? 0), 0);
  const totalTokens = data.reduce((s, d) => s + (d.input_tokens ?? 0) + (d.output_tokens ?? 0), 0);
  const hasData = totalCost > 0 || totalTokens > 0;
  const maxCost = Math.max(...data.map((d) => d.cost_usd ?? 0), 0.000001);
  const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 5 : 15;

  return (
    <div className="hq-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RiRobot2Line size={14} className="text-primary" />
          <span className="text-xs font-semibold text-base-content/55 uppercase tracking-wider">AI usage</span>
        </div>
        {hasData && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-base-content/35 tabular-nums">{totalTokens.toLocaleString()} tokens</span>
            <span className="font-semibold tabular-nums text-secondary">${totalCost.toFixed(4)}</span>
          </div>
        )}
      </div>
      {!hasData ? (
        <p className="text-xs text-base-content/30 py-2">No AI usage in this period.</p>
      ) : (
        <div className="flex items-end gap-0.5" style={{ height: 52 }}>
          {data.map((d, i) => {
            const showLabel = i % labelEvery === 0;
            const height = Math.max(2, ((d.cost_usd ?? 0) / maxCost) * 44);
            return (
              <div key={d.day} className="flex flex-col items-center flex-1 group relative justify-end" style={{ height: "100%" }}>
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-base-300 border border-base-300 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow-xl">
                  <div className="text-base-content/40 mb-1">{d.day}</div>
                  <div className="text-secondary">${(d.cost_usd ?? 0).toFixed(5)}</div>
                  <div className="text-base-content/40">{((d.input_tokens ?? 0) + (d.output_tokens ?? 0)).toLocaleString()} tok</div>
                </div>
                <div
                  className="w-full rounded-t-sm"
                  style={{ height, background: "#a78bfa", opacity: (d.cost_usd ?? 0) === 0 ? 0.08 : 0.65 }}
                />
                {showLabel && (
                  <span className="text-[9px] text-base-content/25 mt-1 leading-none">{d.day.slice(5)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  lists, workflows, listId, workflowId, onListChange, onWorkflowChange,
}: {
  lists: { id: string; name: string }[];
  workflows: { id: string; name: string }[];
  listId: string;
  workflowId: string;
  onListChange: (id: string) => void;
  onWorkflowChange: (id: string) => void;
}) {
  const hasFilter = listId || workflowId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RiFilterLine size={13} className="text-primary shrink-0 hidden sm:block" />
      <select
        value={listId}
        onChange={(e) => { onListChange(e.target.value); if (e.target.value) onWorkflowChange(""); }}
        className={`h-8 px-3 rounded-full text-xs border transition-colors focus:outline-none cursor-pointer ${
          listId
            ? "border-transparent bg-primary text-primary-content font-medium"
            : "border-base-300 bg-base-100 text-base-content/55 hover:border-primary/40"
        }`}
      >
        <option value="">All lists</option>
        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <select
        value={workflowId}
        onChange={(e) => { onWorkflowChange(e.target.value); if (e.target.value) onListChange(""); }}
        className={`h-8 px-3 rounded-full text-xs border transition-colors focus:outline-none cursor-pointer ${
          workflowId
            ? "border-transparent bg-primary text-primary-content font-medium"
            : "border-base-300 bg-base-100 text-base-content/55 hover:border-primary/40"
        }`}
      >
        <option value="">All campaigns</option>
        {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {hasFilter && (
        <button
          type="button"
          onClick={() => { onListChange(""); onWorkflowChange(""); }}
          className="h-8 px-3 rounded-full text-xs text-base-content/45 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [hasPremium, setHasPremium] = useState(true);
  const [error, setError] = useState(false);
  const [days, setDays] = useState(7);
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [listId, setListId] = useState("");
  const [workflowId, setWorkflowId] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((accounts: AccountRow[]) => {
        const auth = accounts.find((a) => a.is_authenticated === 1);
        if (auth) setAccount(auth);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/premium-status").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setHasPremium(!!d.hasPremium); }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ days: String(days) });
    if (listId) params.set("list_id", listId);
    if (workflowId) params.set("workflow_id", workflowId);

    Promise.all([
      fetch(`/api/dashboard/stats?${params}`).then((r) => r.json()),
      fetch(`/api/dashboard/agent-stats?days=${days}`).then((r) => r.json()),
    ])
      .then(([s, a]) => { if (!cancelled) { setStats(s); setAgentStats(a); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [days, listId, workflowId]);

  if (error) {
    return (
      <div className="surface p-6 text-center">
        <p className="text-error text-sm font-medium">Could not load the dashboard.</p>
        <p className="text-base-content/40 text-xs mt-1">Check your connection and try refreshing the page.</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-base-content/40 text-sm py-12 justify-center">
        <span className="loading loading-spinner loading-xs" />
        Loading your numbers…
      </div>
    );
  }

  const { totals, today } = stats;
  const acceptanceRate = totals.connections_requested > 0
    ? Math.round((totals.connected / totals.connections_requested) * 100) : 0;
  const replyRate = totals.messages_sent > 0
    ? Math.round((totals.replies_received / totals.messages_sent) * 100) : 0;
  const emailReplyRate = totals.emails_sent > 0
    ? Math.round((totals.email_replies / totals.emails_sent) * 100) : 0;
  const maxFunnelValue = totals.total_targets;

  return (
    <>
      <Head>
        <title>Dashboard — Linki</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="space-y-5">
        {/* Header */}
        <div className="hq-header">
          <div className="hq-header-accent" aria-hidden="true" />
          <div className="hq-header-main">
            <div>
              <div className="flex items-center gap-2">
                <h1>Dashboard</h1>
              </div>
              <p className="hq-header-sub">Your outreach at a glance — LinkedIn, email, and replies in one place.</p>
            </div>
            <div className="hq-header-badges" data-tour="dashboard-filters">
              <span className="hq-header-today">Today</span>
              <span className="hq-chip"><b><Counter value={today.visits_today} /></b> visits</span>
              <span className="hq-chip"><b><Counter value={today.connections_today} /></b> connects</span>
              <span className="hq-chip"><b><Counter value={today.messages_today} /></b> messages</span>
              <span className="hq-chip"><b><Counter value={today.inmails_today} /></b> inmails</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="hq-card p-3 sm:p-3.5">
          <FilterBar
            lists={stats.lists}
            workflows={stats.workflows}
            listId={listId}
            workflowId={workflowId}
            onListChange={setListId}
            onWorkflowChange={setWorkflowId}
          />
        </div>

        {/* Overview — top-line totals across every channel */}
        <div>
          <SectionLabel icon={<FiActivity size={11} />} label="Overview" color="var(--hq-primary)" />
          <div className="hq-overview-grid">
            <KpiCard label="Total targets" value={totals.total_targets} color="#808080" icon={<FiTarget size={13} />} />
            <KpiCard label="Connected" value={totals.connected} color="#22c55e" icon={<FiUserPlus size={13} />} />
            <KpiCard
              label="Total replies"
              value={totals.replies_received + totals.email_replies}
              color="#a78bfa"
              icon={<RiReplyLine size={13} />}
            />
            <KpiCard
              label="Active campaigns"
              value={totals.active_runs}
              color="#f59e0b"
              icon={<FiActivity size={13} />}
              pulse={totals.active_runs > 0}
            />
          </div>
        </div>

        {/* Tasks & inbox */}
        {stats.crm && (
          <div>
            <SectionLabel icon={<FiCheckSquare size={11} />} label="Tasks & inbox" color="var(--hq-primary)" />
            <TaskStrip crm={stats.crm} />
          </div>
        )}

        {/* Channel performance */}
        <div>
          <SectionLabel icon={<FiUsers size={11} />} label="Channel performance" color="var(--hq-primary)" />
          <div className="hq-channel-grid">
            <ChannelCard
              title="LinkedIn"
              icon={<RiLinkedinBoxLine size={16} />}
              color="#60a5fa"
              stats={[
                { icon: <FiEye size={11} />, label: "Profiles visited", value: totals.connections_requested, color: "#60a5fa" },
                { icon: <FiUserPlus size={11} />, label: "Connections sent", value: totals.connections_requested, color: "#22c55e" },
                { icon: <FiMessageSquare size={11} />, label: "Messages sent", value: totals.messages_sent, color: "#f59e0b" },
                { icon: <RiLinkedinBoxLine size={11} />, label: "InMails sent", value: totals.inmails_sent, color: "#e879f9" },
              ]}
              rate={{
                label: "Connection acceptance",
                value: acceptanceRate,
                sub: `${totals.connected} of ${totals.connections_requested} connection requests accepted`,
              }}
            >
              <RateBar
                label="Reply rate"
                value={replyRate}
                sub={`${totals.replies_received} replies on ${totals.messages_sent} messages sent`}
                color="#c084fc"
              />
            </ChannelCard>

            <ChannelCard
              title="Email"
              icon={<RiMailSendLine size={16} />}
              color="#fb923c"
              stats={[
                { icon: <FiUsers size={11} />, label: "Total targets", value: totals.total_targets, color: "#808080" },
                { icon: <FiUserPlus size={11} />, label: "Connected", value: totals.connected, color: "#22c55e" },
                { icon: <RiMailSendLine size={11} />, label: "Emails sent", value: totals.emails_sent, color: "#fb923c" },
                { icon: <RiReplyLine size={11} />, label: "Email replies", value: totals.email_replies, color: "#22c55e" },
              ]}
              rate={{
                label: "Email reply rate",
                value: emailReplyRate,
                sub: `${totals.email_replies} replies on ${totals.emails_sent} emails sent`,
              }}
            />
          </div>
        </div>

        {/* Funnel + Chart */}
        <div className="dash-split">
          <div className="space-y-3">
            <div className="hq-card overflow-hidden" data-tour="dashboard-funnel">
              <div className="px-4 py-2.5 border-b border-base-300/30">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--hq-primary)" }}>Funnel</span>
              </div>
              <div className="divide-y divide-base-300/20 py-1">
                <FunnelRow icon={<FiUsers size={11} />} color="#808080" label="Targets" value={totals.total_targets} max={maxFunnelValue} />
                <FunnelRow icon={<FiUserPlus size={11} />} color="#22c55e" label="Connected" value={totals.connected} max={maxFunnelValue} />
                <FunnelRow icon={<FiRepeat size={11} />} color="#c084fc" label="LI replies" value={totals.replies_received} max={maxFunnelValue} />
                <FunnelRow icon={<RiMailSendLine size={11} />} color="#fb923c" label="Emails sent" value={totals.emails_sent} max={maxFunnelValue} />
                <FunnelRow icon={<RiReplyLine size={11} />} color="#22c55e" label="Email replies" value={totals.email_replies} max={maxFunnelValue} />
              </div>
            </div>

            <LinkedInCard
              accountId={account?.id}
              cachedStats={
                account?.li_connections != null
                  ? {
                      connections: account.li_connections!,
                      pending: account.li_pending!,
                      profile_views: account.li_profile_views!,
                    }
                  : null
              }
              cachedSyncedAt={account?.li_stats_synced_at}
            />

            {hasPremium && agentStats && <AiUsagePanel data={agentStats.daily} days={days} />}
          </div>

          <ActivityChart data={stats.activity} days={days} onDaysChange={setDays} />
        </div>
      </div>
    </>
  );
}
