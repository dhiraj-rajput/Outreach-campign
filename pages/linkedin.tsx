import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RiLinkedinBoxLine,
  RiUserAddLine,
  RiUserFollowLine,
  RiMessage2Line,
  RiForbidLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
} from "react-icons/ri";

interface Totals {
  connections_sent: number;
  connections_accepted: number;
  messages_sent: number;
  inmails_sent: number;
  replies_received: number;
  opted_out: number;
}

interface CampaignRow {
  workflow_id: string;
  workflow_name: string;
  run_count: number;
  connections_sent: number;
  connections_accepted: number;
  messages_sent: number;
  inmails_sent: number;
  replies: number;
  last_activity_at: string | null;
}

interface ActivityRow {
  id: string;
  message: string;
  created_at: string;
  target_id: string | null;
  full_name: string | null;
  company: string | null;
  workflow_name: string | null;
}

interface OptedOutRow {
  id: string;
  full_name: string | null;
  company: string | null;
  email: string | null;
  li_intent: string;
  li_intent_at: string | null;
}

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Kpi({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-base-200 border border-base-300/50 rounded-xl p-4 flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1a`, color }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none">{value.toLocaleString()}</p>
        <p className="text-[11px] text-base-content/40 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

export default function LinkedInHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [optedOut, setOptedOut] = useState<OptedOutRow[]>([]);
  const [tab, setTab] = useState<"activity" | "optedout">("activity");

  useEffect(() => {
    fetch("/api/linkedin/history")
      .then((r) => r.json())
      .then((d) => {
        setTotals(d.totals);
        setCampaigns(d.campaigns ?? []);
        setActivity(d.activity ?? []);
        setOptedOut(d.optedOut ?? []);
      })
      .catch(() => toast.error("Failed to load LinkedIn history"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Head>
        <title>LinkedIn — Linki</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-base-content flex items-center gap-2">
            <RiLinkedinBoxLine className="text-base-content/40" /> LinkedIn
          </h1>
          <p className="text-sm text-base-content/40 mt-0.5">
            Dedicated history of every LinkedIn campaign — connects, messages, replies — and who&apos;s opted out.
          </p>
        </div>

        {loading || !totals ? (
          <div className="flex items-center justify-center py-24">
            <span className="loading loading-spinner loading-sm text-base-content/40" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <Kpi label="Connections sent" value={totals.connections_sent} icon={<RiUserAddLine size={16} />} color="#5aa2ff" />
              <Kpi label="Connections accepted" value={totals.connections_accepted} icon={<RiUserFollowLine size={16} />} color="#32d583" />
              <Kpi label="Messages / InMails sent" value={totals.messages_sent + totals.inmails_sent} icon={<RiMessage2Line size={16} />} color="#f4b740" />
              <Kpi label="Opted out" value={totals.opted_out} icon={<RiForbidLine size={16} />} color="#f87171" />
            </div>

            {/* Campaign success table */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-3">Campaign performance</p>
              {campaigns.length === 0 ? (
                <p className="text-sm text-base-content/40">No LinkedIn campaign activity yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-base-content/40 uppercase tracking-wide">
                      <th className="pb-2 font-medium">Campaign</th>
                      <th className="pb-2 font-medium">Connects sent</th>
                      <th className="pb-2 font-medium">Accepted</th>
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
                          <td className="py-2">
                            <Link href={`/workflows/${c.workflow_id}`} className="hover:text-primary transition-colors font-medium">
                              {c.workflow_name}
                            </Link>
                          </td>
                          <td className="py-2">{c.connections_sent}</td>
                          <td className="py-2 text-success">{c.connections_accepted} <span className="text-base-content/30">({acceptRate}%)</span></td>
                          <td className="py-2">{c.messages_sent + c.inmails_sent}</td>
                          <td className="py-2 text-primary">{c.replies}</td>
                          <td className="py-2 text-base-content/40">{fmt(c.last_activity_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Tabs: Activity / Opted out */}
            <div className="bg-base-200 border border-base-300/50 rounded-xl p-5">
              <div className="flex items-center gap-1 mb-4 bg-base-300/50 rounded-lg p-0.5 w-fit">
                <button
                  onClick={() => setTab("activity")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "activity" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}
                >
                  Recent activity
                </button>
                <button
                  onClick={() => setTab("optedout")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${tab === "optedout" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}
                >
                  Opted out <span className="text-error">({optedOut.length})</span>
                </button>
              </div>

              {tab === "activity" ? (
                activity.length === 0 ? (
                  <p className="text-sm text-base-content/40">No LinkedIn activity yet.</p>
                ) : (
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
                          <Link href={`/contacts/${o.id}`} className="hover:text-primary transition-colors font-medium">
                            {o.full_name ?? "—"}
                          </Link>
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
      </div>
    </>
  );
}
